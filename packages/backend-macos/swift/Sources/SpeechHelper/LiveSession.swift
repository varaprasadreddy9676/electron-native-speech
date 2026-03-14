import Speech
import AVFoundation

/// Manages one live microphone recognition session.
///
/// AVAudioEngine captures mic audio and feeds raw PCM buffers directly into
/// SFSpeechAudioBufferRecognitionRequest — no file I/O, minimal latency.
final class LiveSession {
    let sessionId: String
    private let locale: Locale
    private let interimResults: Bool
    private let continuous: Bool

    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var sessionStartMs: Double = 0

    private var isStopping = false
    private var isStopped = false

    init(sessionId: String, locale: Locale, interimResults: Bool, continuous: Bool) {
        self.sessionId = sessionId
        self.locale = locale
        self.interimResults = interimResults
        self.continuous = continuous
    }

    func start() {
        sendEvent(id: sessionId, event: "state", payload: ["state": "starting"])

        let speechStatus = SFSpeechRecognizer.authorizationStatus()
        guard speechStatus == .authorized else {
            emitError(
                code: "permission-denied",
                message: "Speech recognition permission denied"
            )
            return
        }

        let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
        if micStatus == .authorized {
            DispatchQueue.global(qos: .userInteractive).async {
                self.startRecognition()
            }
            return
        }

        guard micStatus == .notDetermined else {
            emitError(code: "permission-denied", message: "Microphone permission denied")
            return
        }

        AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
            guard let self else { return }
            guard granted else {
                self.emitError(code: "permission-denied", message: "Microphone permission denied")
                return
            }
            DispatchQueue.global(qos: .userInteractive).async {
                self.startRecognition()
            }
        }
    }

    private func startRecognition() {
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            emitError(code: "unsupported-locale", message: "Locale not supported: \(locale.identifier)")
            return
        }
        self.recognizer = recognizer

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = interimResults
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = false // server for live = more accurate
        }
        if continuous {
            request.taskHint = .dictation
        } else {
            request.taskHint = .unspecified
        }
        self.recognitionRequest = request

        let engine = AVAudioEngine()
        self.audioEngine = engine

        let inputNode = engine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        // Guard against an invalid format — happens when mic permission hasn't been
        // granted to the responsible Electron process, or no audio input device exists.
        // installTap with 0 channels/Hz throws an NSException (SIGABRT); check first.
        guard recordingFormat.sampleRate > 0, recordingFormat.channelCount > 0 else {
            emitError(
                code: "permission-denied",
                message: "Microphone is not accessible. Grant microphone access to the app in System Settings → Privacy & Security → Microphone, then try again."
            )
            return
        }

        // Install a tap — the callback fires on AVAudioEngine's internal thread
        // with very low latency (typically 10–20ms buffer sizes)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        do {
            try engine.start()
        } catch {
            emitError(code: "backend-failure", message: "AVAudioEngine failed to start: \(error.localizedDescription)")
            return
        }

        sessionStartMs = Double(Date().timeIntervalSince1970 * 1000)

        self.recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }

            if let error = error {
                if self.isStopping || self.isStopped { return }
                let nsErr = error as NSError
                // Code 1110 = recognition cancelled (expected on stop)
                if nsErr.code == 1110 { return }
                self.emitError(code: "backend-failure", message: error.localizedDescription)
                return
            }

            guard let result else { return }

            let isFinal = result.isFinal
            let best = result.bestTranscription

            // Build result — use the last segment's timestamp for the result timestamp
            let ts = (best.segments.last.map { $0.timestamp } ?? 0) * 1000
            let confidence = best.segments.last.map { Double($0.confidence) }

            let liveResult: [String: Any] = {
                var r: [String: Any] = [
                    "text": best.formattedString,
                    "isFinal": isFinal,
                    "timestampMs": Int(ts),
                ]
                if let c = confidence, c > 0 { r["confidence"] = c }
                return r
            }()

            sendEvent(id: self.sessionId, event: "result", payload: ["result": liveResult])

            if isFinal && !self.continuous {
                self.stopInternal()
            }
        }

        sendEvent(id: sessionId, event: "state", payload: ["state": "listening"])
    }

    func stop() {
        guard !isStopping && !isStopped else { return }
        isStopping = true
        sendEvent(id: sessionId, event: "state", payload: ["state": "stopping"])
        stopInternal()
    }

    func abort() {
        isStopping = true
        isStopped = true
        teardown()
        sendEvent(id: sessionId, event: "stopped")
    }

    private func stopInternal() {
        // End the audio input — recognition task will receive remaining buffered audio
        recognitionRequest?.endAudio()
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        recognitionTask?.finish()

        // Give the recognizer a moment to deliver the final result
        DispatchQueue.global(qos: .userInteractive).asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.teardown()
            self?.sendEvent(id: self?.sessionId ?? "", event: "stopped")
        }
    }

    private func teardown() {
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        audioEngine?.stop()
        audioEngine = nil
        recognizer = nil
        isStopped = true
    }

    private func emitError(code: String, message: String) {
        sendEvent(id: sessionId, event: "error", payload: [
            "error": ["code": code, "message": message]
        ])
    }

    private func sendEvent(id: String, event: String, payload: [String: Any] = [:]) {
        // Use the module-level sendEvent
        SpeechHelper.sendEvent(id: id, event: event, payload: payload)
    }
}

// MARK: - Session registry

private var activeSessions: [String: LiveSession] = [:]
private let sessionsLock = NSLock()

func handleStartSession(id: String, command: [String: Any]) {
    let localeStr = command["locale"] as? String ?? Locale.current.identifier
    let interimResults = command["interimResults"] as? Bool ?? true
    let continuous = command["continuous"] as? Bool ?? false

    let session = LiveSession(
        sessionId: id,
        locale: Locale(identifier: localeStr),
        interimResults: interimResults,
        continuous: continuous
    )

    sessionsLock.lock()
    activeSessions[id] = session
    sessionsLock.unlock()

    session.start()
}

func handleStopSession(command: [String: Any]) {
    guard let sessionId = command["sessionId"] as? String else { return }
    sessionsLock.lock()
    let session = activeSessions[sessionId]
    sessionsLock.unlock()
    session?.stop()
}

func handleAbortSession(command: [String: Any]) {
    guard let sessionId = command["sessionId"] as? String else { return }
    sessionsLock.lock()
    let session = activeSessions.removeValue(forKey: sessionId)
    sessionsLock.unlock()
    session?.abort()
}

func cleanupAllSessions() {
    sessionsLock.lock()
    let all = activeSessions.values
    activeSessions.removeAll()
    sessionsLock.unlock()
    for s in all { s.abort() }
}

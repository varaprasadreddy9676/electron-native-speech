import Speech
import AVFoundation

// Formats SFSpeechRecognizer can handle directly without conversion
private let nativeFormats: Set<String> = ["m4a", "mp3", "wav", "aiff", "aac", "caf", "mp4", "mov", "m4v"]

func handleTranscribeFile(id: String, command: [String: Any]) {
    guard let filePath = command["filePath"] as? String else {
        sendError(id: id, code: "unsupported-input", message: "filePath is required")
        return
    }

    let localeStr = command["locale"] as? String ?? Locale.current.identifier
    let fileURL = URL(fileURLWithPath: filePath)

    guard FileManager.default.fileExists(atPath: filePath) else {
        sendError(id: id, code: "unsupported-input", message: "File not found: \(filePath)")
        return
    }

    // Set up the recognizer first — fast fail on locale/availability
    let locale = Locale(identifier: localeStr)
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
        sendError(id: id, code: "unsupported-locale", message: "Locale not supported: \(localeStr)")
        return
    }
    guard recognizer.isAvailable else {
        sendError(id: id, code: "unavailable", message: "Speech recognizer is not available right now")
        return
    }

    let authStatus = SFSpeechRecognizer.authorizationStatus()
    guard authStatus == .authorized else {
        sendError(
            id: id,
            code: "permission-denied",
            message: "Speech recognition permission denied. Enable in System Settings → Privacy & Security → Speech Recognition."
        )
        return
    }

    // ── Resolve the URL we'll pass to SFSpeechRecognizer ─────────────────────
    // Priority:
    //   1. Native format → use directly (zero overhead)
    //   2. AVFoundation can export it → convert to temporary m4a
    //   3. ffmpeg available → convert via ffmpeg (handles WebM+Opus, OGG, etc.)
    //   4. Error with actionable message

    let ext = fileURL.pathExtension.lowercased()
    var recognitionURL: URL
    var tempURL: URL? = nil

    if nativeFormats.contains(ext) {
        // Fast path: validate audio track presence directly
        guard hasAudioTrack(at: fileURL) else {
            sendError(id: id, code: "missing-audio-track", message: "No audio track found in: \(filePath)")
            return
        }
        recognitionURL = fileURL
    } else {
        // Try AVFoundation export first (works for formats AVFoundation can decode: e.g. some mp4 variants)
        sendLog(level: "info", message: "Format \"\(ext)\" needs preparation, trying AVFoundation export...")
        if let converted = convertViaAVFoundation(sourceURL: fileURL) {
            recognitionURL = converted
            tempURL = converted
            sendLog(level: "info", message: "AVFoundation export succeeded")
        } else if let ffmpegURL = findFfmpeg(), let converted = convertViaFfmpeg(sourceURL: fileURL, ffmpegURL: ffmpegURL) {
            // Fallback: ffmpeg handles WebM+Opus, OGG Vorbis, and most other containers
            recognitionURL = converted
            tempURL = converted
            sendLog(level: "info", message: "ffmpeg conversion succeeded")
        } else {
            sendError(
                id: id,
                code: "unsupported-input",
                message: """
                Cannot read audio from "\(ext)" file. \
                Supported natively: \(nativeFormats.sorted().joined(separator: ", ")). \
                For WebM/Opus files (Electron MediaRecorder default), install ffmpeg: brew install ffmpeg, \
                or record with mimeType "audio/mp4" instead.
                """
            )
            return
        }
    }

    defer { tempURL.map { try? FileManager.default.removeItem(at: $0) } }

    // Build and run the recognition request
    let request = SFSpeechURLRecognitionRequest(url: recognitionURL)
    request.shouldReportPartialResults = false
    if recognizer.supportsOnDeviceRecognition {
        request.requiresOnDeviceRecognition = true
    }

    let doneSema = DispatchSemaphore(value: 0)
    var segments: [[String: Any]] = []
    var durationMs: Double? = nil
    var recognitionError: Error? = nil
    let startTime = Date()

    recognizer.recognitionTask(with: request) { result, error in
        if let error = error {
            recognitionError = error
            doneSema.signal()
            return
        }
        guard let result = result else { return }
        if result.isFinal {
            let best = result.bestTranscription
            segments = best.segments.enumerated().map { idx, seg in
                var item: [String: Any] = [
                    "id": String(idx),
                    "startMs": Int(seg.timestamp * 1000),
                    "endMs": Int((seg.timestamp + seg.duration) * 1000),
                    "text": seg.substring,
                ]
                if seg.confidence > 0 { item["confidence"] = Double(seg.confidence) }
                return item
            }
            if let last = best.segments.last {
                durationMs = (last.timestamp + last.duration) * 1000
            }
            doneSema.signal()
        }
    }

    doneSema.wait()

    if let err = recognitionError {
        let nsErr = err as NSError
        if nsErr.code == 203 || nsErr.localizedDescription.lowercased().contains("no speech") {
            sendError(id: id, code: "no-speech-detected", message: "No speech detected in the file")
        } else {
            sendError(id: id, code: "backend-failure", message: err.localizedDescription)
        }
        return
    }

    var payload: [String: Any] = ["segments": segments, "locale": localeStr]
    if let dur = durationMs { payload["durationMs"] = dur }

    let elapsed = Int(Date().timeIntervalSince(startTime) * 1000)
    sendLog(level: "info", message: "Transcription complete: \(elapsed)ms, \(segments.count) segments")
    sendResult(id: id, payload: payload)
}

// MARK: - Audio Track Validation

private func hasAudioTrack(at url: URL) -> Bool {
    let asset = AVURLAsset(url: url)
    let sema = DispatchSemaphore(value: 0)
    var has = false
    asset.loadTracks(withMediaType: .audio) { tracks, _ in
        has = !(tracks ?? []).isEmpty
        sema.signal()
    }
    sema.wait()
    return has
}

// MARK: - AVFoundation Conversion (handles formats AVFoundation can decode)

private func convertViaAVFoundation(sourceURL: URL) -> URL? {
    let asset = AVURLAsset(url: sourceURL)

    // Check if AVFoundation can see any tracks at all
    let sema0 = DispatchSemaphore(value: 0)
    var trackCount = 0
    asset.loadTracks(withMediaType: .audio) { tracks, _ in
        trackCount = tracks?.count ?? 0
        sema0.signal()
    }
    sema0.wait()
    guard trackCount > 0 else { return nil }

    let tempURL = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
        .appendingPathExtension("m4a")

    guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
        return nil
    }
    export.outputURL = tempURL
    export.outputFileType = .m4a

    let sema = DispatchSemaphore(value: 0)
    export.exportAsynchronously { sema.signal() }
    sema.wait()

    if export.status == .completed { return tempURL }
    try? FileManager.default.removeItem(at: tempURL)
    return nil
}

// MARK: - ffmpeg Conversion (handles WebM+Opus, OGG, and other containers)

private func findFfmpeg() -> URL? {
    let candidates = [
        "/opt/homebrew/bin/ffmpeg",  // Homebrew on Apple Silicon
        "/usr/local/bin/ffmpeg",      // Homebrew on Intel
        "/usr/bin/ffmpeg",
    ]
    for path in candidates {
        if FileManager.default.isExecutableFile(atPath: path) {
            return URL(fileURLWithPath: path)
        }
    }
    // Try PATH via which
    let result = runCommand("/usr/bin/which", args: ["ffmpeg"])
    if let path = result?.trimmingCharacters(in: .whitespacesAndNewlines), !path.isEmpty {
        return URL(fileURLWithPath: path)
    }
    return nil
}

private func convertViaFfmpeg(sourceURL: URL, ffmpegURL: URL) -> URL? {
    let tempURL = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString)
        .appendingPathExtension("m4a")

    // -vn: drop video, -ac 1: mono (smaller, faster), -ar 16000: 16kHz (Speech framework sweet spot)
    let args = [
        "-i", sourceURL.path,
        "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "aac", "-b:a", "64k",
        "-y", tempURL.path
    ]

    let exitCode = runCommandWithExitCode(ffmpegURL.path, args: args)
    if exitCode == 0 && FileManager.default.fileExists(atPath: tempURL.path) {
        return tempURL
    }
    try? FileManager.default.removeItem(at: tempURL)
    return nil
}

// MARK: - Shell Helpers

private func runCommand(_ path: String, args: [String]) -> String? {
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: path)
    proc.arguments = args
    let pipe = Pipe()
    proc.standardOutput = pipe
    proc.standardError = Pipe()
    try? proc.run()
    proc.waitUntilExit()
    return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
}

@discardableResult
private func runCommandWithExitCode(_ path: String, args: [String]) -> Int32 {
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: path)
    proc.arguments = args
    proc.standardOutput = Pipe()
    proc.standardError = Pipe()
    try? proc.run()
    proc.waitUntilExit()
    return proc.terminationStatus
}

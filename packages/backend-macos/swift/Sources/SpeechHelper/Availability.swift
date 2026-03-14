import Speech
import AVFoundation

func handleCheckAvailability(id: String) {
    // Check authorization status without triggering a prompt
    let authStatus = SFSpeechRecognizer.authorizationStatus()
    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)

    switch authStatus {
    case .denied, .restricted:
        sendResult(id: id, payload: [
            "available": false,
            "platform": "darwin",
            "reason": "Speech recognition permission denied. Enable it in System Settings → Privacy & Security → Speech Recognition.",
        ])
        return
    default:
        break
    }

    // Check if a recognizer is available for the default locale
    guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else {
        sendResult(id: id, payload: [
            "available": false,
            "platform": "darwin",
            "reason": "SFSpeechRecognizer is not available on this device.",
        ])
        return
    }

    // Both file and live are supported on macOS 13+
    let micAvailable = micStatus == .authorized || micStatus == .notDetermined
    sendResult(id: id, payload: [
        "available": true,
        "platform": "darwin",
        "mode": micAvailable ? "both" : "file",
        "recognizerLocale": recognizer.locale.identifier,
    ])
}

/// Request speech recognition authorization and return the status.
/// This WILL trigger a system permission prompt if status is .notDetermined.
func requestSpeechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
    await withCheckedContinuation { continuation in
        SFSpeechRecognizer.requestAuthorization { status in
            continuation.resume(returning: status)
        }
    }
}

/// Request microphone authorization.
func requestMicAuthorization() async -> Bool {
    await withCheckedContinuation { continuation in
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            continuation.resume(returning: granted)
        }
    }
}

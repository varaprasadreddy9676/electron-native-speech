import Foundation

// SpeechHelper — persistent helper process for electron-native-speech
//
// Lifecycle:
//   1. Starts up, emits { "type": "ready" }
//   2. Reads newline-delimited JSON commands from stdin
//   3. Writes newline-delimited JSON responses to stdout
//   4. Runs until "shutdown" command or stdin EOF

sendReady()

// File transcription runs on a background thread pool
// Live sessions use their own AVAudioEngine + recognition task threads
// Command dispatch is intentionally synchronous for file transcription
// and async (fire-and-return) for live sessions

readCommands { command in
    guard let cmd = command["command"] as? String else { return }
    let id = command["id"] as? String ?? ""

    switch cmd {
    case "checkAvailability":
        // Quick check — run inline
        handleCheckAvailability(id: id)

    case "transcribeFile":
        // File transcription can take seconds — run on a background thread
        // so we can continue reading commands (e.g. for shutdown)
        DispatchQueue.global(qos: .userInitiated).async {
            handleTranscribeFile(id: id, command: command)
        }

    case "startSession":
        // Live session setup is async internally
        handleStartSession(id: id, command: command)

    case "stopSession":
        handleStopSession(command: command)

    case "abortSession":
        handleAbortSession(command: command)

    case "shutdown":
        cleanupAllSessions()
        exit(0)

    default:
        if !id.isEmpty {
            sendError(id: id, code: "unknown", message: "Unknown command: \(cmd)")
        }
    }
}

// Keep the run loop alive for async work (live sessions, background transcription)
RunLoop.main.run()

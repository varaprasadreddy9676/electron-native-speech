import Foundation
import Speech

// SpeechHelper — persistent helper process for electron-native-speech
//
// Lifecycle:
//   1. Starts up, emits { "type": "ready" }
//   2. Reads newline-delimited JSON commands from stdin
//   3. Writes newline-delimited JSON responses to stdout
//   4. Runs until "shutdown" command or stdin EOF

if CommandLine.arguments.contains("--request-speech-auth") {
    let args = Array(CommandLine.arguments.dropFirst())
    let resultFilePath = args.drop { $0 != "--result-file" }.dropFirst().first

    guard let resultFilePath else {
        fputs("Missing --result-file for --request-speech-auth\n", stderr)
        exit(2)
    }

    // IMPORTANT: Do NOT block the main thread with a semaphore here.
    // SFSpeechRecognizer.requestAuthorization dispatches its completion handler
    // to the main queue. Blocking the main thread with authSema.wait() prevents
    // the callback from ever running → deadlock → SIGABRT on macOS 15.
    // Instead, kick off the request and let RunLoop.main.run() process the callback.
    SFSpeechRecognizer.requestAuthorization { status in
        writeAuthorizationResult(filePath: resultFilePath, status: status)
        exit(status == .authorized ? 0 : 1)
    }

    RunLoop.main.run()   // keeps process alive until exit() is called in the callback above
    // Never reached:
}

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

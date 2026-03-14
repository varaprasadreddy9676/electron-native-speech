import Foundation
import AppKit
import Speech

// SpeechHelper — persistent helper process for electron-native-speech
//
// Lifecycle:
//   1. Starts up either over stdio (legacy/dev) or a localhost socket (app mode)
//   2. Emits { "type": "ready" } once the transport is connected
//   3. Reads newline-delimited JSON commands
//   4. Writes newline-delimited JSON responses
//   5. Runs until "shutdown" command or transport EOF

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

func dispatchCommand(_ command: [String: Any]) {
    guard let cmd = command["command"] as? String else { return }
    let id = command["id"] as? String ?? ""

    switch cmd {
    case "checkAvailability":
        handleCheckAvailability(id: id)

    case "requestSpeechAuth":
        Task { @MainActor in
            let status = await requestSpeechAuthorization()
            sendResult(id: id, payload: [
                "authorized": status == .authorized,
                "status": authorizationStatusString(status),
            ])
        }

    case "transcribeFile":
        DispatchQueue.global(qos: .userInitiated).async {
            handleTranscribeFile(id: id, command: command)
        }

    case "startSession":
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

let args = Array(CommandLine.arguments.dropFirst())
let port = args.drop { $0 != "--port" }.dropFirst().first.flatMap(UInt16.init)

if let port {
    do {
        try startSocketTransport(port: port, handler: dispatchCommand)
    } catch {
        fputs("Failed to start socket transport: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
} else {
    sendReady()
    readCommands(handler: dispatchCommand)
}

RunLoop.main.run()

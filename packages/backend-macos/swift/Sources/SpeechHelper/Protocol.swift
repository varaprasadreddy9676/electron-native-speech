/// Newline-delimited JSON protocol between Node.js and SpeechHelper.
///
/// Node → Helper (commands):
///   { "command": "checkAvailability", "id": "1" }
///   { "command": "transcribeFile", "id": "2", "filePath": "...", "locale": "en-US" }
///   { "command": "startSession", "id": "3", "locale": "en-US", "interimResults": true, "continuous": false }
///   { "command": "stopSession", "sessionId": "3" }
///   { "command": "abortSession", "sessionId": "3" }
///   { "command": "shutdown" }
///
/// Helper → Node (responses):
///   { "type": "ready" }
///   { "id": "1", "type": "result", ... }
///   { "id": "2", "type": "error", "code": "...", "message": "..." }
///   { "id": "3", "type": "event", "event": "state", "state": "listening" }
///   { "id": "3", "type": "event", "event": "result", "result": { ... } }
///   { "type": "log", "level": "debug", "message": "..." }

import Foundation

// MARK: - Output helpers

private let outputLock = NSLock()

func sendJSON(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let str = String(data: data, encoding: .utf8) else { return }
    outputLock.lock()
    print(str)
    fflush(stdout)
    outputLock.unlock()
}

func sendReady() {
    sendJSON(["type": "ready"])
}

func sendResult(id: String, payload: [String: Any]) {
    var obj = payload
    obj["id"] = id
    obj["type"] = "result"
    sendJSON(obj)
}

func sendError(id: String, code: String, message: String, details: Any? = nil) {
    var obj: [String: Any] = ["id": id, "type": "error", "code": code, "message": message]
    if let d = details { obj["details"] = d }
    sendJSON(obj)
}

func sendEvent(id: String, event: String, payload: [String: Any] = [:]) {
    var obj = payload
    obj["id"] = id
    obj["type"] = "event"
    obj["event"] = event
    sendJSON(obj)
}

func sendLog(level: String, message: String) {
    sendJSON(["type": "log", "level": level, "message": message])
}

// MARK: - Input reading

func readCommands(handler: @escaping ([String: Any]) -> Void) {
    let handle = FileHandle.standardInput
    var buffer = Data()

    handle.readabilityHandler = { fh in
        let chunk = fh.availableData
        if chunk.isEmpty {
            // EOF — Node process closed stdin, shut down
            exit(0)
        }
        buffer.append(chunk)
        // Process all complete newline-terminated messages
        while let newlineRange = buffer.range(of: Data([0x0A])) {
            let lineData = buffer.subdata(in: buffer.startIndex..<newlineRange.lowerBound)
            buffer.removeSubrange(buffer.startIndex...newlineRange.lowerBound)
            guard !lineData.isEmpty,
                  let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any]
            else { continue }
            handler(obj)
        }
    }
}

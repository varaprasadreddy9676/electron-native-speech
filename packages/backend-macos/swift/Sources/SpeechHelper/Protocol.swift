import Foundation
import Network

// MARK: - Output helpers

private let outputLock = NSLock()
private var socketListener: NWListener?
private var socketConnection: NWConnection?
private var socketBuffer = Data()

func sendJSON(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
    let payload = data + Data([0x0A])

    outputLock.lock()
    if let connection = socketConnection {
        connection.send(content: payload, completion: .contentProcessed { _ in })
    } else {
        FileHandle.standardOutput.write(payload)
        fflush(stdout)
    }
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

// MARK: - Socket transport

func startSocketTransport(port: UInt16, handler: @escaping ([String: Any]) -> Void) throws {
    let nwPort = NWEndpoint.Port(rawValue: port)!
    let listener = try NWListener(using: .tcp, on: nwPort)
    socketListener = listener

    listener.newConnectionHandler = { connection in
        socketConnection = connection
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                sendReady()
                receiveNextChunk(on: connection, handler: handler)
            case .failed(let error):
                sendLog(level: "error", message: "Socket connection failed: \(error.localizedDescription)")
                exit(1)
            case .cancelled:
                exit(0)
            default:
                break
            }
        }
        connection.start(queue: .main)
    }

    listener.stateUpdateHandler = { state in
        if case .failed(let error) = state {
            sendLog(level: "error", message: "Socket listener failed: \(error.localizedDescription)")
            exit(1)
        }
    }

    listener.start(queue: .main)
}

private func receiveNextChunk(on connection: NWConnection, handler: @escaping ([String: Any]) -> Void) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { data, _, isComplete, error in
        if let error {
            sendLog(level: "error", message: "Socket receive failed: \(error.localizedDescription)")
            exit(1)
        }

        if let data, !data.isEmpty {
            socketBuffer.append(data)
            processBufferedMessages(handler: handler)
        }

        if isComplete {
            exit(0)
        }

        receiveNextChunk(on: connection, handler: handler)
    }
}

private func processBufferedMessages(handler: @escaping ([String: Any]) -> Void) {
    while let newlineRange = socketBuffer.range(of: Data([0x0A])) {
        let lineData = socketBuffer.subdata(in: socketBuffer.startIndex..<newlineRange.lowerBound)
        socketBuffer.removeSubrange(socketBuffer.startIndex...newlineRange.lowerBound)
        guard !lineData.isEmpty,
              let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any]
        else { continue }
        handler(obj)
    }
}

// MARK: - Stdio transport

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

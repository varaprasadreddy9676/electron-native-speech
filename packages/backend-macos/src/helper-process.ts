import { spawn, ChildProcess } from "child_process"
import * as net from "net"
import * as path from "path"
import * as fs from "fs"
import { EventEmitter } from "events"

export type HelperMessage =
  | { id: string; type: "result"; [key: string]: unknown }
  | { id: string; type: "event"; event: string; [key: string]: unknown }
  | { id: string; type: "error"; code: string; message: string; details?: unknown }
  | { type: "ready" }
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string }

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

export class HelperProcess extends EventEmitter {
  private launcher: ChildProcess | null = null
  private socket: net.Socket | null = null
  private pending = new Map<string, PendingRequest>()
  private buffer = ""
  private _ready = false
  private _starting: Promise<void> | null = null
  private _idCounter = 0

  private get appPath(): string {
    const candidates = [
      (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
        ? path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!, "SpeechHelper.app")
        : null,
      path.join(__dirname, "..", "bin", "SpeechHelper.app"),
      path.join(__dirname, "..", "..", "bin", "SpeechHelper.app"),
    ].filter(Boolean) as string[]

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, "Contents", "MacOS", "SpeechHelper"))) {
        return candidate
      }
    }

    throw new Error("SpeechHelper.app not found. Reinstall electron-native-speech-backend-macos.")
  }

  start(): Promise<void> {
    if (this._ready) return Promise.resolve()
    if (this._starting) return this._starting

    this._starting = (async () => {
      const appPath = this.appPath
      const port = await getAvailablePort()

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const readyTimeout = setTimeout(() => {
          cleanup()
          reject(new Error("SpeechHelper did not become ready within 8 seconds"))
        }, 8000)

        const cleanup = () => {
          clearTimeout(readyTimeout)
          this.removeListener("ready", onReady)
        }

        const onReady = () => {
          if (settled) return
          settled = true
          cleanup()
          this._ready = true
          this._starting = null
          resolve()
        }

        this.once("ready", onReady)

        this.launcher = spawn("/usr/bin/open", ["-n", appPath, "--args", "--port", String(port)], {
          stdio: ["ignore", "ignore", "pipe"],
        })

        this.launcher.stderr?.setEncoding("utf8")
        this.launcher.stderr?.on("data", (chunk: string) => {
          for (const line of chunk.split("\n")) {
            if (line.trim()) {
              this.emit("log", { level: "debug", message: line.trim() })
            }
          }
        })

        this.launcher.once("error", (err) => {
          if (settled) return
          settled = true
          cleanup()
          this._starting = null
          reject(err)
        })

        this.launcher.once("exit", (code, signal) => {
          if (!settled && code !== 0) {
            settled = true
            cleanup()
            this._starting = null
            reject(new Error(`open exited early (code=${code}, signal=${signal})`))
          }
        })

        connectWithRetry(port, 8000)
          .then((socket) => {
            this.attachSocket(socket)
          })
          .catch((err) => {
            if (settled) return
            settled = true
            cleanup()
            this._starting = null
            reject(err)
          })
      })
    })()

    return this._starting
  }

  private attachSocket(socket: net.Socket): void {
    this.socket = socket
    socket.setEncoding("utf8")
    socket.on("data", (chunk: string) => {
      this.buffer += chunk
      const lines = this.buffer.split("\n")
      this.buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (line.trim()) this.handleMessage(line)
      }
    })

    socket.once("close", () => {
      this._ready = false
      this._starting = null
      this.socket = null
      for (const [, req] of this.pending) {
        clearTimeout(req.timeout)
        req.reject(new Error("SpeechHelper connection closed"))
      }
      this.pending.clear()
      this.emit("exit", null, "socket-closed")
    })

    socket.once("error", (err) => {
      this.emit("log", { level: "error", message: `SpeechHelper socket error: ${err.message}` })
    })
  }

  private handleMessage(line: string): void {
    let msg: HelperMessage
    try {
      msg = JSON.parse(line) as HelperMessage
    } catch {
      return
    }

    if (msg.type === "ready") {
      this.emit("ready")
      return
    }

    if (msg.type === "log") {
      this.emit("log", msg)
      return
    }

    if (msg.type === "event" && "id" in msg) {
      this.emit(`event:${msg.id}`, msg)
      return
    }

    if ("id" in msg && msg.id) {
      const pending = this.pending.get(msg.id)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pending.delete(msg.id)

      if (msg.type === "error") {
        pending.reject(msg)
      } else {
        pending.resolve(msg)
      }
    }
  }

  send(command: Record<string, unknown>, timeoutMs = 60_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this._ready || !this.socket) {
        reject(new Error("SpeechHelper is not running"))
        return
      }

      const id = String(++this._idCounter)
      const payload = JSON.stringify({ ...command, id }) + "\n"

      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`SpeechHelper command timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeout })
      this.socket.write(payload)
    })
  }

  sendStreaming(command: Record<string, unknown>): string {
    if (!this._ready || !this.socket) {
      throw new Error("SpeechHelper is not running")
    }

    const id = String(++this._idCounter)
    this.socket.write(JSON.stringify({ ...command, id }) + "\n")
    return id
  }

  sendControl(command: Record<string, unknown>): void {
    if (!this._ready || !this.socket) return
    this.socket.write(JSON.stringify(command) + "\n")
  }

  async dispose(): Promise<void> {
    if (!this.socket) return

    this.sendControl({ command: "shutdown" })

    await new Promise<void>((resolve) => {
      const socket = this.socket
      const timeout = setTimeout(() => {
        socket?.destroy()
        resolve()
      }, 2000)

      socket?.once("close", () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    this.socket = null
    this._ready = false
    this._starting = null
  }
}

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to determine available port")))
        return
      }

      const { port } = address
      server.close((err) => {
        if (err) reject(err)
        else resolve(port)
      })
    })
  })
}

function connectWithRetry(port: number, timeoutMs: number): Promise<net.Socket> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port })

      socket.once("connect", () => resolve(socket))
      socket.once("error", (err) => {
        socket.destroy()
        if (Date.now() - startedAt >= timeoutMs) {
          reject(err)
          return
        }
        setTimeout(attempt, 100)
      })
    }

    attempt()
  })
}

let _instance: HelperProcess | null = null

export function getHelperProcess(): HelperProcess {
  if (!_instance) _instance = new HelperProcess()
  return _instance
}

export async function disposeHelperProcess(): Promise<void> {
  if (_instance) {
    await _instance.dispose()
    _instance = null
  }
}

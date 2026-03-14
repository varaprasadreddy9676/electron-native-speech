import { spawn, ChildProcessWithoutNullStreams } from "child_process"
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

/**
 * Manages a single persistent SpeechHelper process.
 *
 * The process starts once and handles all requests for the lifetime of the
 * backend. This avoids per-call startup overhead (~200–400 ms cold start).
 *
 * Communication: newline-delimited JSON over stdin/stdout.
 */
export class HelperProcess extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<string, PendingRequest>()
  private buffer = ""
  private _ready = false
  private _starting: Promise<void> | null = null
  private _idCounter = 0

  private get binaryPath(): string {
    // In development: packages/backend-macos/bin/SpeechHelper
    // In packaged app: resources/SpeechHelper.app/Contents/MacOS/SpeechHelper
    // or resources/SpeechHelper (legacy binary-only layout)
    const candidates = [
      // packaged Electron app (process.resourcesPath is injected by Electron)
      (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
        ? path.join(
            (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!,
            "SpeechHelper.app",
            "Contents",
            "MacOS",
            "SpeechHelper"
          )
        : null,
      (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
        ? path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath!, "SpeechHelper")
        : null,
      path.join(__dirname, "..", "bin", "SpeechHelper.app", "Contents", "MacOS", "SpeechHelper"),
      // workspace development
      path.join(__dirname, "..", "bin", "SpeechHelper"),
      path.join(__dirname, "..", "..", "bin", "SpeechHelper.app", "Contents", "MacOS", "SpeechHelper"),
      // running from dist/
      path.join(__dirname, "..", "..", "bin", "SpeechHelper"),
    ].filter(Boolean) as string[]

    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }

    throw new Error(
      `SpeechHelper binary not found. Run: npm run build:swift (in packages/backend-macos)`
    )
  }

  /** Start the helper process. Idempotent — safe to call multiple times. */
  start(): Promise<void> {
    if (this._ready) return Promise.resolve()
    if (this._starting) return this._starting

    this._starting = new Promise<void>((resolve, reject) => {
      let binary: string
      try {
        binary = this.binaryPath
      } catch (err) {
        reject(err)
        return
      }

      this.proc = spawn(binary, [], {
        stdio: ["pipe", "pipe", "pipe"],
      })

      const readyTimeout = setTimeout(() => {
        reject(new Error("SpeechHelper did not become ready within 5 seconds"))
      }, 5000)

      this.proc.stdout.setEncoding("utf8")
      this.proc.stdout.on("data", (chunk: string) => {
        this.buffer += chunk
        const lines = this.buffer.split("\n")
        this.buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (line.trim()) this.handleMessage(line)
        }
      })

      this.proc.stderr.setEncoding("utf8")
      this.proc.stderr.on("data", (chunk: string) => {
        // Surface helper stderr as debug info only
        for (const line of chunk.split("\n")) {
          if (line.trim()) {
            this.emit("log", { level: "debug", message: line.trim() })
          }
        }
      })

      this.proc.once("spawn", () => {
        // Process spawned — wait for the ready message
      })

      this.proc.once("error", (err) => {
        clearTimeout(readyTimeout)
        this._starting = null
        reject(err)
      })

      this.proc.once("exit", (code, signal) => {
        this._ready = false
        this._starting = null
        this.proc = null
        // Reject any pending requests
        for (const [, req] of this.pending) {
          clearTimeout(req.timeout)
          req.reject(new Error(`SpeechHelper exited (code=${code}, signal=${signal})`))
        }
        this.pending.clear()
        this.emit("exit", code, signal)
      })

      this.once("ready", () => {
        clearTimeout(readyTimeout)
        this._ready = true
        this._starting = null
        resolve()
      })
    })

    return this._starting
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

    // Event messages are emitted to subscribers (live session events)
    if (msg.type === "event" && "id" in msg) {
      this.emit(`event:${msg.id}`, msg)
      return
    }

    // Result or error for a pending request
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

  /**
   * Send a command and wait for its response.
   * @param timeoutMs  Maximum wait time. Defaults to 60 s for file transcription.
   */
  send(command: Record<string, unknown>, timeoutMs = 60_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this._ready || !this.proc) {
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
      this.proc.stdin.write(payload)
    })
  }

  /**
   * Send a command that will produce streaming events rather than a single response.
   * Returns the request ID so the caller can subscribe to `event:<id>` emissions.
   */
  sendStreaming(command: Record<string, unknown>): string {
    if (!this._ready || !this.proc) {
      throw new Error("SpeechHelper is not running")
    }

    const id = String(++this._idCounter)
    const payload = JSON.stringify({ ...command, id }) + "\n"
    this.proc.stdin.write(payload)
    return id
  }

  /** Send a fire-and-forget control message (no response expected) */
  sendControl(command: Record<string, unknown>): void {
    if (!this._ready || !this.proc) return
    const payload = JSON.stringify(command) + "\n"
    this.proc.stdin.write(payload)
  }

  async dispose(): Promise<void> {
    if (!this.proc) return
    this.sendControl({ command: "shutdown" })
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.proc?.kill("SIGTERM")
        resolve()
      }, 2000)
      this.proc?.once("exit", () => {
        clearTimeout(t)
        resolve()
      })
    })
    this.proc = null
    this._ready = false
  }
}

// Singleton — one helper process for the lifetime of the main process
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

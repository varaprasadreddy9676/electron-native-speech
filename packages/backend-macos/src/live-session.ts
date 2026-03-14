import { EventEmitter } from "events"
import type {
  SpeechSession,
  SpeechSessionStartOptions,
  SpeechSessionState,
  LiveSpeechResult,
  SpeechError,
} from "electron-native-speech"
import { SpeechRecognitionError } from "electron-native-speech"
import { getHelperProcess, HelperMessage } from "./helper-process"
import { getMissingUsageDescriptionMessage } from "./macos-usage-descriptions"
import { ensureSpeechPermission } from "./speech-permission"

type SessionEventMessage = HelperMessage & {
  type: "event"
  event: "result" | "state" | "error" | "stopped"
  result?: LiveSpeechResult
  state?: SpeechSessionState
  error?: SpeechError
}

export class MacOSLiveSpeechSession implements SpeechSession {
  private emitter = new EventEmitter()
  private sessionId: string | null = null
  private unsubscribe: (() => void) | null = null
  private _state: SpeechSessionState = "idle"

  async start(options: SpeechSessionStartOptions = {}): Promise<void> {
    if (this._state !== "idle" && this._state !== "stopped") {
      throw new SpeechRecognitionError({
        code: "invalid-state",
        message: `Cannot start session in state "${this._state}"`,
      })
    }

    const speechUsageIssue = getMissingUsageDescriptionMessage("speech")
    if (speechUsageIssue) {
      throw new SpeechRecognitionError({ code: "backend-failure", message: speechUsageIssue })
    }

    const microphoneUsageIssue = getMissingUsageDescriptionMessage("microphone")
    if (microphoneUsageIssue) {
      throw new SpeechRecognitionError({ code: "backend-failure", message: microphoneUsageIssue })
    }

    this.setState("starting")

    const helper = getHelperProcess()
    await ensureSpeechPermission()
    await helper.start()

    // Send the start command and get back a streaming session ID
    const sessionId = helper.sendStreaming({
      command: "startSession",
      locale: options.locale ?? null,
      interimResults: options.interimResults ?? true,
      continuous: options.continuous ?? false,
    })

    this.sessionId = sessionId

    // Subscribe to events from the helper for this session
    const onEvent = (msg: SessionEventMessage) => {
      switch (msg.event) {
        case "result":
          if (msg.result) this.emitter.emit("result", msg.result)
          break
        case "state":
          if (msg.state) this.setState(msg.state)
          break
        case "error":
          this.setState("error")
          if (msg.error) this.emitter.emit("error", msg.error)
          break
        case "stopped":
          this.setState("stopped")
          this.cleanup()
          break
      }
    }

    helper.on(`event:${sessionId}`, onEvent)
    this.unsubscribe = () => helper.off(`event:${sessionId}`, onEvent)

    // Wait for the "listening" state (or error)
    await new Promise<void>((resolve, reject) => {
      const onState = (state: SpeechSessionState) => {
        if (state === "listening") {
          this.emitter.off("state", onState)
          this.emitter.off("error", onError)
          resolve()
        }
      }
      const onError = (err: SpeechError) => {
        this.emitter.off("state", onState)
        this.emitter.off("error", onError)
        reject(new SpeechRecognitionError(err))
      }
      // Timeout safety
      const t = setTimeout(() => {
        this.emitter.off("state", onState)
        this.emitter.off("error", onError)
        reject(new SpeechRecognitionError({ code: "backend-failure", message: "Session start timed out" }))
      }, 8000)

      this.emitter.on("state", onState)
      this.emitter.on("error", onError)

      // Clear timeout on resolution
      const origResolve = resolve
      resolve = () => { clearTimeout(t); origResolve() }
    })
  }

  async stop(): Promise<void> {
    if (!this.sessionId) return
    if (this._state !== "listening" && this._state !== "starting") return
    this.setState("stopping")
    getHelperProcess().sendControl({ command: "stopSession", sessionId: this.sessionId })
    await this.waitForStopped()
  }

  async abort(): Promise<void> {
    if (!this.sessionId) return
    getHelperProcess().sendControl({ command: "abortSession", sessionId: this.sessionId })
    this.setState("stopped")
    this.cleanup()
  }

  async dispose(): Promise<void> {
    if (this._state === "listening" || this._state === "starting") {
      await this.abort()
    }
    this.emitter.removeAllListeners()
    this.cleanup()
  }

  on(event: "result", listener: (result: LiveSpeechResult) => void): () => void
  on(event: "error", listener: (error: SpeechError) => void): () => void
  on(event: "state", listener: (state: SpeechSessionState) => void): () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (arg: any) => void): () => void {
    this.emitter.on(event, listener)
    return () => this.emitter.off(event, listener)
  }

  private setState(state: SpeechSessionState): void {
    if (this._state === state) return
    this._state = state
    this.emitter.emit("state", state)
  }

  private cleanup(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.sessionId = null
  }

  private waitForStopped(): Promise<void> {
    if (this._state === "stopped") return Promise.resolve()
    return new Promise<void>((resolve) => {
      const off = this.on("state", (state) => {
        if (state === "stopped" || state === "error") { off(); resolve() }
      })
      setTimeout(() => { off(); resolve() }, 5000)
    })
  }
}

/**
 * electron-native-speech-preload
 *
 * Exposes speech recognition to the renderer through a secure contextBridge.
 *
 * Usage in your preload script:
 *
 *   import { exposeElectronSpeech } from "electron-native-speech-preload"
 *   exposeElectronSpeech()
 *
 * Then in the renderer:
 *
 *   const av = await window.electronSpeech.getSpeechAvailability()
 *   const result = await window.electronSpeech.transcribeFile({ filePath: "..." })
 *
 *   const session = window.electronSpeech.createSpeechSession()
 *   session.on("result", r => console.log(r.text))
 *   await session.start({ locale: "en-US", interimResults: true })
 */

import { contextBridge, ipcRenderer } from "electron"
import type {
  SpeechAvailability,
  FileTranscriptionOptions,
  FileTranscriptionResult,
  SpeechSessionStartOptions,
  LiveSpeechResult,
  SpeechSessionState,
  SpeechError,
} from "electron-native-speech"

export const IPC_CHANNELS = {
  GET_AVAILABILITY: "ens:getAvailability",
  TRANSCRIBE_FILE: "ens:transcribeFile",
  SESSION_START: "ens:session:start",
  SESSION_STOP: "ens:session:stop",
  SESSION_ABORT: "ens:session:abort",
  SESSION_DISPOSE: "ens:session:dispose",
  SESSION_EVENT: "ens:session:event",
} as const

// ─── Renderer-side session proxy ─────────────────────────────────────────────

type SessionEventType = "result" | "error" | "state"
type SessionListener<T extends SessionEventType> =
  T extends "result" ? (r: LiveSpeechResult) => void
  : T extends "error" ? (e: SpeechError) => void
  : T extends "state" ? (s: SpeechSessionState) => void
  : never

class RendererSpeechSession {
  private sessionId: string
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  private ipcOff: (() => void) | null = null

  constructor(sessionId: string) {
    this.sessionId = sessionId

    const ipcListener = (
      _: Electron.IpcRendererEvent,
      event: { sessionId: string; type: string; payload: unknown }
    ) => {
      if (event.sessionId !== this.sessionId) return
      this.emit(event.type, event.payload)
    }

    ipcRenderer.on(IPC_CHANNELS.SESSION_EVENT, ipcListener)
    this.ipcOff = () => ipcRenderer.off(IPC_CHANNELS.SESSION_EVENT, ipcListener)
  }

  on<T extends SessionEventType>(event: T, listener: SessionListener<T>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(listener as never)
    return () => this.listeners.get(event)?.delete(listener as never)
  }

  async start(options?: SpeechSessionStartOptions): Promise<void> {
    await ipcRenderer.invoke(IPC_CHANNELS.SESSION_START, this.sessionId, options ?? {})
  }

  async stop(): Promise<void> {
    await ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP, this.sessionId)
  }

  async abort(): Promise<void> {
    await ipcRenderer.invoke(IPC_CHANNELS.SESSION_ABORT, this.sessionId)
  }

  async dispose(): Promise<void> {
    await ipcRenderer.invoke(IPC_CHANNELS.SESSION_DISPOSE, this.sessionId)
    this.ipcOff?.()
    this.ipcOff = null
    this.listeners.clear()
  }

  private emit(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((l) => l(payload))
  }
}

function createRendererSpeechSession(sessionId: string) {
  const session = new RendererSpeechSession(sessionId)

  return {
    on<T extends SessionEventType>(event: T, listener: SessionListener<T>) {
      return session.on(event, listener)
    },

    start(options?: SpeechSessionStartOptions) {
      return session.start(options)
    },

    stop() {
      return session.stop()
    },

    abort() {
      return session.abort()
    },

    dispose() {
      return session.dispose()
    },
  }
}

// ─── Public preload API ───────────────────────────────────────────────────────

export interface ElectronSpeechAPI {
  getSpeechAvailability(): Promise<SpeechAvailability>
  transcribeFile(options: FileTranscriptionOptions): Promise<FileTranscriptionResult>
  createSpeechSession(): ReturnType<typeof createRendererSpeechSession>
}

/**
 * Call this in your Electron preload script to expose the speech API
 * to the renderer under `window.electronSpeech`.
 */
export function exposeElectronSpeech(key = "electronSpeech"): void {
  let sessionCounter = 0

  const api: ElectronSpeechAPI = {
    getSpeechAvailability() {
      return ipcRenderer.invoke(IPC_CHANNELS.GET_AVAILABILITY)
    },

    transcribeFile(options: FileTranscriptionOptions) {
      return ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIBE_FILE, options)
    },

    createSpeechSession() {
      const sessionId = `session-${Date.now()}-${++sessionCounter}`
      return createRendererSpeechSession(sessionId)
    },
  }

  contextBridge.exposeInMainWorld(key, api)
}

// ─── Type augmentation for renderer global ────────────────────────────────────

declare global {
  interface Window {
    electronSpeech: ElectronSpeechAPI
  }
}

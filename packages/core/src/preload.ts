import type {
  FileTranscriptionOptions,
  FileTranscriptionResult,
  LiveSpeechResult,
  SpeechAvailability,
  SpeechError,
  SpeechSessionStartOptions,
  SpeechSessionState,
} from "./types"

type SessionEventType = "result" | "error" | "state"
type SessionListener<T extends SessionEventType> =
  T extends "result" ? (result: LiveSpeechResult) => void
  : T extends "error" ? (error: SpeechError) => void
  : T extends "state" ? (state: SpeechSessionState) => void
  : never

export interface RendererSpeechSession {
  on<T extends SessionEventType>(event: T, listener: SessionListener<T>): () => void
  start(options?: SpeechSessionStartOptions): Promise<void>
  stop(): Promise<void>
  abort(): Promise<void>
  dispose(): Promise<void>
}

export interface ElectronSpeechAPI {
  getSpeechAvailability(): Promise<SpeechAvailability>
  transcribeFile(options: FileTranscriptionOptions): Promise<FileTranscriptionResult>
  createSpeechSession(): RendererSpeechSession
}

export function exposeElectronSpeech(key = "electronSpeech"): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("electron-native-speech-preload") as {
    exposeElectronSpeech: (name?: string) => void
  }

  mod.exposeElectronSpeech(key)
}

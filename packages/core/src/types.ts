// ─── Transcript ───────────────────────────────────────────────────────────────

export type TranscriptSegment = {
  /** Unique segment identifier within the result */
  id: string
  /** Start time in milliseconds from the beginning of the audio */
  startMs: number
  /** End time in milliseconds from the beginning of the audio */
  endMs: number
  /** Transcribed text for this segment */
  text: string
  /** Recognition confidence 0–1, if available from the platform */
  confidence?: number
}

// ─── File Transcription ───────────────────────────────────────────────────────

export type FileTranscriptionOptions = {
  /** Absolute path to the audio or video file */
  filePath: string
  /**
   * BCP-47 locale string, e.g. "en-US", "fr-FR".
   * Defaults to device locale when omitted.
   */
  locale?: string
}

export type FileTranscriptionResult = {
  segments: TranscriptSegment[]
  /** Total audio duration in milliseconds, if determinable */
  durationMs?: number
  /** Locale that was used for recognition */
  locale?: string
}

// ─── Live Session ─────────────────────────────────────────────────────────────

export type SpeechSessionStartOptions = {
  /** BCP-47 locale string. Defaults to device locale. */
  locale?: string
  /** Emit interim (partial) results in addition to final results */
  interimResults?: boolean
  /** Keep recognizing after each phrase ends */
  continuous?: boolean
}

export type LiveSpeechResult = {
  text: string
  isFinal: boolean
  confidence?: number
  /** Timestamp of the result in milliseconds since session start */
  timestampMs?: number
}

export type SpeechSessionState =
  | "idle"
  | "starting"
  | "listening"
  | "stopping"
  | "stopped"
  | "error"

export interface SpeechSession {
  start(options?: SpeechSessionStartOptions): Promise<void>
  stop(): Promise<void>
  abort(): Promise<void>
  dispose(): Promise<void>

  on(event: "result", listener: (result: LiveSpeechResult) => void): () => void
  on(event: "error", listener: (error: SpeechError) => void): () => void
  on(event: "state", listener: (state: SpeechSessionState) => void): () => void
}

// ─── Availability ─────────────────────────────────────────────────────────────

export type SpeechAvailability = {
  available: boolean
  platform: string
  mode?: "file" | "live" | "both"
  /** Human-readable explanation when available is false */
  reason?: string
  details?: unknown
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type SpeechErrorCode =
  | "unavailable"
  | "permission-denied"
  | "unsupported-locale"
  | "unsupported-input"
  | "missing-audio-track"
  | "no-speech-detected"
  | "backend-failure"
  | "invalid-state"
  | "unknown"

export type SpeechError = {
  code: SpeechErrorCode
  message: string
  details?: unknown
}

// ─── Backend Interface ────────────────────────────────────────────────────────

/**
 * Internal interface that platform backends must implement.
 * Not part of the public SDK surface.
 */
export interface ISpeechBackend {
  checkAvailability(): Promise<SpeechAvailability>
  transcribeFile(options: FileTranscriptionOptions): Promise<FileTranscriptionResult>
  createSession(): Promise<SpeechSession>
  dispose(): Promise<void>
}

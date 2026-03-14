export type {
  TranscriptSegment,
  FileTranscriptionOptions,
  FileTranscriptionResult,
  SpeechSessionStartOptions,
  LiveSpeechResult,
  SpeechSessionState,
  SpeechSession,
  SpeechAvailability,
  SpeechError,
  SpeechErrorCode,
  ISpeechBackend,
} from "./types"

export { SpeechRecognitionError, makeSpeechError } from "./errors"
export { setBackend, resetBackend } from "./backend-loader"

import { getBackend } from "./backend-loader"
import type { FileTranscriptionOptions, FileTranscriptionResult, SpeechAvailability, SpeechSession } from "./types"

/**
 * Check whether speech recognition is available in the current environment.
 *
 * Always call this before transcribing. It validates platform support,
 * backend presence, and permission pre-conditions.
 *
 * @example
 * const av = await getSpeechAvailability()
 * if (!av.available) { console.error(av.reason); return }
 */
export async function getSpeechAvailability(): Promise<SpeechAvailability> {
  try {
    return await getBackend().checkAvailability()
  } catch (err: unknown) {
    return {
      available: false,
      platform: process.platform,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Transcribe a local audio or video file using the native OS speech engine.
 *
 * - Runs entirely on-device — no network requests.
 * - Accepts any format AVFoundation can read (m4a, mp3, wav, mp4, mov, webm…).
 * - Files in unsupported containers are automatically converted to a
 *   temporary intermediate before recognition.
 *
 * @example
 * const result = await transcribeFile({ filePath: "/path/to/recording.m4a" })
 * for (const seg of result.segments) {
 *   console.log(`[${seg.startMs}ms] ${seg.text}`)
 * }
 */
export async function transcribeFile(
  options: FileTranscriptionOptions
): Promise<FileTranscriptionResult> {
  return getBackend().transcribeFile(options)
}

/**
 * Create a live microphone transcription session.
 *
 * The session object provides fine-grained control over the recognition
 * lifecycle (start / stop / abort / dispose) and emits typed events.
 *
 * @example
 * const session = await createSpeechSession()
 * session.on("result", r => console.log(r.text))
 * await session.start({ locale: "en-US", interimResults: true })
 * // later…
 * await session.stop()
 * await session.dispose()
 */
export async function createSpeechSession(): Promise<SpeechSession> {
  return getBackend().createSession()
}

import type { SpeechError, SpeechErrorCode } from "./types"

export class SpeechRecognitionError extends Error {
  readonly code: SpeechErrorCode
  readonly details?: unknown

  constructor(error: SpeechError) {
    super(error.message)
    this.name = "SpeechRecognitionError"
    this.code = error.code
    this.details = error.details
  }

  toSpeechError(): SpeechError {
    return { code: this.code, message: this.message, details: this.details }
  }
}

export function makeSpeechError(
  code: SpeechErrorCode,
  message: string,
  details?: unknown
): SpeechError {
  return { code, message, details }
}

export function throwSpeechError(
  code: SpeechErrorCode,
  message: string,
  details?: unknown
): never {
  throw new SpeechRecognitionError({ code, message, details })
}

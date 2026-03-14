import * as fs from "fs"
import type { FileTranscriptionOptions, FileTranscriptionResult } from "electron-native-speech"
import { SpeechRecognitionError } from "electron-native-speech"
import { getHelperProcess } from "./helper-process"
import { getMissingUsageDescriptionMessage } from "./macos-usage-descriptions"
import { ensureSpeechPermission } from "./speech-permission"

type RawSegment = {
  id: string
  startMs: number
  endMs: number
  text: string
  confidence?: number
}

type TranscribeFileResponse = {
  type: "result"
  segments: RawSegment[]
  durationMs?: number
  locale?: string
}

type ErrorResponse = {
  type: "error"
  code: string
  message: string
  details?: unknown
}

export async function transcribeFile(
  options: FileTranscriptionOptions
): Promise<FileTranscriptionResult> {
  const { filePath, locale } = options

  if (!filePath) {
    throw new SpeechRecognitionError({ code: "unsupported-input", message: "filePath is required" })
  }

  if (!fs.existsSync(filePath)) {
    throw new SpeechRecognitionError({
      code: "unsupported-input",
      message: `File not found: ${filePath}`,
    })
  }

  const usageDescriptionIssue = getMissingUsageDescriptionMessage("speech")
  if (usageDescriptionIssue) {
    throw new SpeechRecognitionError({
      code: "backend-failure",
      message: usageDescriptionIssue,
    })
  }

  const helper = getHelperProcess()
  await helper.start()
  await ensureSpeechPermission(helper)

  let raw: unknown
  try {
    raw = await helper.send(
      { command: "transcribeFile", filePath, locale: locale ?? null },
      // Large files can take a while — allow up to 5 minutes
      5 * 60 * 1000
    )
  } catch (err: unknown) {
    if (isErrorResponse(err)) {
      throw new SpeechRecognitionError({
        code: err.code as never,
        message: err.message,
        details: err.details,
      })
    }
    throw err
  }

  const resp = raw as TranscribeFileResponse
  return {
    segments: resp.segments ?? [],
    durationMs: resp.durationMs,
    locale: resp.locale,
  }
}

function isErrorResponse(v: unknown): v is ErrorResponse {
  return (
    typeof v === "object" && v !== null && "type" in v && (v as ErrorResponse).type === "error"
  )
}

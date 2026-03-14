import type {
  ISpeechBackend,
  SpeechAvailability,
  FileTranscriptionOptions,
  FileTranscriptionResult,
  SpeechSession,
} from "electron-native-speech"
import { checkAvailability } from "./availability"
import { transcribeFile } from "./file-transcriber"
import { MacOSLiveSpeechSession } from "./live-session"
import { disposeHelperProcess } from "./helper-process"

export class MacOSSpeechBackend implements ISpeechBackend {
  async checkAvailability(): Promise<SpeechAvailability> {
    return checkAvailability()
  }

  async transcribeFile(options: FileTranscriptionOptions): Promise<FileTranscriptionResult> {
    return transcribeFile(options)
  }

  async createSession(): Promise<SpeechSession> {
    return new MacOSLiveSpeechSession()
  }

  async dispose(): Promise<void> {
    await disposeHelperProcess()
  }
}

// Re-export for direct use if needed
export { checkAvailability, transcribeFile, MacOSLiveSpeechSession, disposeHelperProcess }

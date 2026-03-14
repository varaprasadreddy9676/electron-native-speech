import { SpeechRecognitionError } from "electron-native-speech"
import type { HelperProcess } from "./helper-process"

type AuthResult = {
  authorized: boolean
  status: string
}

/**
 * Asks the persistent SpeechHelper subprocess to call
 * SFSpeechRecognizer.requestAuthorization on behalf of the Electron app.
 *
 * Because SpeechHelper is a child process of Electron, macOS TCC attributes
 * the permission dialog to the responsible process — the Electron app —
 * and uses its NSSpeechRecognitionUsageDescription from Info.plist.
 *
 * If the user has already granted permission the call returns immediately
 * (no dialog shown), so it is safe to call on every transcription request.
 */
export async function ensureSpeechPermission(helper: HelperProcess): Promise<void> {
  if (process.platform !== "darwin") return

  // Allow up to 30 s for the user to respond to the system permission dialog
  const raw = (await helper.send({ command: "requestSpeechAuth" }, 30_000)) as AuthResult

  if (!raw.authorized) {
    throw new SpeechRecognitionError({
      code: "permission-denied",
      message:
        raw.status === "restricted"
          ? "Speech recognition is restricted on this Mac."
          : "Speech recognition permission denied. Enable it in System Settings → Privacy & Security → Speech Recognition.",
    })
  }
}

import { execFile } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { promisify } from "util"
import { SpeechRecognitionError } from "electron-native-speech"

const execFileAsync = promisify(execFile)

let ensuredSpeechPermission = false

function getHelperAppCandidates(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

  return [
    resourcesPath ? path.join(resourcesPath, "SpeechHelper.app") : null,
    path.join(__dirname, "..", "bin", "SpeechHelper.app"),
    path.join(__dirname, "..", "..", "bin", "SpeechHelper.app"),
  ].filter(Boolean) as string[]
}

function getHelperAppPath(): string {
  for (const candidate of getHelperAppCandidates()) {
    if (fs.existsSync(path.join(candidate, "Contents", "MacOS", "SpeechHelper"))) {
      return candidate
    }
  }

  throw new SpeechRecognitionError({
    code: "backend-failure",
    message: "SpeechHelper.app not found. Reinstall electron-native-speech-backend-macos.",
  })
}

function getHelperAppBinaryPath(): string {
  return path.join(getHelperAppPath(), "Contents", "MacOS", "SpeechHelper")
}

function readAuthorizationResult(resultPath: string): boolean {
  try {
    const raw = fs.readFileSync(resultPath, "utf8")
    const parsed = JSON.parse(raw) as { authorized?: boolean; status?: string }
    if (parsed.authorized) return true

    throw new SpeechRecognitionError({
      code: "permission-denied",
      message:
        parsed.status === "restricted"
          ? "Speech recognition is restricted on this Mac."
          : "Speech recognition permission denied. Enable it in System Settings → Privacy & Security → Speech Recognition.",
    })
  } catch (err) {
    if (err instanceof SpeechRecognitionError) throw err
    throw new SpeechRecognitionError({
      code: "backend-failure",
      message: "Failed to read speech authorization result from SpeechHelper.app.",
      details: err,
    })
  } finally {
    try {
      fs.unlinkSync(resultPath)
    } catch {
      // Ignore cleanup errors for temporary files.
    }
  }
}

export async function ensureSpeechPermission(): Promise<void> {
  if (process.platform !== "darwin" || ensuredSpeechPermission) return

  const helperBinaryPath = getHelperAppBinaryPath()
  const resultPath = path.join(
    os.tmpdir(),
    `electron-native-speech-auth-${process.pid}-${Date.now()}.json`
  )

  try {
    await execFileAsync(helperBinaryPath, [
      "--request-speech-auth",
      "--result-file",
      resultPath,
    ])
  } catch {
    // The helper exits non-zero when permission is denied. The result file contains the real status.
  }

  ensuredSpeechPermission = true
  readAuthorizationResult(resultPath)
}

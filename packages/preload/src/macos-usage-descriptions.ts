import { execFileSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

type UsageDescriptionKind = "speech" | "microphone"

const USAGE_DESCRIPTION_KEYS: Record<UsageDescriptionKind, string> = {
  speech: "NSSpeechRecognitionUsageDescription",
  microphone: "NSMicrophoneUsageDescription",
}

export function getMissingUsageDescriptionMessage(kind: UsageDescriptionKind): string | null {
  if (process.platform !== "darwin") return null

  const infoPlistPath = path.resolve(process.execPath, "..", "..", "Info.plist")
  if (!fs.existsSync(infoPlistPath)) return null

  const key = USAGE_DESCRIPTION_KEYS[kind]

  try {
    const value = execFileSync(
      "/usr/bin/plutil",
      ["-extract", key, "raw", "-o", "-", infoPlistPath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim()

    if (value) return null
  } catch {
    // Missing key or unreadable plist: surface a single actionable message below.
  }

  const feature = kind === "speech" ? "speech recognition" : "microphone access"
  return `Missing ${key} in ${infoPlistPath}. macOS can abort ${feature} permission requests without this key. Add it to your app's Info.plist and restart the app.`
}

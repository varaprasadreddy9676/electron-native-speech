import { execFileSync } from "child_process"
import * as fs from "fs"
import * as path from "path"

type UsageDescriptionKind = "speech" | "microphone"

const USAGE_DESCRIPTION_KEYS: Record<UsageDescriptionKind, string> = {
  speech: "NSSpeechRecognitionUsageDescription",
  microphone: "NSMicrophoneUsageDescription",
}

let cachedInfoPlistPath: string | null | undefined
const cachedUsageDescriptions = new Map<string, string | null>()

function getInfoPlistPath(): string | null {
  if (cachedInfoPlistPath !== undefined) return cachedInfoPlistPath

  const contentsPath = path.resolve(process.execPath, "..", "..")
  const infoPlistPath = path.join(contentsPath, "Info.plist")
  cachedInfoPlistPath = fs.existsSync(infoPlistPath) ? infoPlistPath : null
  return cachedInfoPlistPath
}

function readUsageDescription(key: string): string | null {
  const infoPlistPath = getInfoPlistPath()
  if (!infoPlistPath) return null

  const cacheKey = `${infoPlistPath}:${key}`
  if (cachedUsageDescriptions.has(cacheKey)) {
    return cachedUsageDescriptions.get(cacheKey) ?? null
  }

  let value: string | null = null
  try {
    const raw = execFileSync(
      "/usr/bin/plutil",
      ["-extract", key, "raw", "-o", "-", infoPlistPath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim()
    if (raw) value = raw
  } catch {
    value = null
  }

  cachedUsageDescriptions.set(cacheKey, value)
  return value
}

export function getMissingUsageDescriptionMessage(kind: UsageDescriptionKind): string | null {
  if (process.platform !== "darwin") return null

  const infoPlistPath = getInfoPlistPath()
  if (!infoPlistPath) return null

  const key = USAGE_DESCRIPTION_KEYS[kind]
  if (readUsageDescription(key)) return null

  const feature =
    kind === "speech"
      ? "speech recognition"
      : "microphone access"

  return `Missing ${key} in ${infoPlistPath}. macOS can abort ${feature} permission requests without this key. Add it to your app's Info.plist and restart the app.`
}

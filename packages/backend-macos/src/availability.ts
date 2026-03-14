import type { SpeechAvailability } from "electron-native-speech"
import { getHelperProcess } from "./helper-process"

type AvailabilityResponse = {
  type: "result"
  available: boolean
  platform: string
  mode?: "file" | "live" | "both"
  reason?: string
  details?: unknown
}

export async function checkAvailability(): Promise<SpeechAvailability> {
  if (process.platform !== "darwin") {
    return {
      available: false,
      platform: process.platform,
      reason: "electron-native-speech macOS backend requires macOS",
    }
  }

  const helper = getHelperProcess()

  try {
    await helper.start()
  } catch (err: unknown) {
    return {
      available: false,
      platform: "darwin",
      reason: err instanceof Error ? err.message : String(err),
    }
  }

  try {
    const raw = (await helper.send({ command: "checkAvailability" }, 5000)) as AvailabilityResponse
    return {
      available: raw.available,
      platform: raw.platform ?? "darwin",
      mode: raw.mode,
      reason: raw.reason,
      details: raw.details,
    }
  } catch {
    return {
      available: false,
      platform: "darwin",
      reason: "Failed to query SpeechHelper availability",
    }
  }
}

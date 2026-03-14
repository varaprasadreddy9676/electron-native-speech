import type { ISpeechBackend } from "./types"
import { throwSpeechError } from "./errors"

let _backend: ISpeechBackend | null = null

/**
 * Loads and returns the platform backend singleton.
 * The backend module is resolved at runtime so that the core package
 * does not hard-code a dependency on any platform-specific code.
 */
export function getBackend(): ISpeechBackend {
  if (_backend) return _backend

  const platform = process.platform

  if (platform === "darwin") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("@electron-native-speech/backend-macos")
      _backend = new mod.MacOSSpeechBackend() as ISpeechBackend
      return _backend
    } catch {
      throwSpeechError(
        "unavailable",
        "macOS speech backend not found. Run: npm install @electron-native-speech/backend-macos"
      )
    }
  }

  throwSpeechError(
    "unavailable",
    `Platform "${platform}" is not yet supported. electron-native-speech currently supports macOS.`
  )
}

/** Replace the backend — useful for testing */
export function setBackend(backend: ISpeechBackend): void {
  _backend = backend
}

export function resetBackend(): void {
  if (_backend) {
    _backend.dispose().catch(() => {})
  }
  _backend = null
}

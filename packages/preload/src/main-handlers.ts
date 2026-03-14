/**
 * IPC handler registration for the Electron main process.
 *
 * Call `registerSpeechHandlers(ipcMain, webContents)` in your main process
 * to wire up all speech recognition IPC channels.
 *
 * @example
 * import { app, BrowserWindow, ipcMain } from "electron"
 * import { registerSpeechHandlers } from "electron-native-speech-preload/main-handlers"
 *
 * app.whenReady().then(async () => {
 *   const win = new BrowserWindow({ webPreferences: { preload: "..." } })
 *   registerSpeechHandlers(ipcMain, win.webContents)
 * })
 */

import type { IpcMain, WebContents } from "electron"
import { systemPreferences } from "electron"
import {
  getSpeechAvailability,
  transcribeFile,
  createSpeechSession,
} from "electron-native-speech"
import type { SpeechSession } from "electron-native-speech"
import { IPC_CHANNELS } from "./index"

export function registerSpeechHandlers(ipcMain: IpcMain, webContents: WebContents): () => void {
  const sessions = new Map<string, SpeechSession>()

  const forwardEvent = (sessionId: string, type: string, payload: unknown) => {
    if (!webContents.isDestroyed()) {
      webContents.send(IPC_CHANNELS.SESSION_EVENT, { sessionId, type, payload })
    }
  }

  ipcMain.handle(IPC_CHANNELS.GET_AVAILABILITY, () => getSpeechAvailability())

  ipcMain.handle(IPC_CHANNELS.TRANSCRIBE_FILE, (_e, options) => transcribeFile(options))

  ipcMain.handle(IPC_CHANNELS.SESSION_START, async (_e, sessionId: string, options) => {
    // Request microphone permission from the Electron (parent) process first.
    // On macOS, TCC attributes permission to the responsible process — granting it
    // here lets the SpeechHelper subprocess use the mic without crashing.
    if (process.platform === "darwin") {
      const granted = await systemPreferences.askForMediaAccess("microphone")
      if (!granted) {
        throw new Error(
          "Microphone access denied. Grant access in System Settings → Privacy & Security → Microphone."
        )
      }
    }

    let session = sessions.get(sessionId)
    if (!session) {
      session = await createSpeechSession()
      sessions.set(sessionId, session)

      session.on("result", (result) => forwardEvent(sessionId, "result", result))
      session.on("error", (error) => forwardEvent(sessionId, "error", error))
      session.on("state", (state) => forwardEvent(sessionId, "state", state))
    }
    await session.start(options)
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async (_e, sessionId: string) => {
    await sessions.get(sessionId)?.stop()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_ABORT, async (_e, sessionId: string) => {
    await sessions.get(sessionId)?.abort()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_DISPOSE, async (_e, sessionId: string) => {
    const session = sessions.get(sessionId)
    if (session) {
      await session.dispose()
      sessions.delete(sessionId)
    }
  })

  // Cleanup function — call on window close
  return async () => {
    for (const [, session] of sessions) {
      await session.dispose().catch(() => {})
    }
    sessions.clear()
    ipcMain.removeHandler(IPC_CHANNELS.GET_AVAILABILITY)
    ipcMain.removeHandler(IPC_CHANNELS.TRANSCRIBE_FILE)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_START)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_STOP)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_ABORT)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_DISPOSE)
  }
}

import type { IpcMain, WebContents } from "electron"

export function registerSpeechHandlers(ipcMain: IpcMain, webContents: WebContents): () => void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("electron-native-speech-preload/main-handlers") as {
    registerSpeechHandlers: (main: IpcMain, contents: WebContents) => () => void
  }

  return mod.registerSpeechHandlers(ipcMain, webContents)
}

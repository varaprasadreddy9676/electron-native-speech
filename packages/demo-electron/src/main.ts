import { app, BrowserWindow, ipcMain, dialog } from "electron"
import * as path from "path"
import { registerSpeechHandlers } from "electron-native-speech-preload/main-handlers"

let mainWindow: BrowserWindow | null = null
let cleanupSpeech: (() => void) | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: "electron-native-speech demo",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // required for preload to use require()
    },
  })

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"))

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools()
  }

  // Register speech IPC handlers
  cleanupSpeech = registerSpeechHandlers(ipcMain, mainWindow.webContents)

  // File picker for transcription demo
  ipcMain.handle("ens:openFileDialog", async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select audio or video file",
      filters: [
        { name: "Audio / Video", extensions: ["m4a", "mp3", "wav", "aiff", "mp4", "mov", "webm", "aac", "caf"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on("window-all-closed", async () => {
  if (cleanupSpeech) await cleanupSpeech()
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on("before-quit", async (event) => {
  if (cleanupSpeech) {
    event.preventDefault()
    await cleanupSpeech()
    cleanupSpeech = null
    app.quit()
  }
})

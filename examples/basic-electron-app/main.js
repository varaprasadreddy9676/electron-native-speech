"use strict"

const { app, BrowserWindow, ipcMain, dialog } = require("electron")
const path = require("path")
const { registerSpeechHandlers } = require("electron-native-speech/main-handlers")

let win = null
let cleanupSpeech = null

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    title: "electron-native-speech example",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.loadFile("index.html")

  // Register all speech IPC handlers (transcribeFile, createSpeechSession, etc.)
  cleanupSpeech = registerSpeechHandlers(ipcMain, win.webContents)

  // File picker — lets renderer ask for a file path without nodeIntegration
  ipcMain.handle("open-file-dialog", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Select audio or video file",
      filters: [
        {
          name: "Audio / Video",
          extensions: ["m4a", "mp3", "wav", "aiff", "aac", "caf", "mp4", "mov", "webm"],
        },
      ],
      properties: ["openFile"],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  win.on("closed", () => { win = null })
}

app.whenReady().then(createWindow)

app.on("window-all-closed", () => {
  if (cleanupSpeech) cleanupSpeech()
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  if (cleanupSpeech) cleanupSpeech()
})

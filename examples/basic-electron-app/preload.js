"use strict"

const { contextBridge, ipcRenderer } = require("electron")
const { exposeElectronSpeech } = require("electron-native-speech-preload")

// Exposes window.electronSpeech in the renderer
exposeElectronSpeech()

// Expose the file picker so the renderer can open a native dialog
contextBridge.exposeInMainWorld("dialog", {
  openFile: () => ipcRenderer.invoke("open-file-dialog"),
})

import { exposeElectronSpeech } from "electron-native-speech-preload"
import { contextBridge, ipcRenderer } from "electron"

// Expose the speech API under window.electronSpeech
exposeElectronSpeech()

// Expose the file picker
contextBridge.exposeInMainWorld("electronDialog", {
  openFile: () => ipcRenderer.invoke("ens:openFileDialog"),
})

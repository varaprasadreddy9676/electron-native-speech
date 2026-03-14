# basic-electron-app

Minimal runnable example of `electron-native-speech`.

Demonstrates:
- File transcription (any audio/video file)
- Live microphone with interim results

## Run it

```bash
npm install
npm start
```

That's it. No build step. The start script patches Electron's dev `Info.plist`
with the speech and microphone usage descriptions macOS requires.

From the repo root:

```bash
cd examples/basic-electron-app
npm install
npm start
```

## What you'll see

A window with two panels:

- **File Transcription** — pick any audio/video file, click Transcribe, see timestamped segments
- **Live Microphone** — click Start Listening, speak, see words appear in real time

## How it works

```
index.html (renderer)
    └── window.electronSpeech.*      ← exposed by preload.js via contextBridge
        └── ipcRenderer.invoke(...)
preload.js
    └── exposeElectronSpeech()       ← from electron-native-speech/preload
main.js
    └── registerSpeechHandlers()     ← from electron-native-speech/main-handlers
        └── electron-native-speech   ← calls Swift SpeechHelper binary
```

## Files

| File | Purpose |
|---|---|
| `main.js` | Electron main process — registers speech IPC handlers and file dialog |
| `preload.js` | Preload script — exposes `window.electronSpeech` via contextBridge |
| `index.html` | UI — file picker + transcript display + live mic controls |

## Requirements

- macOS 13 Ventura or later
- Electron 28 or later (installed automatically as a dev dependency)

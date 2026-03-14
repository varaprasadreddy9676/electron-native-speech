# electron-native-speech

Native OS speech transcription for Electron apps — fast, local, no cloud required.

- **macOS:** Apple Speech framework (`SFSpeechRecognizer` + `AVFoundation`)
- **Windows:** planned — Rust backend using Windows Speech SDK
- No API keys. No network. No latency from the cloud.

---

## Features

- **File transcription** — transcribe local audio/video files with timestamps
- **Live microphone** — real-time dictation with interim results
- **Electron-safe** — works with `contextIsolation: true`, `nodeIntegration: false`
- **Offline-capable** — on-device recognition when the platform supports it
- **Automatic format handling** — converts unsupported containers via AVFoundation

---

## Quickstart

### 1. Install

```bash
npm install electron-native-speech @electron-native-speech/backend-macos
```

> On first install, run the Swift build step once:
> ```bash
> cd node_modules/@electron-native-speech/backend-macos
> npm run build:swift
> ```
> This compiles the native `SpeechHelper` binary (~130KB).

### 2. Main process

```ts
// main.ts
import { ipcMain } from "electron"
import { registerSpeechHandlers } from "@electron-native-speech/preload/dist/main-handlers"

const cleanup = registerSpeechHandlers(ipcMain, win.webContents)
app.on("before-quit", cleanup)
```

### 3. Preload script

```ts
// preload.ts
import { exposeElectronSpeech } from "@electron-native-speech/preload"
exposeElectronSpeech() // exposes window.electronSpeech
```

### 4. Renderer

```ts
// Transcribe a file
const result = await window.electronSpeech.transcribeFile({
  filePath: "/path/to/recording.m4a",
  locale: "en-US",
})
for (const seg of result.segments) {
  console.log(`[${seg.startMs}ms] ${seg.text}`)
}

// Live microphone
const session = window.electronSpeech.createSpeechSession()
session.on("result", (r) => console.log(r.text, r.isFinal))
await session.start({ locale: "en-US", interimResults: true, continuous: true })
// later…
await session.stop()
await session.dispose()
```

---

## How it works

```
Renderer UI
    │  window.electronSpeech.*
Preload Bridge (contextBridge)
    │  ipcRenderer.invoke(...)
IPC
    │  ipcMain.handle(...)
Main Process (Node.js)
    │  stdin/stdout JSON
SpeechHelper (Swift binary — persistent process)
    │
Apple Speech.framework + AVFoundation
```

The Swift helper starts once and stays alive — subsequent calls have zero spawn overhead.

---

## Supported input formats

Directly recognized: `m4a`, `mp3`, `wav`, `aiff`, `aac`, `caf`, `mp4`, `mov`

Auto-converted via AVFoundation: `webm`, `ogg`, and any other container AVFoundation can read.

---

## Permissions

Add to your app's `Info.plist`:

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>Used for transcribing audio in this app.</string>

<key>NSMicrophoneUsageDescription</key>
<string>Used for live speech recognition.</string>
```

---

## Demo app

```bash
# Build the Swift binary first (once)
npm run build:swift

# Run the demo
npm run dev --workspace packages/demo-electron
```

---

## Repository structure

```
packages/
  core/             — TypeScript SDK (npm: electron-native-speech)
  backend-macos/    — macOS Swift backend
  preload/          — Electron contextBridge helpers
  demo-electron/    — Demo app
docs/
  PRD.md            — Product requirements
```

---

## Roadmap

- **v1** — macOS file transcription *(done)*
- **v1.1** — macOS live microphone *(done)*
- **v2** — Windows backend (Rust + Windows.Media.SpeechRecognition)

---

## License

MIT

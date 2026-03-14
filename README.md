> ⭐ If this saves you from a cloud API bill or a broken Web Speech hack, star the repo — it helps others find it.

# electron-native-speech

[![npm](https://img.shields.io/npm/v/electron-native-speech?color=blue)](https://www.npmjs.com/package/electron-native-speech)
[![macOS](https://img.shields.io/badge/macOS-13%2B-lightgrey?logo=apple)](https://developer.apple.com/documentation/speech)
[![Electron](https://img.shields.io/badge/Electron-28%2B-47848F?logo=electron)](https://electronjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Use native macOS speech transcription in Electron with one API.**

No API keys. No network requests. No cloud costs. No manual build steps.
The prebuilt binary ships with the package — `npm install` is all you need.

---

## Why this exists

| | electron-native-speech | Web Speech API | OpenAI Whisper API | Local Whisper/Vosk |
|---|---|---|---|---|
| **Works offline** | ✅ | ❌ requires Chrome + internet | ❌ cloud only | ✅ |
| **No API keys** | ✅ | ✅ | ❌ | ✅ |
| **Works in Electron** | ✅ | ⚠️ unreliable in Electron | ✅ | ✅ |
| **File transcription** | ✅ | ❌ | ✅ | ✅ |
| **Live microphone** | ✅ | ✅ | ❌ | ✅ |
| **Word timestamps** | ✅ | ❌ | ✅ | varies |
| **Zero per-call overhead** | ✅ persistent process | — | network RTT | model load time |
| **Bundle size added** | ~280 KB binary | 0 | 0 | 100 MB+ model |

**electron-native-speech wraps Apple's `SFSpeechRecognizer` + `AVFoundation` in an Electron-safe, context-isolated API.** The Swift helper starts once and stays alive — no spawn overhead on subsequent calls.

---

## Compatibility

| | Supported |
|---|---|
| **macOS** | 13 Ventura and later |
| **Architectures** | Apple Silicon (arm64) + Intel (x86_64) via universal binary |
| **Electron** | 28 and later |
| **Node.js** | 18 and later |
| **Windows / Linux** | Not yet (planned: Windows Speech SDK backend) |

---

## Install

```bash
npm install electron-native-speech
```

That's it. The macOS backend and Electron preload bridge are installed automatically as internal dependencies.

The prebuilt `SpeechHelper` binary (~280 KB universal) ships inside the backend package — no compilation step needed.

> **Building from source?** If you want to build the Swift binary yourself (e.g. for CI or code signing workflows), see [CONTRIBUTING.md](CONTRIBUTING.md).

## Try The Demo

`npm install electron-native-speech` installs the library for your app.
The runnable demo lives in this GitHub repo.

To try it locally:

```bash
git clone https://github.com/varaprasadreddy9676/electron-native-speech
cd electron-native-speech/examples/basic-electron-app
npm install
npm start
```

That opens a working Electron example with:

- file transcription
- live microphone transcription

---

## Quickstart

### 1. Main process

```ts
// main.ts
import { app, BrowserWindow, ipcMain } from "electron"
import { registerSpeechHandlers } from "electron-native-speech/main-handlers"

let win: BrowserWindow

app.whenReady().then(() => {
  win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const cleanupSpeech = registerSpeechHandlers(ipcMain, win.webContents)
  app.on("before-quit", cleanupSpeech)
})
```

### 2. Preload script

```ts
// preload.ts
import { exposeElectronSpeech } from "electron-native-speech/preload"

exposeElectronSpeech() // exposes window.electronSpeech
```

### 3. Renderer — file transcription

```ts
const result = await window.electronSpeech.transcribeFile({
  filePath: "/path/to/recording.m4a",
  locale: "en-US",
})

for (const seg of result.segments) {
  console.log(`[${seg.startMs}ms – ${seg.endMs}ms] ${seg.text}`)
}
```

### 4. Renderer — live microphone

```ts
const session = window.electronSpeech.createSpeechSession()

session.on("result", (r) => {
  console.log(r.text, r.isFinal ? "(final)" : "(interim)")
})
session.on("error", (e) => console.error(e))

await session.start({ locale: "en-US", interimResults: true, continuous: true })

// Later…
await session.stop()
await session.dispose()
```

---

## API reference

### `window.electronSpeech.getSpeechAvailability()`

```ts
getSpeechAvailability(): Promise<SpeechAvailability>

interface SpeechAvailability {
  available: boolean
  reason?: string   // present when available === false
}
```

Checks whether speech recognition is authorized and available on the current device.

---

### `window.electronSpeech.transcribeFile(options)`

```ts
transcribeFile(options: FileTranscriptionOptions): Promise<FileTranscriptionResult>

interface FileTranscriptionOptions {
  filePath: string
  locale?: string   // e.g. "en-US" (default: system locale)
}

interface FileTranscriptionResult {
  segments: TranscriptSegment[]
}

interface TranscriptSegment {
  id: number
  startMs: number
  endMs: number
  text: string
  confidence: number   // 0–1
}
```

---

### `window.electronSpeech.createSpeechSession()`

```ts
createSpeechSession(): SpeechSession

interface SpeechSession {
  start(options: SpeechSessionStartOptions): Promise<void>
  stop(): Promise<void>
  abort(): Promise<void>
  dispose(): Promise<void>
  on(event: "result", handler: (result: LiveSpeechResult) => void): this
  on(event: "state", handler: (state: SpeechSessionState) => void): this
  on(event: "error", handler: (error: SpeechError) => void): this
  on(event: "stopped", handler: () => void): this
}

interface SpeechSessionStartOptions {
  locale?: string         // e.g. "en-US"
  interimResults?: boolean
  continuous?: boolean
}

interface LiveSpeechResult {
  text: string
  isFinal: boolean
  segments: TranscriptSegment[]
}

type SpeechSessionState = "idle" | "starting" | "listening" | "stopping" | "stopped" | "error"
```

---

## Supported input formats

| Format | Support |
|---|---|
| `.wav`, `.m4a`, `.mp3`, `.aac`, `.aiff`, `.caf` | Direct (AVFoundation native) |
| `.mp4`, `.mov` | Direct (AVFoundation native) |
| `.webm`, `.ogg`, and others | Auto-converted via AVFoundation export |

Electron's `MediaRecorder` produces WebM+Opus — this is handled automatically.

---

## Permissions

Add to your app's `Info.plist`:

```xml
<!-- Required for file transcription and live speech -->
<key>NSSpeechRecognitionUsageDescription</key>
<string>This app uses speech recognition to transcribe audio.</string>

<!-- Required for live microphone only -->
<key>NSMicrophoneUsageDescription</key>
<string>This app accesses the microphone for live speech recognition.</string>
```

macOS will prompt the user the first time speech recognition is used. The user can manage this in **System Settings → Privacy & Security → Speech Recognition**.

When running against the unbundled Electron binary in local development, make sure the host app's `Info.plist` also includes these keys. The example apps in this repo patch Electron's dev bundle automatically before launch.

---

## How it works

```
Renderer (contextIsolation: true, nodeIntegration: false)
    │  window.electronSpeech.*
    │
Preload script (contextBridge)
    │  ipcRenderer.invoke(...)
    │
IPC boundary
    │  ipcMain.handle(...)
    │
Main process (Node.js)
    │  newline-delimited JSON over stdin/stdout
    │
SpeechHelper (Swift binary — persistent process, started once)
    │
Apple Speech.framework + AVFoundation
```

The Swift helper process starts once when the first call arrives and remains alive for the app's lifetime. Zero spawn overhead for subsequent calls.

---

## Packaged builds (electron-builder)

When you package your app, include the `SpeechHelper.app` helper bundle in your app's resources:

```js
// electron-builder.config.js
module.exports = {
  extraResources: [
    {
      from: "node_modules/electron-native-speech-backend-macos/bin/SpeechHelper.app",
      to: "SpeechHelper.app",
    },
  ],
}
```

The backend automatically looks in `process.resourcesPath` when running packaged, and falls back to the local `bin/` directory in development. The helper must run from an app bundle so macOS can honor the speech and microphone usage descriptions.

---

## Runnable example

The fastest way to see it working:

```bash
git clone https://github.com/varaprasadreddy9676/electron-native-speech
cd electron-native-speech/examples/basic-electron-app
npm install
npm start
```

Opens a window with file transcription and live microphone — no build step needed.

See [`examples/basic-electron-app/`](examples/basic-electron-app/) for the source (plain JS, ~100 lines).

---

## Repository structure

```
packages/
  core/             — TypeScript SDK (npm: electron-native-speech)
  backend-macos/    — macOS Swift backend + prebuilt binary
  preload/          — Electron contextBridge + IPC handlers
  demo-electron/    — Full-featured demo app (monorepo)
examples/
  basic-electron-app/ — Minimal standalone example (plain JS, no build step)
docs/
  PRD.md            — Product requirements document
```

---

## Roadmap

- [x] v1 — macOS file transcription
- [x] v1.1 — macOS live microphone
- [ ] v2 — Windows backend (Rust + Windows.Media.SpeechRecognition)
- [ ] v2.1 — Code signing for packaged builds

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to build the Swift binary from source, run the demo, and submit changes.

---

## License

MIT

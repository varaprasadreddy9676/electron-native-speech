# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2024-03-14

### Added

- **File transcription** — `transcribeFile()` using Apple `SFSpeechRecognizer` with per-word timestamps and confidence scores
- **Live microphone transcription** — `createSpeechSession()` using `AVAudioEngine` + `SFSpeechAudioBufferRecognitionRequest` with interim and final results
- **Persistent Swift helper process** — starts once per app lifetime; zero per-call spawn overhead
- **Universal binary** — single `SpeechHelper` binary supporting Apple Silicon (arm64) and Intel (x86_64)
- **Prebuilt binary ships in the npm package** — no manual build step required after `npm install`
- **Electron-safe IPC** — works with `contextIsolation: true` and `nodeIntegration: false`
- **Automatic format handling** — native formats served directly; unsupported containers (WebM, Ogg) auto-converted via AVFoundation export
- **`getSpeechAvailability()`** — checks authorization state before attempting transcription
- **`postinstall` check** — warns if binary is missing, fixes execute permissions automatically
- **Packages**: `electron-native-speech` (core), `electron-native-speech-backend-macos` (Swift backend), `electron-native-speech-preload` (contextBridge + IPC handlers)

### Supported formats

`.wav`, `.m4a`, `.mp3`, `.aac`, `.aiff`, `.caf`, `.mp4`, `.mov` — direct
`.webm`, `.ogg`, others — auto-converted via AVFoundation

### Requirements

- macOS 13 Ventura or later
- Electron 28 or later
- Node.js 18 or later

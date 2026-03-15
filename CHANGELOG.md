# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.6] — 2026-03-15

### Changed

- **macOS helper launch fallback** — keep the current `SpeechHelper.app` launch path as the default and add a LaunchServices fallback for newer macOS releases that reject helper speech usage under the standard launch mode
- **Fallback override** — allow forcing the LaunchServices path with `ENS_SPEECH_HELPER_LAUNCH_MODE=launchservices` for debugging or affected macOS environments

### Fixed

- Future macOS compatibility risk where `SpeechHelper` can fail or be killed under stricter app launch and code-signing enforcement
## [0.1.5] — 2026-03-14

### Changed

- **Single-package install** — make `npm install electron-native-speech` the supported install path for normal users by moving the macOS backend and preload bridge to regular dependencies
- **Main-package Electron helpers** — expose `registerSpeechHandlers` and `exposeElectronSpeech` from `electron-native-speech/main-handlers` and `electron-native-speech/preload`
- **Examples and docs** — update the README, demo app, and basic example app to use only `electron-native-speech`

### Fixed

- User-facing install guidance that still pushed direct use of `electron-native-speech-preload` and `electron-native-speech-backend-macos`

## [0.1.4] — 2026-03-14

### Added

- **Package READMEs** — add npm-ready README files for `electron-native-speech`, `electron-native-speech-preload`, and `electron-native-speech-backend-macos`

### Changed

- **npm package pages** — publish fresh patch versions so each package renders its own README on npm instead of showing "No README data found!"

## [0.1.3] — 2026-03-14

### Changed

- **macOS helper architecture** — run `SpeechHelper` as a launchable app bundle and communicate over a local socket instead of direct child-process execution
- **Reliable permissions** — request Speech Recognition and Microphone access from the helper app context so live transcription and file transcription do not abort under macOS TCC
- **Live session bridge** — return a plain bridged session object from the preload layer so `createSpeechSession()` works correctly through `contextBridge`
- **File transcription behavior** — remove the on-device-only requirement for uploaded audio files so MP3 transcription returns text instead of empty segments
- **Example app stability** — fix session stop/dispose ordering and patch Electron's dev `Info.plist` automatically for local example and demo runs
- **Release packages** — publish updated `electron-native-speech`, `electron-native-speech-preload`, and `electron-native-speech-backend-macos` patch releases with the macOS fixes

### Fixed

- `SpeechHelper exited (code=null, signal=SIGABRT)` during speech authorization and file transcription on macOS
- Live transcription no-op behavior caused by stripped prototype methods across the preload bridge
- Empty-text transcript segments returned for uploaded MP3 files with clear speech content

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

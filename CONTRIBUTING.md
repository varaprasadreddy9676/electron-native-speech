# Contributing

Thanks for your interest in contributing to electron-native-speech.

---

## Requirements

- macOS 13 or later
- Xcode 15 or later (for Swift compiler)
- Node.js 18 or later
- npm 9 or later

---

## Setup

```bash
git clone https://github.com/varaprasadreddy9676/electron-native-speech
cd electron-native-speech
npm install
```

---

## Building the Swift binary

The prebuilt binary ships in the npm package. If you want to build it yourself (e.g. after modifying Swift source):

```bash
npm run build:swift --workspace packages/backend-macos
```

This builds a universal binary (arm64 + x86_64) and places it at `packages/backend-macos/bin/SpeechHelper`.

What the script does:
1. `swift build -c release --arch arm64`
2. `swift build -c release --arch x86_64`
3. `lipo -create` to combine into a universal binary

The Swift source is in `packages/backend-macos/swift/Sources/SpeechHelper/`.

---

## Building TypeScript

```bash
npm run build          # build all TypeScript packages
npm run typecheck      # type-check without emitting
```

Or for a specific package:

```bash
npm run build --workspace packages/core
npm run build --workspace packages/preload
npm run build --workspace packages/backend-macos
```

---

## Running the demo app

```bash
# Build Swift binary first (once)
npm run build:swift --workspace packages/backend-macos

# Start the demo
npm run dev --workspace packages/demo-electron
```

The demo app demonstrates file transcription and live microphone in a minimal Electron window.

---

## Project structure

```
packages/
  core/
    src/
      types.ts           — All public TypeScript types
      index.ts           — getSpeechAvailability, transcribeFile, createSpeechSession
      backend-loader.ts  — Dynamic platform backend loading
  backend-macos/
    src/
      index.ts           — ISpeechBackend implementation
      helper-process.ts  — Persistent Swift process manager
      live-session.ts    — MacOSLiveSpeechSession
    swift/Sources/SpeechHelper/
      main.swift         — Command dispatcher + runloop
      FileTranscriber.swift — File transcription
      LiveSession.swift  — Live microphone session
    bin/
      SpeechHelper       — Prebuilt universal binary (committed)
    scripts/
      postinstall.js     — Checks binary exists, fixes permissions
  preload/
    src/
      index.ts           — exposeElectronSpeech() (contextBridge)
      main-handlers.ts   — registerSpeechHandlers() (ipcMain)
  demo-electron/
    src/
      main.ts            — Electron main process
      preload.ts         — Preload script
      renderer.ts        — Demo renderer
```

---

## IPC protocol

The Swift helper communicates over stdin/stdout using newline-delimited JSON.

**Request format:**
```json
{"id": "uuid", "command": "transcribeFile", "filePath": "/path/to/audio.wav", "locale": "en-US"}
```

**Response format:**
```json
{"id": "uuid", "segments": [...]}
```

**Event format (live sessions):**
```json
{"event": "event:<sessionId>", "type": "result", "text": "Hello", "isFinal": true, "segments": [...]}
```

---

## Submitting changes

1. Fork the repository
2. Create a branch: `git checkout -b my-feature`
3. Make your changes and add tests if applicable
4. Run `npm run typecheck` to verify TypeScript
5. Open a pull request with a clear description of the change

For significant changes, open an issue first to discuss the approach.

---

## Releasing (maintainers)

1. Update version in all `packages/*/package.json`
2. Update `CHANGELOG.md`
3. Build and publish:
   ```bash
   npm run build --workspaces
   npm publish --workspace packages/core
   npm publish --workspace packages/backend-macos
   npm publish --workspace packages/preload
   ```
4. Create a GitHub release with the tag `v{version}` and paste the CHANGELOG entry as release notes

# electron-native-speech

Core TypeScript API for native speech transcription in Electron.

This package provides the shared types and high-level API:

- `getSpeechAvailability()`
- `transcribeFile()`
- `createSpeechSession()`

On macOS, it auto-loads `electron-native-speech-backend-macos` at runtime.

## Install

```bash
npm install electron-native-speech
```

On macOS, the backend package is normally installed automatically as an optional dependency.
If your environment skips optional dependencies, install it explicitly:

```bash
npm install electron-native-speech electron-native-speech-backend-macos
```

## When to use this package

Use this package when you want:

- the core speech API and types
- direct access from Node or the Electron main process
- a shared abstraction for custom backends or tests

If you need to expose speech APIs to a context-isolated Electron renderer, also install:

```bash
npm install electron-native-speech-preload
```

## Usage

### File transcription

```ts
import { getSpeechAvailability, transcribeFile } from "electron-native-speech"

const availability = await getSpeechAvailability()
if (!availability.available) {
  throw new Error(availability.reason ?? "Speech recognition unavailable")
}

const result = await transcribeFile({
  filePath: "/absolute/path/to/recording.mp3",
  locale: "en-US",
})

for (const segment of result.segments) {
  console.log(`[${segment.startMs}ms - ${segment.endMs}ms] ${segment.text}`)
}
```

### Live microphone

```ts
import { createSpeechSession } from "electron-native-speech"

const session = await createSpeechSession()

const offResult = session.on("result", (result) => {
  console.log(result.text, result.isFinal ? "(final)" : "(interim)")
})

const offError = session.on("error", (error) => {
  console.error(error.code, error.message)
})

await session.start({
  locale: "en-US",
  interimResults: true,
  continuous: true,
})

// later
await session.stop()
await session.dispose()
offResult()
offError()
```

## API

### `getSpeechAvailability()`

```ts
getSpeechAvailability(): Promise<SpeechAvailability>
```

Checks whether a supported backend is present and speech recognition is available.

### `transcribeFile(options)`

```ts
transcribeFile(options: FileTranscriptionOptions): Promise<FileTranscriptionResult>
```

Recognizes speech from a local audio or video file.

### `createSpeechSession()`

```ts
createSpeechSession(): Promise<SpeechSession>
```

Creates a live microphone recognition session.

## Custom backends and tests

This package also exports:

- `setBackend()`
- `resetBackend()`
- `SpeechRecognitionError`
- all public speech types

That is useful if you want to inject a mock backend in tests or provide your own implementation.

## Platform support

- macOS 13+
- Electron 28+
- Node.js 18+

Windows and Linux backends are not published yet.

## Electron apps

For a complete Electron integration with `contextIsolation: true`, use:

- `electron-native-speech` for the shared API and types
- `electron-native-speech-preload` for the preload bridge and IPC handlers

Full documentation and examples:

- https://github.com/varaprasadreddy9676/electron-native-speech

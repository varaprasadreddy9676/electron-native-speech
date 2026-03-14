# electron-native-speech-backend-macos

macOS backend for `electron-native-speech`.

Most users should not install this package directly.
Install `electron-native-speech` and let it bring this backend in as an internal dependency.

This package provides the native macOS implementation backed by Apple's Speech framework and AVFoundation.
It also ships the bundled `SpeechHelper.app` helper used at runtime.

## Install

Most apps should install only the top-level package:

```bash
npm install electron-native-speech
```

Install this package directly if:

- your environment requires an explicit backend dependency
- you want to depend on the macOS backend explicitly
- you are wiring the backend manually in tests or custom integrations

```bash
npm install electron-native-speech electron-native-speech-backend-macos
```

## What this package does

- transcribes local audio and video files on macOS
- creates live microphone speech sessions
- launches `SpeechHelper.app` as a real macOS app bundle
- requests Speech Recognition and Microphone permissions from the helper app context
- ships a prebuilt universal helper for Apple Silicon and Intel Macs

## Direct usage

Usually, `electron-native-speech` loads this backend automatically on macOS and you should not reference this package directly.

If you want to wire it explicitly:

```ts
import { setBackend, transcribeFile } from "electron-native-speech"
import { MacOSSpeechBackend } from "electron-native-speech-backend-macos"

setBackend(new MacOSSpeechBackend())

const result = await transcribeFile({
  filePath: "/absolute/path/to/audio.mp3",
  locale: "en-US",
})

console.log(result.segments)
```

You can also use the backend class directly:

```ts
import { MacOSSpeechBackend } from "electron-native-speech-backend-macos"

const backend = new MacOSSpeechBackend()
const availability = await backend.checkAvailability()
console.log(availability)
```

## Exports

- `MacOSSpeechBackend`
- `checkAvailability()`
- `transcribeFile()`
- `MacOSLiveSpeechSession`
- `disposeHelperProcess()`

## Supported formats

Direct:

- `.wav`
- `.m4a`
- `.mp3`
- `.aac`
- `.aiff`
- `.caf`
- `.mp4`
- `.mov`

Auto-converted through AVFoundation when needed:

- `.webm`
- `.ogg`
- other containers AVFoundation can import

## Permissions

Your host app must define:

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>This app uses speech recognition to transcribe audio.</string>

<key>NSMicrophoneUsageDescription</key>
<string>This app accesses the microphone for live speech recognition.</string>
```

Notes:

- file transcription requires Speech Recognition permission
- live microphone requires both Speech Recognition and Microphone permission
- the helper must run from an app bundle so macOS TCC honors those usage descriptions

## Packaged Electron apps

Include `SpeechHelper.app` in your packaged app resources:

```js
module.exports = {
  extraResources: [
    {
      from: "node_modules/electron-native-speech-backend-macos/bin/SpeechHelper.app",
      to: "SpeechHelper.app",
    },
  ],
}
```

At runtime, the backend looks in:

- `process.resourcesPath/SpeechHelper.app` for packaged apps
- the local package `bin/` directory in development

## Building from source

This package already ships a prebuilt helper binary.

If you need to rebuild it locally:

```bash
npm run build:all --workspace packages/backend-macos
```

That rebuilds the Swift helper, recreates the universal binary, codesigns the helper app, and rebuilds the TypeScript layer.

## Requirements

- macOS 13+
- Node.js 18+
- Electron 28+ for Electron integrations

Project docs and examples:

- https://github.com/varaprasadreddy9676/electron-native-speech

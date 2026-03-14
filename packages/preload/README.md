# electron-native-speech-preload

Secure Electron preload bridge for `electron-native-speech`.

This package is the Electron-facing layer that:

- exposes `window.electronSpeech` from your preload script
- registers IPC handlers in the main process
- works with `contextIsolation: true` and `nodeIntegration: false`

## Install

```bash
npm install electron-native-speech electron-native-speech-preload
```

On macOS you also need the backend package, which is usually installed automatically with `electron-native-speech`:

```bash
npm install electron-native-speech-backend-macos
```

## When to use this package

Use this package if your Electron app has:

- a preload script
- a renderer that should not import Node APIs directly
- `contextIsolation: true`

## Main process

Register the speech IPC handlers once your window is created:

```ts
import path from "node:path"
import { app, BrowserWindow, ipcMain } from "electron"
import { registerSpeechHandlers } from "electron-native-speech-preload/main-handlers"

let cleanupSpeech: (() => void) | undefined

app.whenReady().then(() => {
  const win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  cleanupSpeech = registerSpeechHandlers(ipcMain, win.webContents)
})

app.on("before-quit", () => {
  cleanupSpeech?.()
})
```

## Preload script

Expose the renderer-safe API:

```ts
import { exposeElectronSpeech } from "electron-native-speech-preload"

exposeElectronSpeech()
```

By default this exposes `window.electronSpeech`.

You can customize the global key:

```ts
exposeElectronSpeech("speech")
```

## Renderer usage

### File transcription

```ts
const result = await window.electronSpeech.transcribeFile({
  filePath: "/absolute/path/to/audio.mp3",
  locale: "en-US",
})

console.log(result.segments)
```

### Live microphone

```ts
const session = window.electronSpeech.createSpeechSession()

session.on("result", (result) => {
  console.log(result.text)
})

session.on("state", (state) => {
  console.log("state:", state)
})

session.on("error", (error) => {
  console.error(error.code, error.message)
})

await session.start({
  locale: "en-US",
  interimResults: true,
  continuous: true,
})
```

## Exports

### `exposeElectronSpeech(key?)`

Exposes a renderer-safe API on `window`.

### `registerSpeechHandlers(ipcMain, webContents)`

Registers the Electron IPC handlers that back the renderer API.
Returns a cleanup function that should be called when shutting down the app or window.

## macOS permissions

Your app must include these usage descriptions in `Info.plist`:

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>This app uses speech recognition to transcribe audio.</string>

<key>NSMicrophoneUsageDescription</key>
<string>This app accesses the microphone for live speech recognition.</string>
```

For local development against the unbundled Electron app, your host Electron bundle also needs these keys.

## Packaged builds

When packaging your Electron app, include the backend helper app in your resources:

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

## Related packages

- `electron-native-speech`: core API and types
- `electron-native-speech-backend-macos`: macOS backend and bundled helper app

Full documentation and runnable examples:

- https://github.com/varaprasadreddy9676/electron-native-speech

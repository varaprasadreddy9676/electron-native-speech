#!/usr/bin/env node
"use strict"

const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const binaryPath = path.join(__dirname, "..", "bin", "SpeechHelper")
const helperAppPath = path.join(__dirname, "..", "bin", "SpeechHelper.app")
const helperAppBinaryPath = path.join(helperAppPath, "Contents", "MacOS", "SpeechHelper")
const helperAppPlistPath = path.join(helperAppPath, "Contents", "Info.plist")

if (process.platform !== "darwin") {
  // Not macOS — skip silently (Windows backend will be a separate package)
  process.exit(0)
}

if (!fs.existsSync(binaryPath)) {
  console.error(`
[electron-native-speech-backend-macos] SpeechHelper binary not found.

This usually means the package was installed from source rather than npm.
To build the binary from source, run:

  cd node_modules/electron-native-speech-backend-macos
  npm run build:swift

This requires Xcode command line tools: xcode-select --install
`)
  // Exit 0 — don't fail the install, just warn
  process.exit(0)
}

const stats = fs.statSync(binaryPath)
if (!(stats.mode & 0o111)) {
  // Ensure binary is executable (npm sometimes strips execute bits)
  fs.chmodSync(binaryPath, 0o755)
}

fs.mkdirSync(path.dirname(helperAppBinaryPath), { recursive: true })
fs.copyFileSync(binaryPath, helperAppBinaryPath)
fs.chmodSync(helperAppBinaryPath, 0o755)
fs.writeFileSync(helperAppPlistPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>SpeechHelper</string>
  <key>CFBundleExecutable</key>
  <string>SpeechHelper</string>
  <key>CFBundleIdentifier</key>
  <string>dev.electron-native-speech.SpeechHelper</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>SpeechHelper</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>This app accesses the microphone for live speech recognition.</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>This app uses speech recognition to transcribe audio.</string>
</dict>
</plist>
`)
execFileSync(
  "/usr/bin/codesign",
  ["--force", "--sign", "-", "--identifier", "dev.electron-native-speech.SpeechHelper", helperAppPath],
  { stdio: "ignore" }
)

console.log("[electron-native-speech] SpeechHelper ready ✓")

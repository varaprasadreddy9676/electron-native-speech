#!/usr/bin/env node
"use strict"

const fs = require("fs")
const path = require("path")

const binaryPath = path.join(__dirname, "..", "bin", "SpeechHelper")

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

console.log("[electron-native-speech] SpeechHelper ready ✓")

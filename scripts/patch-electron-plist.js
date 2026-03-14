#!/usr/bin/env node

"use strict"

const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const REQUIRED_KEYS = {
  NSSpeechRecognitionUsageDescription:
    "This app uses speech recognition to transcribe audio.",
  NSMicrophoneUsageDescription:
    "This app accesses the microphone for live speech recognition.",
}

function resolveElectronPlist() {
  const electronPackageJson = require.resolve("electron/package.json", {
    paths: [process.cwd()],
  })
  const electronDir = path.dirname(electronPackageJson)
  const plistPath = path.join(electronDir, "dist", "Electron.app", "Contents", "Info.plist")

  if (!fs.existsSync(plistPath)) {
    throw new Error(`Electron Info.plist not found at ${plistPath}`)
  }

  return plistPath
}

function readPlistValue(plistPath, key) {
  try {
    return execFileSync(
      "/usr/bin/plutil",
      ["-extract", key, "raw", "-o", "-", plistPath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim()
  } catch {
    return null
  }
}

function setPlistKey(plistPath, key, value) {
  execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plistPath], {
    stdio: "ignore",
  })
}

function addPlistKey(plistPath, key, value) {
  execFileSync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${value}`, plistPath], {
    stdio: "ignore",
  })
}

function ensureUsageDescriptions(plistPath) {
  let changed = false

  for (const [key, value] of Object.entries(REQUIRED_KEYS)) {
    const existingValue = readPlistValue(plistPath, key)
    if (existingValue === value) continue
    if (existingValue === null) {
      addPlistKey(plistPath, key, value)
    } else {
      setPlistKey(plistPath, key, value)
    }
    changed = true
  }

  return changed
}

function main() {
  if (process.platform !== "darwin") return

  const plistPath = resolveElectronPlist()
  const changed = ensureUsageDescriptions(plistPath)

  if (changed) {
    console.log(`[electron-native-speech] Updated Electron Info.plist: ${plistPath}`)
  } else {
    console.log(`[electron-native-speech] Electron Info.plist already has speech permissions: ${plistPath}`)
  }
}

main()

/// <reference path="../src/preload.ts" />
/* global window */

"use strict"

// ─── Availability ─────────────────────────────────────────────────────────────

const avBar = document.getElementById("availability-bar")

;(async () => {
  try {
    const av = await window.electronSpeech.getSpeechAvailability()
    if (av.available) {
      avBar.textContent = `Available · platform: ${av.platform} · mode: ${av.mode ?? "unknown"}`
      avBar.className = "ok"
    } else {
      avBar.textContent = `Unavailable: ${av.reason ?? "unknown reason"}`
      avBar.className = "error"
    }
  } catch (err) {
    avBar.textContent = `Error checking availability: ${err.message}`
    avBar.className = "error"
  }
})()

// ─── File transcription ───────────────────────────────────────────────────────

const pickFileBtn = document.getElementById("pick-file-btn")
const filePathEl = document.getElementById("file-path")
const fileLocaleEl = document.getElementById("file-locale")
const transcribeBtn = document.getElementById("transcribe-btn")
const fileTranscriptEl = document.getElementById("file-transcript")

let selectedFilePath = null

pickFileBtn.addEventListener("click", async () => {
  const filePath = await window.electronDialog.openFile()
  if (!filePath) return
  selectedFilePath = filePath
  filePathEl.textContent = filePath
  filePathEl.style.display = "block"
  transcribeBtn.disabled = false
})

transcribeBtn.addEventListener("click", async () => {
  if (!selectedFilePath) return

  transcribeBtn.disabled = true
  transcribeBtn.textContent = "Transcribing…"
  fileTranscriptEl.innerHTML = '<p class="progress">Recognizing speech — this may take a moment for long files…</p>'

  const start = Date.now()

  try {
    const result = await window.electronSpeech.transcribeFile({
      filePath: selectedFilePath,
      locale: fileLocaleEl.value,
    })

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)

    if (!result.segments || result.segments.length === 0) {
      fileTranscriptEl.innerHTML = '<p class="empty-hint">No speech detected in the file.</p>'
      return
    }

    const html = result.segments.map((seg) => {
      const ts = formatMs(seg.startMs)
      return `<div class="segment">
        <span class="ts">${ts}</span>
        <span class="txt">${escapeHtml(seg.text)}</span>
      </div>`
    }).join("")

    const meta = `<p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">
      ${result.segments.length} segments · ${elapsed}s · locale: ${result.locale ?? fileLocaleEl.value}
    </p>`

    fileTranscriptEl.innerHTML = meta + html
  } catch (err) {
    fileTranscriptEl.innerHTML = `<p style="color:var(--error)">Error: ${escapeHtml(err.message)}</p>`
  } finally {
    transcribeBtn.disabled = false
    transcribeBtn.textContent = "Transcribe"
  }
})

// ─── Live transcription ───────────────────────────────────────────────────────

const liveStatusEl = document.getElementById("live-status")
const liveLocaleEl = document.getElementById("live-locale")
const startLiveBtn = document.getElementById("start-live-btn")
const stopLiveBtn = document.getElementById("stop-live-btn")
const liveTranscriptEl = document.getElementById("live-transcript")

let liveSession = null
let interimEl = null

function setLiveStatus(state) {
  const dot = liveStatusEl.querySelector(".dot")
  liveStatusEl.className = `status-pill ${state}`
  liveStatusEl.innerHTML = `<span class="dot"></span> ${state}`
}

startLiveBtn.addEventListener("click", async () => {
  startLiveBtn.disabled = true
  stopLiveBtn.disabled = false
  liveTranscriptEl.innerHTML = ""
  setLiveStatus("starting")

  try {
    liveSession = window.electronSpeech.createSpeechSession()

    liveSession.on("state", (state) => {
      setLiveStatus(state)
      if (state === "stopped" || state === "error") {
        startLiveBtn.disabled = false
        stopLiveBtn.disabled = true
        liveSession = null
        interimEl = null
      }
    })

    liveSession.on("result", (result) => {
      if (!result.isFinal) {
        // Show interim result in-place
        if (!interimEl) {
          interimEl = document.createElement("p")
          interimEl.className = "interim"
          liveTranscriptEl.appendChild(interimEl)
        }
        interimEl.textContent = result.text
      } else {
        // Finalize — replace interim with a proper segment
        if (interimEl) {
          interimEl.remove()
          interimEl = null
        }
        if (result.text.trim()) {
          const seg = document.createElement("div")
          seg.className = "segment"
          const ts = result.timestampMs != null ? formatMs(result.timestampMs) : ""
          seg.innerHTML = `<span class="ts">${ts}</span><span class="txt">${escapeHtml(result.text)}</span>`
          liveTranscriptEl.appendChild(seg)
          liveTranscriptEl.scrollTop = liveTranscriptEl.scrollHeight
        }
      }
    })

    liveSession.on("error", (err) => {
      const p = document.createElement("p")
      p.style.color = "var(--error)"
      p.textContent = `Error: ${err.message}`
      liveTranscriptEl.appendChild(p)
    })

    await liveSession.start({
      locale: liveLocaleEl.value,
      interimResults: true,
      continuous: true,
    })
  } catch (err) {
    const p = document.createElement("p")
    p.style.color = "var(--error)"
    p.textContent = `Failed to start: ${err.message}`
    liveTranscriptEl.appendChild(p)
    setLiveStatus("error")
    startLiveBtn.disabled = false
    stopLiveBtn.disabled = true
  }
})

stopLiveBtn.addEventListener("click", async () => {
  if (!liveSession) return
  stopLiveBtn.disabled = true
  await liveSession.stop()
  await liveSession.dispose()
  liveSession = null
  interimEl = null
})

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

"use strict"

// ── Availability ──────────────────────────────────────────────────────────────

const avEl = document.getElementById("availability")
window.electronSpeech.getSpeechAvailability().then((av) => {
  avEl.textContent = av.available ? "Speech recognition is available ✓" : `Unavailable: ${av.reason}`
  avEl.className = av.available ? "ok" : "error"
}).catch((err) => {
  avEl.textContent = `Error: ${err.message}`
  avEl.className = "error"
})

// ── File transcription ────────────────────────────────────────────────────────

let selectedFile = null

const pickBtn = document.getElementById("pick-btn")
const filePathEl = document.getElementById("file-path")
const transcribeBtn = document.getElementById("transcribe-btn")
const transcriptEl = document.getElementById("transcript")

pickBtn.addEventListener("click", async () => {
  const filePath = await window.dialog.openFile()
  if (!filePath) return
  selectedFile = filePath
  filePathEl.textContent = filePath
  transcribeBtn.disabled = false
})

transcribeBtn.addEventListener("click", async () => {
  transcribeBtn.disabled = true
  transcribeBtn.textContent = "Transcribing…"
  transcriptEl.innerHTML = "<p class='hint'>Recognizing speech…</p>"

  try {
    const result = await window.electronSpeech.transcribeFile({ filePath: selectedFile })

    if (!result.segments || result.segments.length === 0) {
      transcriptEl.innerHTML = "<p class='hint'>No speech detected.</p>"
      return
    }

    const fullText = result.segments
      .map((seg) => String(seg.text ?? "").trim())
      .filter(Boolean)
      .join(" ")

    transcriptEl.innerHTML = `
      <p class="hint">${fullText ? esc(fullText) : "Transcript returned segment timing, but the segment text was empty."}</p>
      ${result.segments.map((seg, index) => `
      <div class="segment">
        <span class="ts">${formatMs(seg.startMs)}</span>
        <span>${esc(String(seg.text ?? "").trim() || `[segment ${index + 1}: empty text]`)}</span>
      </div>
    `).join("")}
    `
  } catch (err) {
    transcriptEl.innerHTML = `<p class="err">Error: ${esc(err.message)}</p>`
  } finally {
    transcribeBtn.disabled = false
    transcribeBtn.textContent = "Transcribe"
  }
})

// ── Live microphone ───────────────────────────────────────────────────────────

const liveStatusEl = document.getElementById("live-status")
const startBtn = document.getElementById("start-btn")
const stopBtn = document.getElementById("stop-btn")
const liveEl = document.getElementById("live-transcript")

let session = null
let interimP = null

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true
  stopBtn.disabled = false
  liveEl.innerHTML = ""

  session = window.electronSpeech.createSpeechSession()

  session.on("state", (state) => {
    liveStatusEl.textContent = state
    liveStatusEl.className = state === "listening" ? "listening" : ""
    if (state === "stopped" || state === "error") {
      startBtn.disabled = false
      stopBtn.disabled = true
      session = null
      interimP = null
    }
  })

  session.on("result", (r) => {
    if (!r.isFinal) {
      if (!interimP) {
        interimP = document.createElement("p")
        interimP.className = "interim"
        liveEl.appendChild(interimP)
      }
      interimP.textContent = r.text
    } else {
      if (interimP) { interimP.remove(); interimP = null }
      if (r.text.trim()) {
        const div = document.createElement("div")
        div.className = "segment"
        div.innerHTML = `<span class="ts"></span><span>${esc(r.text)}</span>`
        liveEl.appendChild(div)
        liveEl.scrollTop = liveEl.scrollHeight
      }
    }
  })

  session.on("error", (e) => {
    const p = document.createElement("p")
    p.className = "err"
    p.textContent = `Error: ${e.message}`
    liveEl.appendChild(p)
  })

  try {
    await session.start({ locale: "en-US", interimResults: true, continuous: true })
  } catch (err) {
    liveEl.innerHTML = `<p class="err">Failed to start: ${esc(err.message)}</p>`
    startBtn.disabled = false
    stopBtn.disabled = true
  }
})

stopBtn.addEventListener("click", async () => {
  if (!session) return
  const activeSession = session
  stopBtn.disabled = true
  await activeSession.stop()
  await activeSession.dispose()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

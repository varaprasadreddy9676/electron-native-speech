# Electron Native Speech
**Product Requirements Document (PRD) + Technical Design**

- **Version:** v1.1 draft
- **Status:** Revised
- **Owner:** Sai
- **Repository:** `electron-native-speech`

---

## 1. Executive Summary

Electron applications do not have a reliable, native, and secure way to access operating system speech recognition.

**Electron Native Speech** is an SDK for Electron apps that provides **native speech transcription through OS speech frameworks** using a unified JavaScript/TypeScript interface.

The initial releases intentionally prioritize practicality over breadth:

- **v1:** macOS native **file transcription**
- **v1.1:** macOS native **live microphone transcription**

This phased approach is designed to produce a production-credible SDK that respects real platform constraints around permissions, packaging, app identity, media formats, and Electron security boundaries.

---

## 2. Background and Problem Statement

Electron developers often want speech transcription without relying on:

- cloud APIs
- third-party speech vendors
- browser speech APIs
- custom ML inference stacks

However, Electron does not expose native OS speech engines directly, and operating system speech APIs introduce important constraints around:

- permissions
- application identity
- signed and packaged app behavior
- input media compatibility
- secure process boundaries
- runtime lifecycle ownership

As a result, many Electron teams either avoid native speech entirely or build fragile one-off integrations.

This SDK exists to solve that gap in a reusable, production-oriented way.

---

## 3. Product Vision

Electron Native Speech should become the **default local/native speech foundation for Electron apps**, starting with a narrow, reliable macOS-first scope and expanding only after the first release is proven in packaged production builds.

---

## 4. Product Goals

### 4.1 Primary Goals

- Provide a simple Electron-friendly API for native speech transcription.
- Work with `contextIsolation: true` and `nodeIntegration: false`.
- Use OS-native speech frameworks instead of cloud APIs.
- Support packaged production builds, not just development mode.
- Provide clear availability checks and actionable errors.
- Establish a stable foundation for future live transcription and cross-platform expansion.

### 4.2 Secondary Goals

- Support local-first or offline-capable flows where the OS allows it.
- Reduce implementation burden around permissions and packaging.
- Provide a reusable architecture that can later support Windows and additional modes.
- Keep the initial product small enough to be testable and maintainable.

---

## 5. Non-Goals

Out of scope for v1 and v1.1:

- translation
- speaker diarization
- text-to-speech
- browser-only support
- Linux support
- mobile support
- custom speech models
- cloud summarization
- meeting intelligence features
- speaker separation
- semantic post-processing of transcripts

These may be considered in future releases, but they are explicitly excluded from the first milestone set.

---

## 6. Scope by Version

## 6.1 Version 1 — macOS File Transcription

### In Scope

- transcription of local media files on macOS
- Electron-safe main/preload integration
- packaged macOS app support
- permission-aware backend behavior
- structured transcript output with timestamps
- supported input format handling
- audio preparation path for unsupported containers where necessary
- availability checks and structured error reporting

### Out of Scope

- live microphone streaming
- interim real-time transcript events
- Windows support
- Linux support
- renderer-direct native access

---

## 6.2 Version 1.1 — macOS Live Microphone Transcription

### Adds

- live microphone recognition sessions
- interim and final transcript events
- session lifecycle API
- continuous recognition mode
- locale selection for live mode
- state and error event streams

### Still Out of Scope

- Windows support
- Linux support
- diarization
- advanced semantic metadata
- phrase biasing unless later proven feasible

---

## 7. Target Users

### 7.1 Primary Users

Electron developers building:

- screen recording tools
- note-taking apps
- accessibility tools
- journaling apps
- meeting tools
- productivity apps
- captioning tools
- media editors

### 7.2 Secondary Users

- Electron framework maintainers
- open-source maintainers building desktop utilities
- internal platform teams standardizing native desktop capabilities

---

## 8. Platform Support

### 8.1 v1

| Platform | Status |
|---|---|
| macOS | Supported |
| Windows | Not in scope |
| Linux | Not in scope |

### 8.2 v1.1

| Platform | Status |
|---|---|
| macOS | Supported |
| Windows | Planned next |
| Linux | Planned later |

---

## 9. Product Modes

The SDK supports two distinct operating modes. These must be represented separately in both API design and implementation.

### 9.1 File Transcription

**Input:** local audio or video file path

**Output:** timestamped transcript segments

**Characteristics:**
- batch-oriented
- may require media preparation before recognition
- good fit for editors, recording imports, recorded sessions, and media workflows

---

### 9.2 Live Microphone Transcription

**Input:** live microphone audio

**Output:** streamed interim and final recognition events

**Characteristics:**
- session-oriented
- real-time user experience
- stronger lifecycle and event requirements
- more sensitive to permissions, interruptions, and runtime ownership

---

## 10. Core Features

### 10.1 v1 Core Features

- transcribe local media files using native macOS speech capabilities
- return normalized transcript segments
- handle speech and microphone permission requirements
- support Electron-safe integration patterns
- provide availability checks and failure reasons
- support packaged app builds reliably
- support or prepare supported input media formats
- clean up temporary prepared media when needed

### 10.2 v1.1 Additional Features

- start live recognition
- stop recognition
- abort recognition
- emit transcript events
- emit error events
- emit state events
- support locale selection
- support interim results
- support continuous mode

---

## 11. User Stories

- As a developer, I want to transcribe a local recording file so that I can add captions or analyze narration.
- As a developer, I want a secure Electron integration pattern so that native code is not exposed directly to the renderer.
- As a developer, I want clear unavailability reasons so that disabled features are understandable.
- As a developer, I want to start a live microphone transcription session so that I can display dictation or captions.
- As a developer, I want interim transcript updates so that the UI feels real-time.
- As a developer, I want packaged builds to work the same way as development builds so that I can ship with confidence.
- As a developer, I want transcript results normalized so that I can build UI and downstream logic without backend-specific branching.

---

## 12. API Design Principles

The API must be:

- Electron-safe
- TypeScript-friendly
- explicit about mode boundaries
- explicit about availability
- explicit about failure reasons
- minimal in v1
- extensible without breaking consumers later

The SDK must avoid pretending that file transcription and live transcription are the same thing internally. They may share utilities, but they must be modeled as separate workflows.

---

## 13. Proposed API Shape

### 13.1 v1 File Transcription

```ts
import { transcribeFile, getSpeechAvailability } from "electron-native-speech"

const availability = await getSpeechAvailability()

if (!availability.available) {
  console.error(availability.reason)
} else {
  const transcript = await transcribeFile({
    filePath: "/path/to/video.webm",
    locale: "en-US"
  })
}
```

**Normalized Output**

```ts
export type TranscriptSegment = {
  id: string
  startMs: number
  endMs: number
  text: string
  confidence?: number
}
```

**File Transcription Input**

```ts
export type FileTranscriptionOptions = {
  filePath: string
  locale?: string
}
```

**File Transcription Result**

```ts
export type FileTranscriptionResult = {
  segments: TranscriptSegment[]
  durationMs?: number
  locale?: string
}
```

---

### 13.2 v1.1 Live Session API

```ts
import { createSpeechSession } from "electron-native-speech"

const speech = await createSpeechSession()

speech.on("result", (result) => {
  console.log(result.text)
})

speech.on("error", (error) => {
  console.error(error)
})

speech.on("state", (state) => {
  console.log(state)
})

await speech.start({
  locale: "en-US",
  interimResults: true,
  continuous: true
})
```

**Live Result Shape**

```ts
export type LiveSpeechResult = {
  text: string
  isFinal: boolean
  confidence?: number
  timestampMs?: number
}
```

**Session Start Options**

```ts
export type SpeechSessionStartOptions = {
  locale?: string
  interimResults?: boolean
  continuous?: boolean
}
```

**Session Interface**

```ts
export interface SpeechSession {
  start(options?: SpeechSessionStartOptions): Promise<void>
  stop(): Promise<void>
  abort(): Promise<void>
  dispose(): Promise<void>

  on(event: "result", listener: (result: LiveSpeechResult) => void): () => void
  on(event: "error", listener: (error: SpeechError) => void): () => void
  on(event: "state", listener: (state: SpeechSessionState) => void): () => void
}
```

**Session States**

```ts
export type SpeechSessionState =
  | "idle"
  | "starting"
  | "listening"
  | "stopping"
  | "stopped"
  | "error"
```

**Error Shape**

```ts
export type SpeechError = {
  code:
    | "unavailable"
    | "permission-denied"
    | "unsupported-locale"
    | "unsupported-input"
    | "missing-audio-track"
    | "no-speech-detected"
    | "backend-failure"
    | "invalid-state"
    | "unknown"
  message: string
  details?: unknown
}
```

---

## 14. Availability Model

The SDK must expose a clear way to check whether speech features are usable in the current environment.

```ts
export type SpeechAvailability = {
  available: boolean
  platform: string
  mode?: "file" | "live"
  reason?: string
  details?: unknown
}
```

At minimum, availability checks should consider:

- platform support
- backend presence
- packaged/runtime context where relevant
- permission preconditions
- locale support where known
- required helper/backend assets

---

## 15. System Architecture

The SDK should use a layered architecture without prematurely locking the project into one backend technology choice.

```
Electron App
    |
TypeScript SDK
    |
Platform Backend
    |
OS Speech Framework
```

### 15.1 TypeScript SDK Responsibilities

- developer-facing API
- input validation
- typed results
- event system
- Electron integration helpers
- error normalization
- lifecycle boundaries between file and live modes

### 15.2 Platform Backend Responsibilities

- native speech calls
- permission handling
- lifecycle control
- result translation
- input media preparation
- backend process management where applicable
- cleanup of temporary resources
- compatibility with packaged builds

### 15.3 Possible Backend Implementations

Possible implementation approaches include:

- helper app or helper executable
- native addon
- platform bridge process

The product requirements intentionally do not mandate a specific implementation technology. The implementation choice should be validated against packaged app compatibility requirements.

### 15.4 OS Layer

For initial scope, macOS uses Apple native frameworks and related media APIs.

---

## 16. macOS Technical Design Requirements

macOS support must reflect real platform behavior and not assume that development-mode success automatically means production readiness.

### 16.1 Native Frameworks

Likely frameworks include:

- Speech
- AVFoundation

### 16.2 Required Permissions

The main app and any native helper used for speech must properly handle:

- `NSSpeechRecognitionUsageDescription`
- `NSMicrophoneUsageDescription`

### 16.3 Important Platform Constraint

Speech permission behavior is tied to application identity and bundle context. Packaged helper applications or helper executables may be required for reliable production behavior.

This must be treated as a first-class design concern, not as a late packaging detail.

### 16.4 Input Handling

Native speech cannot assume that every Electron-recorded media format is directly accepted.

The SDK must support:

- direct transcription of supported inputs
- optional media preparation for unsupported audio/video containers
- cleanup of temporary prepared files
- caching or sidecar prepared audio where helpful and safe

### 16.5 File Mode Design Requirements

For v1 file transcription, the backend must:

- validate file existence
- detect presence of usable audio
- reject unsupported or invalid inputs with actionable errors
- return normalized transcript segments with timestamps
- avoid leaking temporary resources across repeated runs

### 16.6 Live Mode Design Requirements

For v1.1 live transcription, the backend must:

- manage microphone session lifecycle
- support start, stop, abort, and dispose
- emit interim and final results
- survive repeated start/stop cycles
- fail cleanly on interruptions or permission denial

---

## 17. Electron Integration Requirements

The SDK must support:

- `contextIsolation: true`
- `nodeIntegration: false`

Recommended integration pattern:

- renderer calls preload bridge
- preload calls Electron IPC
- main process owns backend access

The renderer must never directly own native backend access.

**Example Integration Pattern**

```
Renderer UI
    |
Preload Bridge
    |
IPC
    |
Main Process
    |
Speech Backend
```

This must be the documented default integration pattern.

---

## 18. Repository Structure

```
electron-native-speech
|
├── packages
│   ├── core
│   ├── backend-macos
│   ├── preload
│   └── demo-electron
|
├── docs
├── README.md
├── LICENSE
├── CHANGELOG.md
└── CONTRIBUTING.md
```

If Windows support is later added: `packages/backend-windows`

**Recommended docs structure:**

```
docs/
├── PRD.md
├── architecture.md
├── packaging.md
├── api.md
└── troubleshooting.md
```

---

## 19. Security Requirements

The SDK must:

- keep native execution inside trusted process boundaries
- avoid direct renderer access to native APIs
- sanitize backend errors before surfacing to JS
- avoid arbitrary command execution surfaces
- document preload/main integration clearly
- avoid requiring insecure Electron configuration

---

## 20. Performance Requirements

### 20.1 v1 File Mode

- file transcription startup should feel responsive
- media preparation and cleanup must be reliable
- repeated file transcription runs must not leak resources
- large temporary media artifacts must not accumulate silently

### 20.2 v1.1 Live Mode

- live session startup target under 300 ms where platform permits
- stable memory across repeated start/stop cycles
- no hanging sessions on app close
- no duplicate or orphaned sessions after reload or restart

---

## 21. Reliability Requirements

The SDK must gracefully handle:

- permission denial
- missing backend or helper assets
- unsupported file input
- missing audio track
- no speech detected
- unavailable locale
- app shutdown during active work
- microphone disconnection in live mode
- repeated initialization
- packaged versus development runtime differences

---

## 22. Testing Strategy

### 22.1 Unit Tests

- API validation
- transcript normalization
- availability checks
- error mapping
- event behavior
- media preparation decision logic

### 22.2 Integration Tests

**v1**

- transcribe supported audio file
- transcribe supported video file with audio
- packaged app build flow
- permission prompt flow
- missing audio track
- no speech detected
- unsupported input requiring preparation

**v1.1**

- start session
- stop session
- abort session
- repeated session lifecycle
- interim and final result delivery
- microphone interruption handling

### 22.3 Packaged App Testing

This is mandatory.

At minimum on macOS, the SDK must be validated in:

- development build
- packaged app build

A release is not complete if only development mode has been validated.

---

## 23. Distribution

The SDK will be distributed via npm.

```
npm install electron-native-speech
```

If backend assets, helper executables, or additional packaging steps are required, those steps must be documented explicitly and tested in the demo app.

---

## 24. Documentation Requirements

The repository must include:

- installation guide
- Electron integration guide
- packaged build guide
- permission troubleshooting
- supported input formats
- example Electron app
- API reference
- backend limitations and known constraints
- development versus packaged behavior notes

---

## 25. Success Metrics

Success will be measured by:

- successful integration in external Electron apps
- successful packaged production usage
- positive developer feedback
- npm adoption
- low support burden around permissions and packaging
- low ambiguity in issue reports due to clear documented failure modes

---

## 26. Risks and Mitigations

### 26.1 macOS Permission Complexity

**Risk:** Speech recognition depends on application identity, packaging, and permission behavior.

**Mitigation:** Design for packaged app support early. Document helper/backend requirements clearly. Validate packaged mode before release.

### 26.2 Media Format Compatibility

**Risk:** Electron-recorded media may not be directly accepted by native speech paths.

**Mitigation:** Include a media preparation layer in the design and document supported inputs clearly.

### 26.3 Electron Compatibility

**Risk:** Backend behavior may differ across Electron development and packaged runtime modes.

**Mitigation:** Test both environments as part of required release validation.

### 26.4 Cross-Platform Overreach

**Risk:** Trying to ship macOS and Windows simultaneously reduces quality.

**Mitigation:** Ship macOS first, stabilize APIs, then expand.

---

## 27. Acceptance Criteria

### 27.1 v1 Acceptance Criteria

1. An Electron app can install the package.
2. A macOS Electron app can transcribe a local media file.
3. Packaged macOS builds work correctly.
4. Transcript segments include timestamps.
5. Documentation is sufficient for integration in under 15 minutes.
6. Common failures return actionable errors.

### 27.2 v1.1 Acceptance Criteria

1. A macOS Electron app can start live microphone transcription.
2. Interim and final results are emitted.
3. Stop and abort behave correctly.
4. Repeated sessions do not leak or hang.
5. Locale configuration works for supported locales.

---

## 28. Delivery Milestones

**Milestone 1 — Project Foundation**
- repository scaffolding
- package layout
- public API skeleton
- demo Electron app
- documentation skeleton

**Milestone 2 — macOS File Backend**
- file transcription backend
- media input validation
- transcript normalization
- structured errors
- availability checks

**Milestone 3 — Packaged App Support**
- packaged app validation
- permission handling validation
- helper/backend packaging strategy
- troubleshooting guide

**Milestone 4 — Live Microphone Support**
- session lifecycle
- interim/final events
- state and error events
- repeated session stability

**Milestone 5 — Public Release Readiness**
- example integration
- polished README
- API docs
- release checklist
- initial npm release

---

## 29. Roadmap

**v1**
- macOS file transcription
- Electron-safe API
- packaged app support
- transcript normalization
- docs and demo app

**v1.1**
- macOS live microphone transcription
- session lifecycle
- interim/final events
- locale support

**v2**
- Windows backend
- unified live/file API across macOS and Windows
- richer metadata
- optional phrase hints if platform allows

---

## 30. Future Vision

Electron Native Speech can become a reliable local speech foundation for Electron apps.

Potential future directions include:

- Windows support
- Linux support
- caption pipelines
- accessibility tooling
- editor integrations
- transcription-aware automation
- optional provider abstractions for additional local engines

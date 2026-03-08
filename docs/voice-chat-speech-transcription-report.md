# Voice Chat Speech/Transcription Report

Date: March 5, 2026

## Summary

Voice input + voice reply was added as an additive path to the existing chat UX:

- Text chat behavior remains unchanged.
- If the user taps the microphone button, they can record speech.
- The recording is transcribed to text, sent through normal chat generation, and the assistant response is returned as:
  - text (as before), and
  - speech audio (new) for that response.

## Implemented Work

### 1) Shared AI provider support for speech/transcription

Updated:

- `src/lib/ai-provider.ts`

Added:

- `getSpeechModel(modelId)` -> OpenAI speech model resolver
- `getTranscriptionModel(modelId)` -> OpenAI transcription model resolver

Both rely on the existing OpenAI provider initialization and `OPENAI_API_KEY`.

### 2) New transcription API route

Added:

- `src/app/api/transcription/route.ts`

Behavior:

- Accepts `multipart/form-data` with `audio` file and optional `model`.
- Validates file type (`mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`) and non-empty size.
- Calls `experimental_transcribe` from `ai` with OpenAI transcription models.
- Returns transcript payload:
  - `text`
  - optional `segments`, `language`, `durationInSeconds`
- Handles:
  - missing API key (`503`)
  - no transcript generated (`422`)
  - generic errors (`500`)

### 3) New speech API route

Added:

- `src/app/api/speech/route.ts`

Behavior:

- Accepts JSON body with `text`, optional `model`, optional `voice`.
- Calls `experimental_generateSpeech` from `ai` with OpenAI speech models.
- Returns:
  - `base64`
  - `mimeType`
  - `dataUrl` (playable in browser)
- Handles:
  - missing API key (`503`)
  - no speech generated (`422`)
  - generic errors (`500`)

### 4) Chat UI integration (microphone + voice reply)

Updated:

- `src/components/chat/ThreadChatPanel.tsx`

Added behavior:

- Microphone button beside composer textarea.
- Browser recording via `MediaRecorder`.
- On stop:
  - creates audio `File`,
  - sends to `/api/transcription`,
  - uses transcript as normal `sendMessage({ text })`.
- For voice-originated prompts only:
  - after assistant text response is ready, requests `/api/speech`,
  - auto-attempts playback,
  - also renders inline `<audio controls>` under assistant message.
- Added voice-state statuses and voice-specific error messages.
- Added media cleanup on unmount and failure paths.

### 5) Verification

Executed after implementation:

- `pnpm -s typecheck` -> passed
- `pnpm -s lint` -> passed
- `pnpm -s test` -> passed (7 tests)

## Current Limitation

The current architecture is a two-step chain:

1. text generation stream
2. speech generation for completed text

Because TTS is generated after text completion, it does not provide true token-by-token text/audio synchronization like the OpenAI mobile app voice experience.

## Research: Forward Options (Only 1 and 2)

### 1) OpenAI Realtime API + WebRTC

Description:

- Use OpenAI Realtime with browser WebRTC for low-latency bidirectional audio, while consuming realtime events for text/transcript updates.
- This is the closest path to synchronized text progression with spoken output pacing.

Links:

- Realtime WebRTC guide: <https://platform.openai.com/docs/guides/realtime-webrtc>
- Realtime model capabilities: <https://platform.openai.com/docs/guides/realtime-model-capabilities>
- Audio guide: <https://platform.openai.com/docs/guides/audio>

Pros:

- Closest UX to native OpenAI app voice mode.
- Lower end-to-end latency than chained STT -> LLM -> TTS.
- Supports incremental events useful for synchronized rendering.

Cons:

- Higher implementation complexity than current HTTP request/response flow.
- Requires session/token management and a dedicated realtime client path.
- Introduces a separate architecture from the existing `useChat` transport.

### 2) OpenAI Agents SDK for TypeScript (speech flows)

Description:

- Use the OpenAI Agents SDK for TS to handle realtime/speech orchestration at a higher abstraction level than raw Realtime primitives.
- Suitable when you want speech capabilities with less low-level transport/event handling.

Links:

- Mentioned in Realtime WebRTC guide: <https://platform.openai.com/docs/guides/realtime-webrtc>
- Agents SDK docs entry point: <https://openai.github.io/openai-agents-js/>

Pros:

- Faster development than hand-rolling all realtime session/event logic.
- Higher-level structure for agents, tools, and conversational behavior.
- Can still be used in Next.js/browser-based architecture.

Cons:

- Adds a new SDK/runtime abstraction to the project.
- Less low-level control than directly using Realtime APIs.
- Requires migration planning from the current `ai` SDK chat pipeline.

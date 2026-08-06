# Continuous EMG Code Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated page that calibrates short and long jaw-clench EMG pulses, decodes a slow continuous pulse stream into Morse letters and numbers, and never writes to the existing training or recognition stores.

**Architecture:** Pure TypeScript modules own the Morse table, decoder state machine, calibration, and streaming envelope detector. A dedicated React page subscribes to the existing serial context, keeps all session data in memory, and renders calibration, waveform, pending code, decoded text, pacing controls, and the shared Morse reference table. Existing recognition engines and IndexedDB APIs are not imported.

**Tech Stack:** React 19, TypeScript 5.9, Wouter, Vitest, Web Serial context, existing UI components and Lucide icons.

---

## File Structure

- Create `client/src/lib/morse-code.ts`: canonical A-Z and 0-9 Morse mappings and lookup helpers.
- Create `client/src/lib/continuous-code-decoder.ts`: pure slow-paced decoder state machine.
- Create `client/src/lib/continuous-emg-detector.ts`: baseline estimator, envelope detector, burst extraction, and calibration validation.
- Create `client/src/components/ContinuousEmgWaveform.tsx`: fixed-size single-channel envelope and threshold canvas.
- Create `client/src/pages/ContinuousCodeMode.tsx`: isolated calibration and decoding page.
- Create `server/morse-code.test.ts`: mapping coverage and reverse lookup tests.
- Create `server/continuous-code-decoder.test.ts`: pulse, pause, unlimited-wait, confirmation, undo, and invalid-code tests.
- Create `server/continuous-emg-detector.test.ts`: noise, burst, hysteresis, startup guard, and calibration tests.
- Modify `client/src/App.tsx`: protected `/continuous-code` route.
- Modify `client/src/pages/Home.tsx`: explicit page entry.

### Task 1: Canonical Morse Table

**Files:**
- Create: `client/src/lib/morse-code.ts`
- Test: `server/morse-code.test.ts`

- [ ] **Step 1: Write failing mapping tests**

Test that all 26 letters and 10 digits exist, all codes are unique, and representative lookups decode `.-` to `A`, `...` to `S`, and `-----` to `0`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm vitest run server/morse-code.test.ts`

Expected: FAIL because `@/lib/morse-code` does not exist.

- [ ] **Step 3: Implement one canonical mapping**

Export `MORSE_ENTRIES`, `MORSE_BY_CHARACTER`, `CHARACTER_BY_MORSE`, `decodeMorse`, and `isMorsePrefix`. Derive every view and lookup from the same immutable entries so the UI cannot drift from decoding behavior.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `pnpm vitest run server/morse-code.test.ts`

Expected: all mapping tests pass.

- [ ] **Step 5: Commit the mapping**

Commit message: `Add canonical Morse code mapping`

### Task 2: Slow-Paced Decoder State Machine

**Files:**
- Create: `client/src/lib/continuous-code-decoder.ts`
- Test: `server/continuous-code-decoder.test.ts`

- [ ] **Step 1: Write failing decoder tests**

Cover:

- durations below and above the calibrated boundary produce dot and dash;
- durations inside the uncertainty margin do not produce a symbol;
- a second pulse before `characterGapMs` extends the same pending character;
- `tickDecoder` commits after `characterGapMs`;
- post-commit waiting may continue indefinitely;
- one word space is inserted after `wordGapMs`, never repeatedly;
- a new pulse resumes after unlimited waiting;
- manual confirmation commits valid code and retains invalid code;
- undo removes a pending symbol first, otherwise the last committed character.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm vitest run server/continuous-code-decoder.test.ts`

Expected: FAIL because the decoder module does not exist.

- [ ] **Step 3: Implement immutable decoder transitions**

Define `DecoderConfig`, `DecoderState`, `PulseClassification`, and pure functions `createDecoderState`, `appendPulse`, `tickDecoder`, `confirmPending`, `undoDecoder`, and `resetDecoder`. Presets are `standard`, `slow`, and `custom`; slow is the default. No function may use timers, React, browser storage, or database APIs.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `pnpm vitest run server/continuous-code-decoder.test.ts`

Expected: all state-machine tests pass.

- [ ] **Step 5: Commit the decoder**

Commit message: `Add slow paced Morse decoder`

### Task 3: Streaming EMG Detector and Calibration

**Files:**
- Create: `client/src/lib/continuous-emg-detector.ts`
- Test: `server/continuous-emg-detector.test.ts`

- [ ] **Step 1: Write failing detector tests**

Use deterministic synthetic samples at 250 Hz to verify:

- baseline noise does not create a burst;
- a sustained bipolar burst emits exactly one duration;
- a brief dip inside a burst does not split it because of hysteresis/release debounce;
- spikes below minimum duration are ignored;
- samples in the startup guard do not produce a burst;
- saturation or excessive baseline drift reports a blocked interval;
- calibration accepts separated short/long duration groups and rejects overlapping groups.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm vitest run server/continuous-emg-detector.test.ts`

Expected: FAIL because the detector module does not exist.

- [ ] **Step 3: Implement the baseline estimator and stream detector**

Implement robust median/MAD baseline statistics, an EMA absolute-deviation envelope, start/end hysteresis, minimum pulse duration, release debounce, maximum safe pulse duration, startup suppression, drift/saturation gating, and typed `pulse`, `blocked`, and `stable` events. Use CH2 as the primary signal because the hardware protocol identifies it as the de-biased EMG channel.

- [ ] **Step 4: Implement calibration validation**

Create `buildContinuousCalibration` from baseline stats and 3-5 short/long durations. Use robust medians, require minimum group separation, calculate the duration boundary and uncertainty band, and return explicit failure reasons rather than weak thresholds.

- [ ] **Step 5: Run the focused test and confirm GREEN**

Run: `pnpm vitest run server/continuous-emg-detector.test.ts`

Expected: all detector and calibration tests pass.

- [ ] **Step 6: Commit the detector**

Commit message: `Add continuous EMG pulse detection`

### Task 4: Fixed Live Waveform

**Files:**
- Create: `client/src/components/ContinuousEmgWaveform.tsx`

- [ ] **Step 1: Implement the canvas component**

Render a stable-aspect-ratio canvas with the recent CH2 signal/envelope, start threshold, end threshold, and active-pulse highlight. Keep fixed dimensions and cap the rolling window so incoming samples cannot shift the layout.

- [ ] **Step 2: Type-check the component**

Run: `pnpm tsc --noEmit`

Expected: 0 TypeScript errors.

- [ ] **Step 3: Commit the component**

Commit message: `Add continuous EMG waveform view`

### Task 5: Isolated Continuous Code Page

**Files:**
- Create: `client/src/pages/ContinuousCodeMode.tsx`

- [ ] **Step 1: Implement session phases**

Build explicit phases `disconnected`, `baseline`, `shortCalibration`, `longCalibration`, `ready`, `decoding`, `paused`, and `blocked`. Subscribe through `useSerialConnectionContext`, unregister on cleanup, and mark runtime busy only while calibrating or decoding.

- [ ] **Step 2: Wire calibration and decoding**

Collect a 3-second resting window, then 3-5 detected short pulses and 3-5 long pulses. Create the session detector/calibration, append pulse durations to the pure decoder, and call `tickDecoder` from a lightweight interval so long thinking pauses are processed without requiring new samples.

- [ ] **Step 3: Build the operational interface**

Show hardware state, calibration progress, waveform, current dot/dash sequence, countdown, latest character, accumulated text, standard/slow/custom pacing control, immediate confirm, contextual undo, pause/resume, clear, export, and return controls. Display blocked/uncertain states without guessing.

- [ ] **Step 4: Build the Morse reference table**

Render A-Z and 0-9 from `MORSE_ENTRIES`, grouped for scanning. Do not duplicate the mapping in JSX.

- [ ] **Step 5: Add session export**

Export only calibration settings, pacing settings, pulse timeline, state transitions, decoded text, and summary diagnostics. Do not import or access `emgDatabase`, recognition history, command data, CNN, DTW, or existing feature stores.

- [ ] **Step 6: Type-check the page**

Run: `pnpm tsc --noEmit`

Expected: 0 TypeScript errors.

- [ ] **Step 7: Commit the page**

Commit message: `Add continuous EMG code page`

### Task 6: Route and Home Entry

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/Home.tsx`

- [ ] **Step 1: Add the protected route**

Import `ContinuousCodeMode` and register `/continuous-code` inside `ProtectedRoute` without changing any existing route.

- [ ] **Step 2: Add a clear home action**

Add a `连续肌电编码` action beside the existing collection and recognition actions. It must not depend on `stats.hasFeatureLibrary` because it has its own session calibration.

- [ ] **Step 3: Type-check routing**

Run: `pnpm tsc --noEmit`

Expected: 0 TypeScript errors.

- [ ] **Step 4: Commit navigation**

Commit message: `Expose continuous EMG code mode`

### Task 7: Regression and Browser Verification

**Files:**
- Modify only files required by issues found during verification.

- [ ] **Step 1: Run focused tests**

Run: `pnpm vitest run server/morse-code.test.ts server/continuous-code-decoder.test.ts server/continuous-emg-detector.test.ts`

Expected: all focused tests pass.

- [ ] **Step 2: Run the complete suite**

Run: `pnpm test`

Expected: all existing and new tests pass.

- [ ] **Step 3: Run TypeScript and production builds**

Run: `pnpm tsc --noEmit` and `pnpm build`

Expected: 0 TypeScript errors and successful frontend/server production builds; only previously documented non-blocking warnings may remain.

- [ ] **Step 4: Verify the rendered page**

Start the development server on an available port and use browser screenshots at desktop and mobile sizes. Verify no overlap, clipped labels, shifting controls, blank waveform canvas, or inaccessible Morse table. Exercise route entry, pace switching, calibration controls, pause/resume, confirmation, undo, clear, and export without writing to existing data stores.

- [ ] **Step 5: Review the final diff**

Confirm there are no imports of recognition or database modules in the new feature, no unrelated changes, and no changes to the existing training/recognition behavior.

- [ ] **Step 6: Commit verification fixes**

Commit message: `Verify continuous EMG code workflow`

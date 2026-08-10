# Streaming Morse Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decode continuous EMG Morse input incrementally with one monotonic session clock, participant-calibrated pause timing, bounded candidate segmentation, stable live character commits, and complete diagnostic evidence.

**Architecture:** Keep signal detection, pulse classification, stream segmentation, and React presentation separated. A small session-clock adapter supplies every detector and decoder timestamp. Pure pause-calibration helpers build robust within-character and between-character timing models. The existing stream segmenter becomes a bounded weighted beam that can preserve uncertain pulse and boundary alternatives while committing only stable prefixes. The page orchestrates calibration and export but never passes scripted target text into recognition code.

**Tech Stack:** React 19, TypeScript, Vitest, Web Serial, existing Morse/diagnostic libraries and PremiumComponents.

---

### Task 1: One monotonic session clock

**Files:**
- Create: `client/src/lib/monotonic-session-clock.ts`
- Create: `server/monotonic-session-clock.test.ts`
- Modify: `client/src/pages/ContinuousCodeMode.tsx`

- [ ] Write tests proving elapsed time starts at zero, never regresses, and is shared by sample callbacks, idle ticks, and explicit finish.
- [ ] Run `pnpm test -- server/monotonic-session-clock.test.ts` and verify the missing-module failure.
- [ ] Implement a resettable clock around a supplied monotonic time source.
- [ ] Replace synthetic `sampleRate` timestamp advancement and direct decoder `Date.now()` calls in `ContinuousCodeMode` with the clock. Keep wall time only for export metadata and evaluation audit timestamps.
- [ ] Run the focused clock test and existing decoder tests.
- [ ] Commit: `Fix continuous decoder session timing`.

### Task 2: Robust pause calibration model

**Files:**
- Create: `client/src/lib/continuous-pause-calibration.ts`
- Create: `server/continuous-pause-calibration.test.ts`
- Modify: `client/src/lib/continuous-emg-detector.ts`

- [ ] Write tests for robust within/between centers, outlier tolerance, separated distributions, overlapping distributions, fallback models, and continuation/boundary likelihood scores.
- [ ] Run `pnpm test -- server/continuous-pause-calibration.test.ts` and verify failure.
- [ ] Implement median/MAD timing distributions, separation confidence, fallback status, and normalized log-likelihood scoring.
- [ ] Extend `ContinuousCalibration` with an optional pause model so older saved diagnostics remain readable.
- [ ] Run focused pause and detector tests.
- [ ] Commit: `Add adaptive Morse pause calibration`.

### Task 3: Weighted candidate stream decoding

**Files:**
- Modify: `client/src/lib/continuous-stream-segmenter.ts`
- Modify: `client/src/lib/continuous-code-decoder.ts`
- Modify: `server/continuous-stream-segmenter.test.ts`
- Modify: `server/continuous-code-decoder.test.ts`

- [ ] Add failing tests for `SOS` where dash-to-dash rests are 1000-1100 ms and learned character rests are longer.
- [ ] Add failing tests for incremental `S`, `SO`, `SOS` commits before finish, overlapping pause candidates, uncertain duration alternatives, invalid-tail recovery, and competitive-candidate pruning.
- [ ] Extend stream config with optional pause model and score window while retaining fixed-threshold fallback behavior.
- [ ] Score continuation and boundary branches from pause likelihood, Morse validity, and pulse likelihood.
- [ ] Preserve uncertain pulses as weighted dot/dash alternatives rather than dropping them.
- [ ] Expose best tentative text separately from stable committed text.
- [ ] Run focused decoder and segmenter tests.
- [ ] Commit: `Decode adaptive continuous Morse candidates`.

### Task 4: Practice-sequence pause calibration UI

**Files:**
- Modify: `client/src/pages/ContinuousCodeMode.tsx`
- Modify: `server/continuous-code-layout.test.ts`
- Create: `server/continuous-pause-calibration-ui.test.ts`

- [ ] Add source/render contract tests for an `SOS` rhythm calibration phase, repeated attempts, progress, retry on symbol mismatch, and overlap warning.
- [ ] Add `rhythmCalibration` to the session state machine after short/long duration calibration.
- [ ] Collect pulse-to-pulse release gaps from repeated known `SOS` practice attempts; label gaps by known boundaries only during calibration.
- [ ] Build the pause model after sufficient accepted attempts; warn and retain a clearly marked fallback when separation is poor.
- [ ] Ensure target evaluation text remains absent from decoder configuration and scoring.
- [ ] Run focused layout and calibration UI tests.
- [ ] Commit: `Calibrate participant Morse rhythm`.

### Task 5: Stable live output and compact evidence

**Files:**
- Modify: `client/src/components/ContinuousCodeStreamPanel.tsx`
- Modify: `client/src/pages/ContinuousCodeMode.tsx`
- Modify: `server/continuous-code-stream-panel.test.ts`
- Modify: `server/continuous-code-layout.test.ts`

- [ ] Add failing tests for confirmed white text, tentative green text, adjacent blinking cursor, READY removal at start, and live committed event history.
- [ ] Render stable and tentative output separately without replacing already committed characters.
- [ ] Keep the waveform, threshold envelope, pending symbols, and compact history in the same decoding panel.
- [ ] Make `End and review` stop capture and review the existing streaming result without running a second recognition pass.
- [ ] Run focused panel/layout tests.
- [ ] Commit: `Show incremental continuous Morse output`.

### Task 6: Complete diagnostic export and compatibility

**Files:**
- Modify: `client/src/lib/emg-diagnostic-export.ts`
- Modify: `client/src/pages/ContinuousCodeMode.tsx`
- Modify: `server/emg-diagnostic-export.test.ts`
- Modify: `server/diagnostic-export-pages.test.ts`

- [ ] Add failing tests for session id, wall-clock metadata, monotonic sample/event time, pause distributions, candidate scores, boundary decisions, pulse alternatives, tentative commits, and final stable output.
- [ ] Extend the continuous diagnostic package with optional versioned timing fields while preserving old fields.
- [ ] Create a new session id for each attempt so repeated captures cannot overwrite one another.
- [ ] Verify scripted target and corrected actual text exist only under evaluation metadata.
- [ ] Run focused export tests.
- [ ] Commit: `Export adaptive Morse diagnostics`.

### Task 7: Full verification

**Files:**
- Modify only files required by verification failures caused by this feature.

- [ ] Run `pnpm test`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm build`.
- [ ] Run `git diff --check` and inspect `git status --short`.
- [ ] Start the production-like local server and verify in Chromium that calibration, start, live output, event history, finish/review, and export controls work without overlap at desktop and laptop widths.
- [ ] Confirm untracked user files remain unchanged.
- [ ] Commit any verification-only fixes with a focused message.


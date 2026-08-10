# Morse Timing Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden target-blind continuous Morse segmentation against long-event recovery pauses and brief detector dropouts.

**Architecture:** Extend the pure rhythm and pause-calibration helpers with preceding-symbol timing evidence, consume that evidence in the pure stream segmenter, and keep detector hysteresis inside its existing calibration boundary. React remains orchestration-only and target text stays in evaluation metadata.

**Tech Stack:** TypeScript, React 19, Vitest, existing continuous EMG detector and Morse stream decoder.

---

### Task 1: Capture symbol-conditioned pause evidence

**Files:**
- Modify: `client/src/lib/continuous-rhythm-calibration.ts`
- Modify: `client/src/lib/continuous-pause-calibration.ts`
- Test: `server/continuous-rhythm-calibration.test.ts`
- Test: `server/continuous-pause-calibration.test.ts`

- [x] Add failing tests for dot-conditioned and dash-conditioned within-character gaps.
- [x] Run focused tests and confirm the new expectations fail.
- [x] Add optional conditioned distributions while preserving old combined fields.
- [x] Run focused tests and confirm they pass.

### Task 2: Bound adaptive character commitment

**Files:**
- Modify: `client/src/lib/continuous-stream-segmenter.ts`
- Modify: `client/src/lib/continuous-code-decoder.ts`
- Test: `server/continuous-stream-segmenter.test.ts`
- Test: `server/continuous-pause-calibration-ui.test.ts`

- [x] Add failing tests proving long dash recovery remains inside `O`, low-confidence models cannot delay normal commit to force split, and target text is absent from recognition configuration.
- [x] Run focused tests and confirm the behavioral tests fail.
- [x] Score pauses using the preceding symbol and add a bounded normal commit path.
- [x] Reduce slow force split to an emergency timeout rather than a normal delimiter.
- [x] Run focused tests and confirm they pass.

### Task 3: Tolerate brief internal envelope dropouts

**Files:**
- Modify: `client/src/lib/continuous-emg-detector.ts`
- Test: `server/continuous-emg-detector.test.ts`

- [x] Add a failing detector test with a brief sub-threshold gap inside one sustained contraction.
- [x] Run the focused test and confirm it produces two pulses before the fix.
- [x] Derive a conservative release debounce from short-event calibration.
- [x] Run detector tests and confirm one sustained pulse plus two intentionally separated pulses.

### Task 4: Verify and release

**Files:**
- Modify only files required by failures caused by this change.

- [x] Run focused tests.
- [x] Run `pnpm test`, `pnpm check`, `pnpm build`, and `git diff --check`.
- [ ] Commit and push the current branch.
- [ ] Deploy the verified commit to Vercel production.
- [ ] Verify production metadata and the continuous-code route.

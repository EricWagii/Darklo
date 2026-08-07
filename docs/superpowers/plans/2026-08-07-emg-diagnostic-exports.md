# EMG Complete Diagnostic Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete, analysis-ready exports to silent recognition and continuous neuromuscular timing decoding while upgrading the continuous-page presentation copy.

**Architecture:** A focused diagnostic-export module owns versioned payload construction and JSON download. Recognition and continuous pages retain their own session data, pass it to pure builders, and expose one clearly labelled export command each.

**Tech Stack:** React, TypeScript, Vitest, browser Blob downloads, Web Serial session data.

---

### Task 1: Diagnostic payload builders

**Files:**
- Create: `client/src/lib/emg-diagnostic-export.ts`
- Test: `server/emg-diagnostic-export.test.ts`

- [ ] Write failing tests proving recognition exports retain original and processed waveforms, continuous captures keep aligned columns, and truncation is explicit.
- [ ] Run the focused test and verify it fails because the builders do not exist.
- [ ] Implement versioned recognition and continuous payload builders plus a shared JSON download helper.
- [ ] Run the focused test and verify it passes.

### Task 2: Silent-recognition trial capture

**Files:**
- Modify: `client/src/pages/RecognitionMode.tsx`
- Test: `server/recognition-diagnostic-export.test.ts`

- [ ] Write a failing source-integration test requiring original waveform retention and the `导出完整诊断包` control.
- [ ] Run the test and verify the current incomplete export fails it.
- [ ] Capture every attempt before early-return paths, attach processing/results and feedback, and export complete training commands.
- [ ] Run focused tests and verify they pass.

### Task 3: Continuous session capture

**Files:**
- Modify: `client/src/pages/ContinuousCodeMode.tsx`
- Test: `server/continuous-diagnostic-export.test.ts`

- [ ] Write a failing source-integration test requiring all three raw ADC channels, timestamps, envelope/threshold series, decoder events, and an explicit truncation flag.
- [ ] Run the test and verify it fails against the current timeline-only export.
- [ ] Record columnar session data from baseline onward and wire the complete package to the export button.
- [ ] Run focused tests and verify they pass.

### Task 4: Technical presentation copy

**Files:**
- Modify: `client/src/pages/ContinuousCodeMode.tsx`
- Test: `server/continuous-diagnostic-export.test.ts`

- [ ] Add a failing assertion that the main title is `连续神经肌电时序解码` and direct `长咬、短咬与停顿输入` presentation text is absent.
- [ ] Replace the title and explanatory copy without changing calibration or decoder behavior.
- [ ] Run the focused test and verify it passes.

### Task 5: Full verification and delivery

**Files:**
- Verify all modified files.

- [ ] Run focused export tests.
- [ ] Run the full Vitest suite.
- [ ] Run `pnpm tsc --noEmit`.
- [ ] Run the production build.
- [ ] Verify both downloads in the browser and inspect the generated JSON fields.
- [ ] Commit and push `codex/morse-emg-input` without staging `docs/hardware/`.

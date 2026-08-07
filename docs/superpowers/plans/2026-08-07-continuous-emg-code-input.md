# Continuous EMG Streaming Morse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current one-character countdown decoder with a streaming Morse segmenter that supports fluent multi-character input, long-rest recovery, a continuous dot/dash display, and compact state-aware history.

**Architecture:** Keep pulse detection and calibration unchanged. Add a pure `continuous-stream-segmenter` that owns gap classification, bounded candidate paths, stable-prefix commits, forced separation, and structured history; adapt the existing decoder to classify pulse duration and delegate symbols to the segmenter. Extract the stream display into a focused React component so visual states can be tested independently from serial hardware.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, React DOM server rendering, Wouter, existing Web Serial context and Tailwind utilities.

---

## File Structure

- Create `client/src/lib/continuous-stream-segmenter.ts`: pure symbol/gap segmentation, stable commits, forced split, undo, and structured events.
- Create `server/continuous-stream-segmenter.test.ts`: deterministic fluent, slow, ambiguous, invalid-tail, and recovery tests.
- Modify `client/src/lib/continuous-code-decoder.ts`: retain duration classification while delegating stream state to the segmenter; remove word-gap/countdown behavior.
- Modify `server/continuous-code-decoder.test.ts`: verify pulse classification and decoder/segmenter integration.
- Create `client/src/components/ContinuousCodeStreamPanel.tsx`: decoded output, moving phosphor trail, continuous symbol stream, compact state/history row.
- Create `server/continuous-code-stream-panel.test.tsx`: server-rendered semantic and state-class tests.
- Modify `package.json` and `pnpm-lock.yaml`: bundle the regular JetBrains Mono webfont so rendering is consistent across macOS and Windows.
- Modify `client/src/pages/ContinuousCodeMode.tsx`: new timing controls, forced split, event export, and stream panel integration.
- Modify `docs/superpowers/specs/2026-08-07-continuous-emg-code-input-design.md`: preserve the approved live-green/committed-white state palette.

### Task 1: Streaming Segmenter Contract

**Files:**
- Create: `client/src/lib/continuous-stream-segmenter.ts`
- Create: `server/continuous-stream-segmenter.test.ts`

- [ ] **Step 1: Write failing tests for ordinary fluent input**

Define tests around this public contract:

```ts
const config = {
  characterBoundaryMs: 700,
  forceSplitMs: 2_500,
  boundaryUncertaintyMs: 120,
  maxCandidates: 16,
  maxPendingSymbols: 24,
};

let state = createStreamState();
state = appendStreamSymbol(state, { symbol: '.', endedAt: 100 }, config);
state = appendStreamSymbol(state, { symbol: '-', endedAt: 300 }, config);
state = advanceStream(state, 1_050, config);
expect(state.committedText).toBe('A');

state = appendStreamSymbol(state, { symbol: '-', endedAt: 1_200 }, config);
state = advanceStream(state, 2_000, config);
expect(state.committedText).toBe('AT');
```

Also assert that all symbols remain in `state.events` after commit and that the unresolved candidate buffer no longer contains the committed prefix.

- [ ] **Step 2: Write failing tests for long-rest recovery**

Build a state with two already stable characters followed by an invalid six-symbol tail, then cover these exact outcomes:

```ts
let state = createStreamState();
for (const [symbol, endedAt] of [['.', 100], ['.', 250], ['.', 400]] as const) {
  state = appendStreamSymbol(state, { symbol, endedAt }, config);
}
state = advanceStream(state, 1_200, config); // S
for (const [symbol, endedAt] of [['-', 1_300], ['-', 1_500], ['-', 1_700]] as const) {
  state = appendStreamSymbol(state, { symbol, endedAt }, config);
}
state = advanceStream(state, 2_500, config); // O
for (let index = 0; index < 6; index += 1) {
  state = appendStreamSymbol(state, { symbol: '.', endedAt: 2_600 + index * 120 }, config);
}
state = forceSplit(state, 6_000, config);

expect(state).toMatchObject({
  committedText: 'SO',
  pendingSymbols: '',
});
expect(state.events.at(-1)).toMatchObject({ kind: 'discarded', reason: 'invalid-tail' });
```

- stable preceding characters survive a force split;
- only the final incomplete, invalid, or tied tail produces a `discarded` event;
- the first symbol after force split starts a fresh segment;
- a force split with no pending symbols does not add spaces or duplicate events.

- [ ] **Step 3: Write failing tests for bounded ambiguity**

Assert that near-boundary gaps retain at most `maxCandidates`, common candidate prefixes commit once, more than `maxPendingSymbols` never grows the candidate set without bound, and no language-frequency preference is used to choose between equal timing scores.

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run server/continuous-stream-segmenter.test.ts
```

Expected: FAIL because `continuous-stream-segmenter.ts` does not exist.

- [ ] **Step 5: Implement immutable stream types and transitions**

Create these exported types and functions:

```ts
export type MorseSymbol = '.' | '-';
export type StreamEventKind =
  | 'symbol-pending'
  | 'symbol-committed'
  | 'candidate-boundary'
  | 'confirmed-boundary'
  | 'character-committed'
  | 'uncertain'
  | 'discarded';

export interface StreamConfig {
  characterBoundaryMs: number;
  forceSplitMs: number;
  boundaryUncertaintyMs: number;
  maxCandidates: number;
  maxPendingSymbols: number;
}

export interface StreamState {
  committedText: string;
  pendingSymbols: string;
  events: readonly StreamEvent[];
  candidates: readonly SegmentationCandidate[];
  lastSymbolEndedAt: number | null;
  status: 'idle' | 'collecting' | 'candidate' | 'committed' | 'uncertain' | 'discarded';
}

export const createStreamState: () => StreamState;
export const appendStreamSymbol: (
  state: StreamState,
  input: { symbol: MorseSymbol; endedAt: number },
  config: StreamConfig
) => StreamState;
export const advanceStream: (state: StreamState, now: number, config: StreamConfig) => StreamState;
export const forceSplit: (state: StreamState, now: number, config: StreamConfig) => StreamState;
export const undoStream: (state: StreamState) => StreamState;
```

Use `decodeMorse` and `isMorsePrefix` from the canonical table. Score a gap by distance from the intra-character and character-boundary timing regions, deduplicate equivalent candidates, sort by timing score, and truncate to `maxCandidates`. Commit only a prefix shared by all surviving top candidates. Never inspect words, dictionaries, or character frequency.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run `pnpm vitest run server/continuous-stream-segmenter.test.ts`.

Expected: all segmenter tests pass.

- [ ] **Step 7: Commit the segmenter**

```bash
git add client/src/lib/continuous-stream-segmenter.ts server/continuous-stream-segmenter.test.ts
git commit -m "Add streaming Morse segmenter"
```

### Task 2: Decoder Integration Without Fixed Countdown

**Files:**
- Modify: `client/src/lib/continuous-code-decoder.ts`
- Modify: `server/continuous-code-decoder.test.ts`

- [ ] **Step 1: Replace old tests with failing integration tests**

Use this configuration shape:

```ts
const config: DecoderConfig = {
  durationBoundaryMs: 450,
  uncertaintyMarginMs: 50,
  characterBoundaryMs: 700,
  forceSplitMs: 2_500,
  boundaryUncertaintyMs: 120,
  maxCandidates: 16,
  maxPendingSymbols: 24,
};
```

Test dot/dash classification, uncertain pulse rejection, fluent `AT` input, force-split recovery, undo pending before committed, reset, and event preservation. Assert that `wordGapMs`, automatic spaces, and `getCharacterCountdownMs` no longer exist in the public behavior.

- [ ] **Step 2: Run the decoder test and verify RED**

Run `pnpm vitest run server/continuous-code-decoder.test.ts`.

Expected: FAIL because the existing decoder still uses character and word countdowns.

- [ ] **Step 3: Adapt the decoder around the segmenter**

Make `DecoderConfig` extend the stream timing fields. Keep `classifyPulseDuration`; make `appendPulse` classify a duration and call `appendStreamSymbol`; make `tickDecoder` call `advanceStream`; replace `confirmPending` with `forceSplitDecoder`; and make undo/reset delegate to the stream module. Preserve `lastClassification` and `uncertainPulseCount` for diagnostics.

- [ ] **Step 4: Run segmenter and decoder tests**

Run:

```bash
pnpm vitest run server/continuous-stream-segmenter.test.ts server/continuous-code-decoder.test.ts
```

Expected: both test files pass.

- [ ] **Step 5: Commit the adapter**

```bash
git add client/src/lib/continuous-code-decoder.ts server/continuous-code-decoder.test.ts
git commit -m "Use streaming Morse segmentation"
```

### Task 3: Compact Stream Panel

**Files:**
- Create: `client/src/components/ContinuousCodeStreamPanel.tsx`
- Create: `server/continuous-code-stream-panel.test.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing semantic rendering tests**

Render the component with `renderToStaticMarkup` and assert:

- decoded output uses a `data-font="jetbrains-mono"` hook and uppercase text;
- pending symbols have `data-state="pending"` and a green class;
- only the newest pending symbol has `data-latest="true"`;
- committed history symbols have `data-state="committed"` and a cool-white class with no glow class;
- uncertain and discarded events use amber and orange-red state hooks;
- the continuous stream has `overflow-x-auto`, `whitespace-nowrap`, and an accessible label;
- the event history is a compact single-line list rather than large cards.

- [ ] **Step 2: Run the component test and verify RED**

Run `pnpm vitest run server/continuous-code-stream-panel.test.tsx`.

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the fixed-height stream panel**

First bundle the font rather than relying on a system installation:

```bash
pnpm add @fontsource/jetbrains-mono
```

Import `@fontsource/jetbrains-mono/400.css` in the component and use `fontFamily: 'JetBrains Mono, ui-monospace, monospace'`. This makes the same regular-weight code face available on the user's macOS development machine and Windows test machine.

Accept only presentation props:

```ts
interface ContinuousCodeStreamPanelProps {
  decodedText: string;
  pendingSymbols: string;
  events: readonly StreamEvent[];
  status: StreamState['status'];
  onForceSplit: () => void;
  onUndo: () => void;
  onClear: () => void;
}
```

Use one decoded-output band and one compact status/history row. Render the full session symbol timeline in a fixed-height, horizontally scrollable container that automatically follows the latest event unless the user has scrolled backward. Use JetBrains Mono with a local monospace fallback. Implement the caret-attached phosphor trail with CSS pseudo-elements or small DOM particles whose translate/opacity animations move and decay horizontally; do not use a static bitmap or hollow circles.

Apply the approved state palette:

```ts
const stateClass = {
  pending: 'text-[#8cff5a]',
  committed: 'text-[#d8dee3]',
  candidate: 'text-[#64805c]',
  uncertain: 'text-[#e1b94f]',
  discarded: 'text-[#ff5a2f]',
};
```

Keep timestamp text subdued and all event spacing compact. Preserve text labels or symbols so meaning never depends only on color.

- [ ] **Step 4: Run the component test and verify GREEN**

Run `pnpm vitest run server/continuous-code-stream-panel.test.tsx`.

Expected: all rendering tests pass.

- [ ] **Step 5: Commit the panel**

```bash
git add package.json pnpm-lock.yaml client/src/components/ContinuousCodeStreamPanel.tsx server/continuous-code-stream-panel.test.tsx
git commit -m "Add compact Morse stream display"
```

### Task 4: Page Wiring and Session Export

**Files:**
- Modify: `client/src/pages/ContinuousCodeMode.tsx`

- [ ] **Step 1: Replace pacing state and controls**

Replace `customCharacterGapMs`/`customWordGapMs` with `customCharacterBoundaryMs`/`customForceSplitMs`. Use presets:

```ts
standard: { characterBoundaryMs: 700, forceSplitMs: 2_500 },
slow: { characterBoundaryMs: 1_200, forceSplitMs: 4_000 },
```

Custom controls must constrain the ordinary boundary to 300-2500 ms, force split to 1500-10000 ms, and force split to at least 1.8 times the ordinary boundary.

- [ ] **Step 2: Wire streaming transitions**

Keep the 100 ms timer but call the new `tickDecoder`. Replace the immediate-character-confirm button with `强制分隔`, calling `forceSplitDecoder`. Remove fixed confirmation countdown and word-space messaging. Keep pause, undo, clear, export, and existing calibration behavior.

- [ ] **Step 3: Integrate the stream panel**

Pass decoded text, continuous event history, unresolved tail, status, and actions into `ContinuousCodeStreamPanel`. Keep `ContinuousEmgWaveform` as the largest operational region. Remove the old oversized recent-event list and duplicate pending-code block.

- [ ] **Step 4: Update export fields**

Export ordinary-boundary/force-split configuration, complete structured stream events, discarded reasons, stable text, unresolved tail, calibration, detector diagnostics, and timeline. Do not import or write existing collection, recognition, command, or IndexedDB modules.

- [ ] **Step 5: Run focused tests and TypeScript**

Run:

```bash
pnpm vitest run server/continuous-stream-segmenter.test.ts server/continuous-code-decoder.test.ts server/continuous-code-stream-panel.test.tsx
pnpm tsc --noEmit
```

Expected: focused tests pass and TypeScript reports zero errors.

- [ ] **Step 6: Commit page integration**

```bash
git add client/src/pages/ContinuousCodeMode.tsx
git commit -m "Integrate continuous Morse stream UI"
```

### Task 5: Regression and Browser Verification

**Files:**
- Modify only files required by verification findings.

- [ ] **Step 1: Run all tests**

Run `pnpm test`.

Expected: all existing and new tests pass.

- [ ] **Step 2: Run type and production checks**

Run:

```bash
pnpm tsc --noEmit
pnpm build
```

Expected: zero TypeScript errors and a successful production build.

- [ ] **Step 3: Start the local application**

Run `pnpm dev` on an available local port and open `/continuous-code` in the browser.

- [ ] **Step 4: Verify desktop and mobile rendering**

At 1440x900 and 390x844, verify that decoded output, waveform, compact status row, controls, and reference table do not overlap. Confirm long symbol streams scroll horizontally without shrinking or wrapping, event history remains compact, and labels fit their controls.

- [ ] **Step 5: Verify real animation and state colors**

Capture two screenshots at least 300 ms apart and compare the caret trail pixels to prove that the horizontal phosphor threads move. Confirm pending/latest symbols are green, committed history is cool white without glow, candidate boundaries are muted, uncertain events amber, and discarded events orange-red.

- [ ] **Step 6: Exercise streaming recovery**

Using deterministic injected events or browser controls, verify fluent multi-character output, slow novice input, long-rest force split, preservation of valid preceding text, discard of only the invalid tail, undo, clear, pause/resume, and JSON export.

- [ ] **Step 7: Review isolation and final diff**

Confirm the new feature does not import recognition engines, feature stores, or IndexedDB APIs, and that `docs/hardware/` remains untracked and unstaged.

- [ ] **Step 8: Commit verification fixes**

```bash
git add client/src client/src/lib server docs/superpowers/specs/2026-08-07-continuous-emg-code-input-design.md
git commit -m "Verify streaming Morse input"
```

import { describe, expect, it } from 'vitest';
import {
  appendPulse,
  classifyPulseDuration,
  createDecoderState,
  forceSplitDecoder,
  resetDecoder,
  tickDecoder,
  undoDecoder,
  type DecoderConfig,
} from '../client/src/lib/continuous-code-decoder';

const config: DecoderConfig = {
  durationBoundaryMs: 450,
  uncertaintyMarginMs: 50,
  characterBoundaryMs: 700,
  forceSplitMs: 2_500,
  boundaryUncertaintyMs: 120,
  maxCandidates: 16,
  maxPendingSymbols: 24,
};

describe('streaming continuous code decoder', () => {
  it('classifies calibrated short, long, and uncertain pulses', () => {
    expect(classifyPulseDuration(250, config)).toBe('dot');
    expect(classifyPulseDuration(700, config)).toBe('dash');
    expect(classifyPulseDuration(430, config)).toBe('uncertain');
  });

  it('preserves uncertain pulse diagnostics without adding a symbol', () => {
    const state = appendPulse(createDecoderState(), { durationMs: 430, endedAt: 1_000 }, config);
    expect(state.pendingSymbols).toBe('');
    expect(state.lastClassification).toBe('uncertain');
    expect(state.uncertainPulseCount).toBe(1);
    expect(state.events.at(-1)).toMatchObject({ kind: 'uncertain', reason: 'uncertain-pulse' });
  });

  it('decodes fluent AT input without inserting automatic spaces', () => {
    let state = createDecoderState();
    state = appendPulse(state, { durationMs: 250, endedAt: 100 }, config);
    state = appendPulse(state, { durationMs: 700, endedAt: 300 }, config);
    state = tickDecoder(state, 1_050, config);
    state = appendPulse(state, { durationMs: 700, endedAt: 1_200 }, config);
    state = tickDecoder(state, 2_000, config);
    state = tickDecoder(state, 20_000, config);

    expect(state.committedText).toBe('AT');
    expect(state.committedText.includes(' ')).toBe(false);
  });

  it('forces recovery without removing stable output', () => {
    let state = createDecoderState();
    state = appendPulse(state, { durationMs: 250, endedAt: 100 }, config);
    state = tickDecoder(state, 900, config);
    for (let index = 0; index < 6; index += 1) {
      state = appendPulse(state, { durationMs: 250, endedAt: 1_000 + index * 100 }, config);
    }
    state = forceSplitDecoder(state, 5_000, config);

    expect(state.committedText).toBe('E');
    expect(state.pendingSymbols).toBe('');
    expect(state.events.at(-1)).toMatchObject({ kind: 'discarded', reason: 'invalid-tail' });
  });

  it('undoes pending input before committed output and resets diagnostics', () => {
    let state = appendPulse(createDecoderState(), { durationMs: 250, endedAt: 100 }, config);
    state = appendPulse(state, { durationMs: 700, endedAt: 250 }, config);
    state = undoDecoder(state);
    expect(state.pendingSymbols).toBe('.');

    state = tickDecoder(state, 1_000, config);
    state = undoDecoder(state);
    expect(state.committedText).toBe('');
    expect(resetDecoder()).toEqual(createDecoderState());
  });
});

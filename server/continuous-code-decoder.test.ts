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
import { buildPauseTimingModel } from '../client/src/lib/continuous-pause-calibration';

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

  it('preserves uncertain pulse diagnostics and competing symbol interpretations', () => {
    const state = appendPulse(createDecoderState(), { durationMs: 430, startedAt: 570, endedAt: 1_000 }, config);
    expect(state.pendingSymbols).toBe('.');
    expect(state.candidates.map((candidate) => candidate.pendingSymbols)).toEqual(['.', '-']);
    expect(state.lastClassification).toBe('uncertain');
    expect(state.uncertainPulseCount).toBe(1);
    expect(state.events.at(-1)).toMatchObject({
      kind: 'uncertain',
      reason: 'uncertain-pulse',
      alternatives: [
        { symbol: '.', scoreAdjustment: expect.any(Number) },
        { symbol: '-', scoreAdjustment: expect.any(Number) },
      ],
    });
  });

  it('decodes fluent AT input without inserting automatic spaces', () => {
    let state = createDecoderState();
    state = appendPulse(state, { durationMs: 250, startedAt: 100, endedAt: 350 }, config);
    state = appendPulse(state, { durationMs: 700, startedAt: 500, endedAt: 1_200 }, config);
    state = tickDecoder(state, 1_950, config);
    state = appendPulse(state, { durationMs: 700, startedAt: 2_050, endedAt: 2_750 }, config);
    state = tickDecoder(state, 3_500, config);
    state = tickDecoder(state, 20_000, config);

    expect(state.committedText).toBe('AT');
    expect(state.committedText.includes(' ')).toBe(false);
  });

  it('forces recovery without removing stable output', () => {
    let state = createDecoderState();
    state = appendPulse(state, { durationMs: 250, startedAt: 100, endedAt: 350 }, config);
    state = tickDecoder(state, 1_050, config);
    for (let index = 0; index < 6; index += 1) {
      const startedAt = 1_200 + index * 350;
      state = appendPulse(state, { durationMs: 250, startedAt, endedAt: startedAt + 250 }, config);
    }
    state = forceSplitDecoder(state, 5_000, config);

    expect(state.committedText).toBe('E');
    expect(state.pendingSymbols).toBe('');
    expect(state.events.at(-1)).toMatchObject({ kind: 'discarded', reason: 'invalid-tail' });
  });

  it('undoes pending input before committed output and resets diagnostics', () => {
    let state = appendPulse(createDecoderState(), { durationMs: 250, startedAt: 100, endedAt: 350 }, config);
    state = appendPulse(state, { durationMs: 700, startedAt: 500, endedAt: 1_200 }, config);
    state = undoDecoder(state);
    expect(state.pendingSymbols).toBe('.');

    state = tickDecoder(state, 1_000, config);
    state = undoDecoder(state);
    expect(state.committedText).toBe('');
    expect(resetDecoder()).toEqual(createDecoderState());
  });

  it('uses the rest before a long pulse instead of counting pulse duration as a character gap', () => {
    let state = createDecoderState();
    state = appendPulse(state, { durationMs: 250, startedAt: 100, endedAt: 350 }, config);
    state = appendPulse(state, { durationMs: 700, startedAt: 500, endedAt: 1_200 }, config);

    expect(state.committedText).toBe('');
    expect(state.pendingSymbols).toBe('.-');
    expect(state.events.filter((event) => event.kind === 'confirmed-boundary')).toHaveLength(0);
  });

  it('retains a near-boundary pulse as weighted dot and dash alternatives', () => {
    const adaptive = {
      ...config,
      uncertaintyMarginMs: 60,
      pauseTimingModel: buildPauseTimingModel({
        withinCharacterGapsMs: [300, 320, 340, 360],
        betweenCharacterGapsMs: [900, 940, 980],
        fallbackBoundaryMs: 700,
      }).model,
    };
    let state = createDecoderState();
    state = appendPulse(state, { durationMs: 250, startedAt: 100, endedAt: 350 }, adaptive);
    state = appendPulse(state, { durationMs: 250, startedAt: 670, endedAt: 920 }, adaptive);
    state = appendPulse(state, { durationMs: 395, startedAt: 1_240, endedAt: 1_635 }, adaptive);

    expect(state.lastClassification).toBe('uncertain');
    expect(state.uncertainPulseCount).toBe(1);
    expect(state.candidates.some((candidate) => candidate.pendingSymbols === '...')).toBe(true);
    expect(state.candidates.some((candidate) => candidate.pendingSymbols === '..-')).toBe(true);

    state = forceSplitDecoder(state, 5_000, adaptive);
    expect(state.committedText).toBe('S');
  });
});

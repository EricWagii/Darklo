import { describe, expect, it } from 'vitest';
import {
  appendPulse,
  confirmPending,
  createDecoderState,
  tickDecoder,
  undoDecoder,
  type DecoderConfig,
} from '../client/src/lib/continuous-code-decoder';

const config: DecoderConfig = {
  durationBoundaryMs: 450,
  uncertaintyMarginMs: 50,
  characterGapMs: 5_000,
  wordGapMs: 12_000,
};

describe('slow-paced continuous code decoder', () => {
  it('classifies calibrated short and long pulses as dot and dash', () => {
    let state = createDecoderState();
    state = appendPulse(state, { durationMs: 250, endedAt: 1_000 }, config);
    expect(state.pendingCode).toBe('.');
    expect(state.lastClassification).toBe('dot');

    state = appendPulse(state, { durationMs: 700, endedAt: 2_000 }, config);
    expect(state.pendingCode).toBe('.-');
    expect(state.lastClassification).toBe('dash');
  });

  it('does not guess when pulse duration falls inside the uncertainty band', () => {
    const state = appendPulse(
      createDecoderState(),
      { durationMs: 430, endedAt: 1_000 },
      config
    );

    expect(state.pendingCode).toBe('');
    expect(state.lastClassification).toBe('uncertain');
    expect(state.status).toBe('uncertain');
  });

  it('keeps symbols in one character while the slow character window remains open', () => {
    let state = appendPulse(createDecoderState(), { durationMs: 250, endedAt: 1_000 }, config);
    state = tickDecoder(state, 5_900, config);
    expect(state.text).toBe('');
    expect(state.pendingCode).toBe('.');

    state = appendPulse(state, { durationMs: 700, endedAt: 5_999 }, config);
    expect(state.pendingCode).toBe('.-');
  });

  it('automatically commits a character after its configurable wait', () => {
    let state = appendPulse(createDecoderState(), { durationMs: 250, endedAt: 1_000 }, config);
    state = appendPulse(state, { durationMs: 700, endedAt: 2_000 }, config);
    state = tickDecoder(state, 7_000, config);

    expect(state.pendingCode).toBe('');
    expect(state.text).toBe('A');
    expect(state.status).toBe('committed');
  });

  it('allows unlimited post-character waiting and inserts at most one word space', () => {
    let state = appendPulse(createDecoderState(), { durationMs: 250, endedAt: 1_000 }, config);
    state = tickDecoder(state, 30_000, config);
    expect(state.text).toBe('E ');

    state = tickDecoder(state, 300_000, config);
    expect(state.text).toBe('E ');

    state = appendPulse(state, { durationMs: 700, endedAt: 301_000 }, config);
    expect(state.pendingCode).toBe('-');
    state = tickDecoder(state, 306_000, config);
    expect(state.text).toBe('E T');
  });

  it('supports early confirmation and keeps invalid code available for correction', () => {
    let state = appendPulse(createDecoderState(), { durationMs: 250, endedAt: 1_000 }, config);
    state = appendPulse(state, { durationMs: 700, endedAt: 1_500 }, config);
    state = confirmPending(state, 2_000);
    expect(state.text).toBe('A');
    expect(state.pendingCode).toBe('');

    state = { ...state, pendingCode: '......', status: 'pending' };
    state = confirmPending(state, 3_000);
    expect(state.text).toBe('A');
    expect(state.pendingCode).toBe('......');
    expect(state.status).toBe('invalid');
  });

  it('undoes a pending symbol before removing committed output', () => {
    let state = appendPulse(createDecoderState(), { durationMs: 250, endedAt: 1_000 }, config);
    state = appendPulse(state, { durationMs: 700, endedAt: 1_500 }, config);
    state = undoDecoder(state);
    expect(state.pendingCode).toBe('.');

    state = confirmPending(state, 2_000);
    state = tickDecoder(state, 20_000, config);
    expect(state.text).toBe('E ');
    state = undoDecoder(state);
    expect(state.text).toBe('');
  });
});

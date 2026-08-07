import { describe, expect, it } from 'vitest';
import {
  advanceStream,
  appendStreamSymbol,
  createStreamState,
  forceSplit,
  undoStream,
  type StreamConfig,
} from '../client/src/lib/continuous-stream-segmenter';

const config: StreamConfig = {
  characterBoundaryMs: 700,
  forceSplitMs: 2_500,
  boundaryUncertaintyMs: 120,
  maxCandidates: 16,
  maxPendingSymbols: 24,
};

describe('continuous Morse stream segmenter', () => {
  it('commits fluent characters without a fixed multi-second countdown', () => {
    let state = createStreamState();
    state = appendStreamSymbol(state, { symbol: '.', endedAt: 100 }, config);
    state = appendStreamSymbol(state, { symbol: '-', endedAt: 300 }, config);
    state = advanceStream(state, 1_050, config);
    expect(state.committedText).toBe('A');

    state = appendStreamSymbol(state, { symbol: '-', endedAt: 1_200 }, config);
    state = advanceStream(state, 2_000, config);

    expect(state.committedText).toBe('AT');
    expect(state.pendingSymbols).toBe('');
    expect(state.events.filter((event) => event.kind === 'symbol-pending')).toHaveLength(3);
    expect(state.events.filter((event) => event.kind === 'character-committed')).toHaveLength(2);
  });

  it('preserves stable text and discards only an invalid tail at a force split', () => {
    let state = createStreamState();
    for (const [symbol, endedAt] of [['.', 100], ['.', 250], ['.', 400]] as const) {
      state = appendStreamSymbol(state, { symbol, endedAt }, config);
    }
    state = advanceStream(state, 1_200, config);
    for (const [symbol, endedAt] of [['-', 1_300], ['-', 1_500], ['-', 1_700]] as const) {
      state = appendStreamSymbol(state, { symbol, endedAt }, config);
    }
    state = advanceStream(state, 2_500, config);
    for (let index = 0; index < 6; index += 1) {
      state = appendStreamSymbol(state, { symbol: '.', endedAt: 2_600 + index * 120 }, config);
    }
    state = forceSplit(state, 6_000, config);

    expect(state.committedText).toBe('SO');
    expect(state.pendingSymbols).toBe('');
    expect(state.events.at(-1)).toMatchObject({ kind: 'discarded', reason: 'invalid-tail' });

    const eventCount = state.events.length;
    state = forceSplit(state, 7_000, config);
    expect(state.events).toHaveLength(eventCount);

    state = appendStreamSymbol(state, { symbol: '-', endedAt: 7_100 }, config);
    state = advanceStream(state, 7_900, config);
    expect(state.committedText).toBe('SOT');
  });

  it('keeps near-boundary alternatives bounded and does not guess tied text', () => {
    let state = createStreamState();
    for (let index = 0; index < 40; index += 1) {
      state = appendStreamSymbol(
        state,
        { symbol: index % 2 === 0 ? '.' : '-', endedAt: 100 + index * 700 },
        { ...config, maxCandidates: 4, maxPendingSymbols: 8 }
      );
      expect(state.candidates.length).toBeLessThanOrEqual(4);
      expect(state.pendingSymbols.length).toBeLessThanOrEqual(8);
    }

    const tied = {
      ...createStreamState(),
      pendingSymbols: '.',
      lastSymbolEndedAt: 1_000,
      candidates: [
        { committedText: '', pendingSymbols: '.', score: 0 },
        { committedText: '', pendingSymbols: '-', score: 0 },
      ],
    };
    const forced = forceSplit(tied, 4_000, config);
    expect(forced.committedText).toBe('');
    expect(forced.events.at(-1)).toMatchObject({ kind: 'discarded', reason: 'ambiguous-tail' });
  });

  it('undoes pending input before committed output', () => {
    let state = createStreamState();
    state = appendStreamSymbol(state, { symbol: '.', endedAt: 100 }, config);
    state = appendStreamSymbol(state, { symbol: '-', endedAt: 250 }, config);
    state = undoStream(state);
    expect(state.pendingSymbols).toBe('.');

    state = advanceStream(state, 1_000, config);
    expect(state.committedText).toBe('E');
    state = undoStream(state);
    expect(state.committedText).toBe('');
  });
});

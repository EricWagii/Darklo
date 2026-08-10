import { describe, expect, it } from 'vitest';
import {
  advanceStream,
  appendStreamSymbol,
  createStreamState,
  forceSplit,
  getTentativeText,
  undoStream,
  type StreamConfig,
} from '../client/src/lib/continuous-stream-segmenter';
import { buildPauseTimingModel } from '../client/src/lib/continuous-pause-calibration';
import { PACE_PRESETS } from '../client/src/lib/continuous-code-decoder';

const config: StreamConfig = {
  characterBoundaryMs: 700,
  forceSplitMs: 2_500,
  boundaryUncertaintyMs: 120,
  maxCandidates: 16,
  maxPendingSymbols: 24,
};

const adaptiveConfig: StreamConfig = {
  ...config,
  characterBoundaryMs: 1_550,
  forceSplitMs: 4_500,
  candidateCommitScoreWindow: 1.5,
  pauseTimingModel: buildPauseTimingModel({
    withinCharacterGapsMs: [880, 940, 1_000, 1_040, 1_080, 1_120],
    betweenCharacterGapsMs: [1_650, 1_720, 1_780, 1_840],
    fallbackBoundaryMs: 1_550,
  }).model,
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

  it('commits a shared candidate prefix without losing the disputed tail', () => {
    const state = {
      ...createStreamState(),
      pendingSymbols: '.',
      lastSymbolEndedAt: 1_000,
      candidates: [
        { committedText: 'A', pendingSymbols: '.', score: 0 },
        { committedText: 'A', pendingSymbols: '-', score: 0 },
      ],
    };

    const advanced = advanceStream(state, 1_800, config);
    expect(advanced.committedText).toBe('A');
    expect(advanced.candidates).toHaveLength(2);
    expect(advanced.pendingSymbols).not.toBe('');
    expect(advanced.status).toBe('candidate');
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

  it('keeps 1000-1100 ms dash rests inside O and commits SOS incrementally', () => {
    let state = createStreamState();
    const appendCharacter = (
      symbols: readonly ('.' | '-')[],
      firstStartedAt: number,
      withinGapMs: number
    ) => {
      let startedAt = firstStartedAt;
      for (const symbol of symbols) {
        const duration = symbol === '.' ? 300 : 800;
        state = appendStreamSymbol(state, { symbol, startedAt, endedAt: startedAt + duration }, adaptiveConfig);
        startedAt += duration + withinGapMs;
      }
      return startedAt - withinGapMs;
    };

    const s1EndedAt = appendCharacter(['.', '.', '.'], 100, 940);
    state = advanceStream(state, s1EndedAt + 1_780, adaptiveConfig);
    expect(state.committedText).toBe('S');

    const oEndedAt = appendCharacter(['-', '-', '-'], s1EndedAt + 1_820, 1_060);
    state = advanceStream(state, oEndedAt + 1_780, adaptiveConfig);
    expect(state.committedText).toBe('SO');

    const s2EndedAt = appendCharacter(['.', '.', '.'], oEndedAt + 1_820, 1_000);
    state = advanceStream(state, s2EndedAt + 1_780, adaptiveConfig);

    expect(state.committedText).toBe('SOS');
    expect(state.pendingSymbols).toBe('');
    expect(state.events.filter((item) => item.kind === 'character-committed').map((item) => item.character)).toEqual(['S', 'O', 'S']);
  });

  it('exposes only the best uncommitted interpretation as tentative text', () => {
    const state = {
      ...createStreamState(),
      candidates: [
        { committedText: 'SO', pendingSymbols: '.', score: 3 },
        { committedText: 'ST', pendingSymbols: '-', score: 1 },
      ],
    };

    expect(getTentativeText(state)).toBe('SO');
  });

  it('does not split field-recorded EOR at natural 1200-1300 ms within-character rests', () => {
    const fieldConfig: StreamConfig = {
      ...config,
      ...PACE_PRESETS.slow,
      boundaryUncertaintyMs: 160,
    };
    const pulses = [
      { symbol: '.', startedAt: 10_987, endedAt: 11_485 },
      { symbol: '-', startedAt: 18_819, endedAt: 19_901 },
      { symbol: '-', startedAt: 21_169, endedAt: 22_281 },
      { symbol: '-', startedAt: 23_489, endedAt: 24_657 },
      { symbol: '.', startedAt: 30_177, endedAt: 30_451 },
      { symbol: '-', startedAt: 31_327, endedAt: 32_361 },
      { symbol: '.', startedAt: 33_549, endedAt: 34_025 },
    ] as const;

    let state = createStreamState();
    for (let index = 0; index < pulses.length; index += 1) {
      const pulse = pulses[index];
      state = appendStreamSymbol(state, pulse, fieldConfig);
      const nextStart = pulses[index + 1]?.startedAt;
      if (nextStart !== undefined) {
        for (let now = pulse.endedAt + 100; now < nextStart; now += 100) {
          state = advanceStream(state, now, fieldConfig);
        }
      }
    }
    state = forceSplit(state, 40_000, fieldConfig);

    expect(state.committedText).toBe('EOR');
    expect(state.pendingSymbols).toBe('');
  });
});

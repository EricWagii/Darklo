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

  it('keeps natural 1200-1300 ms rests inside a calibrated dash sequence', () => {
    const dotGaps = [420, 440, 460, 480, 500, 520, 440, 460, 480, 500, 520, 540];
    const dashGaps = [1_180, 1_220, 1_260, 1_300, 1_240, 1_280];
    const dashAwareConfig: StreamConfig = {
      ...config,
      characterBoundaryMs: 1_800,
      forceSplitMs: 3_000,
      pauseTimingModel: buildPauseTimingModel({
        withinCharacterGapsMs: [...dotGaps, ...dashGaps],
        withinCharacterGapsAfterDotMs: dotGaps,
        withinCharacterGapsAfterDashMs: dashGaps,
        betweenCharacterGapsMs: [2_100, 2_180, 2_240, 2_300, 2_360, 2_420],
        fallbackBoundaryMs: 1_800,
      }).model,
    };

    let state = createStreamState();
    state = appendStreamSymbol(state, { symbol: '-', startedAt: 0, endedAt: 800 }, dashAwareConfig);
    state = appendStreamSymbol(state, { symbol: '-', startedAt: 2_040, endedAt: 2_840 }, dashAwareConfig);
    state = appendStreamSymbol(state, { symbol: '-', startedAt: 4_120, endedAt: 4_920 }, dashAwareConfig);
    state = advanceStream(state, 7_200, dashAwareConfig);

    expect(state.committedText).toBe('O');
    expect(state.pendingSymbols).toBe('');
  });

  it('does not commit a dash during the impossible early tail of a calibrated pause model', () => {
    const fieldConfig: StreamConfig = {
      ...config,
      characterBoundaryMs: 1_800,
      forceSplitMs: 3_000,
      pauseTimingModel: {
        withinCharacter: { centerMs: 240, spreadMs: 53, sampleCount: 18 },
        withinCharacterAfterDot: { centerMs: 233, spreadMs: 40, sampleCount: 12 },
        withinCharacterAfterDash: { centerMs: 564, spreadMs: 50, sampleCount: 6 },
        betweenCharacter: { centerMs: 919, spreadMs: 161, sampleCount: 6 },
        boundaryMs: 580,
        separationConfidence: 0.97,
        source: 'calibrated',
      },
    };

    let state = createStreamState();
    state = appendStreamSymbol(state, { symbol: '-', startedAt: 459, endedAt: 1_000 }, fieldConfig);
    state = advanceStream(state, 1_150, fieldConfig);

    expect(state.committedText).toBe('');
    expect(state.pendingSymbols).toBe('-');

    state = appendStreamSymbol(state, { symbol: '.', startedAt: 1_375, endedAt: 1_574 }, fieldConfig);
    state = appendStreamSymbol(state, { symbol: '.', startedAt: 1_759, endedAt: 1_939 }, fieldConfig);
    state = appendStreamSymbol(state, { symbol: '.', startedAt: 2_170, endedAt: 2_372 }, fieldConfig);
    state = advanceStream(state, 3_100, fieldConfig);

    expect(state.committedText).toBe('B');
    expect(state.pendingSymbols).toBe('');
  });

  it('replays the 2026-08-11 field capture without fragmenting TBC into TTSTAE', () => {
    const fieldConfig: StreamConfig = {
      ...config,
      characterBoundaryMs: 1_800,
      forceSplitMs: 3_000,
      pauseTimingModel: {
        withinCharacter: { centerMs: 240.1, spreadMs: 52.63, sampleCount: 18 },
        withinCharacterAfterDot: { centerMs: 233.05, spreadMs: 40, sampleCount: 12 },
        withinCharacterAfterDash: { centerMs: 563.65, spreadMs: 50.41, sampleCount: 6 },
        betweenCharacter: { centerMs: 919.2, spreadMs: 161.01, sampleCount: 6 },
        boundaryMs: 579.65,
        separationConfidence: 0.971,
        source: 'calibrated',
      },
    };
    const pulses = [
      { symbol: '-', startedAt: 240_357.5, endedAt: 240_898.4 },
      { symbol: '-', startedAt: 242_688.5, endedAt: 243_247.4 },
      { symbol: '.', startedAt: 243_622.9, endedAt: 243_821.4 },
      { symbol: '.', startedAt: 244_025.7, endedAt: 244_205.6 },
      { symbol: '.', startedAt: 244_414.6, endedAt: 244_616.4 },
      { symbol: '-', startedAt: 246_972.6, endedAt: 247_494.3 },
      { symbol: '.', startedAt: 247_847.7, endedAt: 247_982.9 },
      { symbol: '-', startedAt: 248_249.5, endedAt: 248_866.9 },
      { symbol: '.', startedAt: 249_268.6, endedAt: 249_441.1 },
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
    state = forceSplit(state, 252_500, fieldConfig);

    expect(state.committedText).toBe('TBC');
    expect(state.events.filter((item) => item.kind === 'character-committed').map((item) => item.character)).toEqual(['T', 'B', 'C']);
  });

  it('does not let an overlapping pause model delay the configured character boundary', () => {
    const overlappingModel = buildPauseTimingModel({
      withinCharacterGapsMs: [700, 820, 940, 1_020, 1_080],
      betweenCharacterGapsMs: [900, 1_000, 1_100, 1_180],
      fallbackBoundaryMs: 700,
    }).model;
    expect(overlappingModel.separationConfidence).toBeLessThan(0.5);

    const boundedConfig: StreamConfig = {
      ...config,
      characterBoundaryMs: 700,
      forceSplitMs: 3_000,
      pauseTimingModel: overlappingModel,
    };
    let state = createStreamState();
    state = appendStreamSymbol(state, { symbol: '.', endedAt: 100 }, boundedConfig);
    state = advanceStream(state, 801, boundedConfig);

    expect(state.committedText).toBe('E');
    expect(state.pendingSymbols).toBe('');
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

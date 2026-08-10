import {
  advanceStream,
  appendStreamAlternatives,
  appendStreamSymbol,
  createStreamState,
  forceSplit,
  undoStream,
  type StreamConfig,
  type StreamState,
} from './continuous-stream-segmenter';

export interface DecoderConfig extends StreamConfig {
  durationBoundaryMs: number;
  uncertaintyMarginMs: number;
}

export type PaceMode = 'standard' | 'slow' | 'custom';
export type PulseClassification = 'dot' | 'dash' | 'uncertain';

export interface PulseInput {
  durationMs: number;
  startedAt: number;
  endedAt: number;
}

export interface DecoderState extends StreamState {
  lastClassification: PulseClassification | null;
  uncertainPulseCount: number;
}

export const PACE_PRESETS: Readonly<
  Record<Exclude<PaceMode, 'custom'>, Pick<StreamConfig, 'characterBoundaryMs' | 'forceSplitMs'>>
> = Object.freeze({
  standard: Object.freeze({ characterBoundaryMs: 700, forceSplitMs: 2_500 }),
  slow: Object.freeze({ characterBoundaryMs: 1_200, forceSplitMs: 4_000 }),
});

export const createDecoderState = (): DecoderState => ({
  ...createStreamState(),
  lastClassification: null,
  uncertainPulseCount: 0,
});

export const classifyPulseDuration = (
  durationMs: number,
  config: Pick<DecoderConfig, 'durationBoundaryMs' | 'uncertaintyMarginMs'>
): PulseClassification => {
  const lowerBoundary = config.durationBoundaryMs - config.uncertaintyMarginMs;
  const upperBoundary = config.durationBoundaryMs + config.uncertaintyMarginMs;
  if (durationMs <= lowerBoundary) return 'dot';
  if (durationMs >= upperBoundary) return 'dash';
  return 'uncertain';
};

export const tickDecoder = (
  state: DecoderState,
  now: number,
  config: DecoderConfig
): DecoderState => ({
  ...state,
  ...advanceStream(state, now, config),
});

export const appendPulse = (
  state: DecoderState,
  pulse: PulseInput,
  config: DecoderConfig
): DecoderState => {
  const classification = classifyPulseDuration(pulse.durationMs, config);

  if (classification === 'uncertain') {
    const lowerBoundary = config.durationBoundaryMs - config.uncertaintyMarginMs;
    const upperBoundary = config.durationBoundaryMs + config.uncertaintyMarginMs;
    const position = Math.min(1, Math.max(0, (pulse.durationMs - lowerBoundary) / Math.max(1, upperBoundary - lowerBoundary)));
    const stream = appendStreamAlternatives(state, {
      alternatives: [
        { symbol: '.', scoreAdjustment: -position * 2 },
        { symbol: '-', scoreAdjustment: -(1 - position) * 2 },
      ],
      startedAt: pulse.startedAt,
      endedAt: pulse.endedAt,
    }, config);
    return {
      ...state,
      ...stream,
      status: 'uncertain',
      lastClassification: classification,
      uncertainPulseCount: state.uncertainPulseCount + 1,
      events: [
        ...stream.events,
        {
          id: `${pulse.endedAt}-${stream.events.length}-uncertain`,
          kind: 'uncertain',
          at: pulse.endedAt,
          reason: 'uncertain-pulse',
        },
      ],
    };
  }

  const stream = appendStreamSymbol(
    state,
    {
      symbol: classification === 'dot' ? '.' : '-',
      startedAt: pulse.startedAt,
      endedAt: pulse.endedAt,
    },
    config
  );
  return { ...state, ...stream, lastClassification: classification };
};

export const forceSplitDecoder = (
  state: DecoderState,
  now: number,
  config: DecoderConfig
): DecoderState => ({
  ...state,
  ...forceSplit(state, now, config),
});

export const undoDecoder = (state: DecoderState): DecoderState => ({
  ...state,
  ...undoStream(state),
});

export const resetDecoder = (): DecoderState => createDecoderState();

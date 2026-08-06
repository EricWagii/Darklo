import { decodeMorse, isMorsePrefix } from './morse-code';

export interface DecoderConfig {
  durationBoundaryMs: number;
  uncertaintyMarginMs: number;
  characterGapMs: number;
  wordGapMs: number;
}

export type PaceMode = 'standard' | 'slow' | 'custom';
export type PulseClassification = 'dot' | 'dash' | 'uncertain';
export type DecoderStatus = 'idle' | 'pending' | 'committed' | 'uncertain' | 'invalid';

export interface PulseInput {
  durationMs: number;
  endedAt: number;
}

export interface DecoderState {
  pendingCode: string;
  text: string;
  status: DecoderStatus;
  lastClassification: PulseClassification | null;
  lastPulseEndedAt: number | null;
  lastCharacterCommittedAt: number | null;
  wordSpaceInserted: boolean;
  uncertainPulseCount: number;
}

export const PACE_PRESETS: Readonly<Record<Exclude<PaceMode, 'custom'>, Pick<DecoderConfig, 'characterGapMs' | 'wordGapMs'>>> = Object.freeze({
  standard: Object.freeze({ characterGapMs: 1_800, wordGapMs: 5_000 }),
  slow: Object.freeze({ characterGapMs: 5_000, wordGapMs: 12_000 }),
});

export const createDecoderState = (): DecoderState => ({
  pendingCode: '',
  text: '',
  status: 'idle',
  lastClassification: null,
  lastPulseEndedAt: null,
  lastCharacterCommittedAt: null,
  wordSpaceInserted: false,
  uncertainPulseCount: 0,
});

export const classifyPulseDuration = (
  durationMs: number,
  config: DecoderConfig
): PulseClassification => {
  const lowerBoundary = config.durationBoundaryMs - config.uncertaintyMarginMs;
  const upperBoundary = config.durationBoundaryMs + config.uncertaintyMarginMs;

  if (durationMs <= lowerBoundary) return 'dot';
  if (durationMs >= upperBoundary) return 'dash';
  return 'uncertain';
};

const commitPendingAt = (state: DecoderState, committedAt: number): DecoderState => {
  if (!state.pendingCode) return state;

  const character = decodeMorse(state.pendingCode);
  if (!character) {
    return { ...state, status: 'invalid' };
  }

  return {
    ...state,
    pendingCode: '',
    text: `${state.text}${character}`,
    status: 'committed',
    lastCharacterCommittedAt: committedAt,
    wordSpaceInserted: false,
  };
};

export const tickDecoder = (
  state: DecoderState,
  now: number,
  config: DecoderConfig
): DecoderState => {
  let next = state;

  if (next.pendingCode && next.lastPulseEndedAt !== null) {
    const characterDeadline = next.lastPulseEndedAt + config.characterGapMs;
    if (now >= characterDeadline) {
      next = commitPendingAt(next, characterDeadline);
    }
  }

  if (
    !next.pendingCode &&
    next.text.length > 0 &&
    !next.text.endsWith(' ') &&
    !next.wordSpaceInserted &&
    next.lastCharacterCommittedAt !== null &&
    now >= next.lastCharacterCommittedAt + config.wordGapMs
  ) {
    next = {
      ...next,
      text: `${next.text} `,
      wordSpaceInserted: true,
      status: 'idle',
    };
  }

  return next;
};

export const appendPulse = (
  state: DecoderState,
  pulse: PulseInput,
  config: DecoderConfig
): DecoderState => {
  const settled = tickDecoder(state, pulse.endedAt, config);
  const classification = classifyPulseDuration(pulse.durationMs, config);

  if (classification === 'uncertain') {
    return {
      ...settled,
      status: 'uncertain',
      lastClassification: classification,
      uncertainPulseCount: settled.uncertainPulseCount + 1,
    };
  }

  const symbol = classification === 'dot' ? '.' : '-';
  const pendingCode = `${settled.pendingCode}${symbol}`;

  return {
    ...settled,
    pendingCode,
    status: isMorsePrefix(pendingCode) ? 'pending' : 'invalid',
    lastClassification: classification,
    lastPulseEndedAt: pulse.endedAt,
    wordSpaceInserted: false,
  };
};

export const confirmPending = (state: DecoderState, now: number): DecoderState =>
  commitPendingAt(state, now);

export const undoDecoder = (state: DecoderState): DecoderState => {
  if (state.pendingCode) {
    const pendingCode = state.pendingCode.slice(0, -1);
    return {
      ...state,
      pendingCode,
      status: pendingCode ? (isMorsePrefix(pendingCode) ? 'pending' : 'invalid') : 'idle',
    };
  }

  const withoutTrailingSpace = state.text.replace(/\s+$/, '');
  const text = withoutTrailingSpace.slice(0, -1);
  return {
    ...state,
    text,
    status: text ? 'committed' : 'idle',
    lastCharacterCommittedAt: null,
    wordSpaceInserted: false,
  };
};

export const resetDecoder = (): DecoderState => createDecoderState();

export const getCharacterCountdownMs = (
  state: DecoderState,
  now: number,
  config: DecoderConfig
): number | null => {
  if (!state.pendingCode || state.lastPulseEndedAt === null) return null;
  return Math.max(0, state.lastPulseEndedAt + config.characterGapMs - now);
};

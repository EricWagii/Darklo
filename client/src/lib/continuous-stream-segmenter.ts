import { decodeMorse, isMorsePrefix } from './morse-code';
import { scorePauseGap, type PauseTimingModel } from './continuous-pause-calibration';

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
  pauseTimingModel?: PauseTimingModel;
  candidateCommitScoreWindow?: number;
}

export interface SymbolAlternative {
  symbol: MorseSymbol;
  scoreAdjustment: number;
}

export interface StreamEvent {
  id: string;
  kind: StreamEventKind;
  at: number;
  symbol?: MorseSymbol;
  code?: string;
  character?: string;
  alternatives?: readonly SymbolAlternative[];
  reason?: 'invalid-tail' | 'ambiguous-tail' | 'candidate-overflow' | 'uncertain-pulse';
}

export interface SegmentationCandidate {
  committedText: string;
  pendingSymbols: string;
  score: number;
}

export interface StreamState {
  committedText: string;
  pendingSymbols: string;
  events: readonly StreamEvent[];
  candidates: readonly SegmentationCandidate[];
  lastSymbolEndedAt: number | null;
  status: 'idle' | 'collecting' | 'candidate' | 'committed' | 'uncertain' | 'discarded';
}

const event = (
  state: StreamState,
  kind: StreamEventKind,
  at: number,
  detail: Omit<StreamEvent, 'id' | 'kind' | 'at'> = {}
): StreamEvent => ({ id: `${at}-${state.events.length}-${kind}`, kind, at, ...detail });

const commonPrefix = (values: readonly string[]): string => {
  if (values.length === 0) return '';
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (prefix && !value.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
};

const dedupeCandidates = (
  candidates: readonly SegmentationCandidate[],
  config: StreamConfig
): SegmentationCandidate[] => {
  const bestByValue = new Map<string, SegmentationCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.committedText}\u0000${candidate.pendingSymbols}`;
    const current = bestByValue.get(key);
    if (!current || candidate.score > current.score) bestByValue.set(key, candidate);
  }
  return Array.from(bestByValue.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, config.maxCandidates));
};

const bestPending = (candidates: readonly SegmentationCandidate[]): string =>
  candidates[0]?.pendingSymbols ?? '';

const lastMorseSymbol = (symbols: string): MorseSymbol | undefined => {
  const symbol = symbols.at(-1);
  return symbol === '.' || symbol === '-' ? symbol : undefined;
};

const usablePauseModel = (config: StreamConfig): PauseTimingModel | null => {
  const model = config.pauseTimingModel;
  return model?.source === 'calibrated' && model.separationConfidence >= 0.5
    ? model
    : null;
};

const adaptiveBoundaryCeiling = (config: StreamConfig, model: PauseTimingModel): number => {
  const modelCeiling = model.boundaryMs + model.betweenCharacter.spreadMs;
  const configuredCeiling = config.characterBoundaryMs * 1.35;
  const emergencyCeiling = Math.max(config.characterBoundaryMs, config.forceSplitMs - 100);
  return Math.min(
    emergencyCeiling,
    Math.max(config.characterBoundaryMs, Math.min(configuredCeiling, modelCeiling))
  );
};

const competitiveCandidates = (
  candidates: readonly SegmentationCandidate[],
  config: StreamConfig
): readonly SegmentationCandidate[] => {
  if (candidates.length <= 1) return candidates;
  const window = config.candidateCommitScoreWindow ?? (config.pauseTimingModel ? 3 : Number.POSITIVE_INFINITY);
  const bestScore = candidates[0].score;
  return candidates.filter((candidate) => candidate.score >= bestScore - window);
};

const appendCommittedEvents = (
  state: StreamState,
  text: string,
  at: number,
  code?: string
): readonly StreamEvent[] => {
  if (!text) return state.events;
  const events = [...state.events];
  events.push(event({ ...state, events }, 'symbol-committed', at, { code }));
  for (const character of text) {
    events.push(event({ ...state, events }, 'character-committed', at, { character, code }));
  }
  events.push(event({ ...state, events }, 'confirmed-boundary', at));
  return events;
};

const releaseStablePrefix = (
  state: StreamState,
  candidates: readonly SegmentationCandidate[],
  at: number,
  config: StreamConfig
): StreamState => {
  const competitive = competitiveCandidates(candidates, config);
  const stable = commonPrefix(competitive.map((candidate) => candidate.committedText));
  if (!stable) {
    return {
      ...state,
      candidates: competitive,
      pendingSymbols: bestPending(competitive),
      status: competitive.length > 1 ? 'candidate' : 'collecting',
    };
  }

  const stripped = competitive.map((candidate) => ({
    ...candidate,
    committedText: candidate.committedText.slice(stable.length),
  }));
  return {
    ...state,
    committedText: `${state.committedText}${stable}`,
    pendingSymbols: bestPending(stripped),
    candidates: stripped,
    events: appendCommittedEvents(state, stable, at),
    status: 'committed',
  };
};

export const createStreamState = (): StreamState => ({
  committedText: '',
  pendingSymbols: '',
  events: [],
  candidates: [],
  lastSymbolEndedAt: null,
  status: 'idle',
});

const initialCandidate = (state: StreamState): SegmentationCandidate[] =>
  state.candidates.length > 0
    ? [...state.candidates]
    : state.pendingSymbols
      ? [{ committedText: '', pendingSymbols: state.pendingSymbols, score: 0 }]
      : [];

export const appendStreamSymbol = (
  state: StreamState,
  input: { symbol: MorseSymbol; startedAt?: number; endedAt: number },
  config: StreamConfig
): StreamState => appendStreamAlternatives(state, {
  alternatives: [{ symbol: input.symbol, scoreAdjustment: 0 }],
  startedAt: input.startedAt,
  endedAt: input.endedAt,
}, config);

export const appendStreamAlternatives = (
  state: StreamState,
  input: {
    alternatives: readonly SymbolAlternative[];
    startedAt?: number;
    endedAt: number;
  },
  config: StreamConfig
): StreamState => {
  let next = state;
  const startedAt = input.startedAt ?? input.endedAt;
  const gap = state.lastSymbolEndedAt === null ? null : startedAt - state.lastSymbolEndedAt;
  if (gap !== null && gap >= config.forceSplitMs && state.pendingSymbols) {
    next = forceSplit(state, input.endedAt, config);
  }

  const current = initialCandidate(next);
  let candidates: SegmentationCandidate[];
  let boundaryEvent: StreamEvent | null = null;

  if (current.length === 0) {
    candidates = input.alternatives
      .filter(({ symbol }) => isMorsePrefix(symbol))
      .map(({ symbol, scoreAdjustment }) => ({
        committedText: '',
        pendingSymbols: symbol,
        score: scoreAdjustment,
      }));
  } else {
    const effectiveGap = next.lastSymbolEndedAt === null ? 0 : startedAt - next.lastSymbolEndedAt;
    const lower = config.characterBoundaryMs - config.boundaryUncertaintyMs;
    const upper = config.characterBoundaryMs + config.boundaryUncertaintyMs;
    const pauseModel = usablePauseModel(config);
    const pauseCeiling = pauseModel ? adaptiveBoundaryCeiling(config, pauseModel) : null;
    const expanded: SegmentationCandidate[] = [];
    let hasCandidateBoundary = false;

    for (const candidate of current) {
      const pauseScores = pauseModel
        ? scorePauseGap(pauseModel, effectiveGap, lastMorseSymbol(candidate.pendingSymbols))
        : null;
      const allowContinuation = pauseScores !== null
        ? effectiveGap < (pauseCeiling ?? Number.POSITIVE_INFINITY)
        : effectiveGap <= upper;
      const allowBoundary = pauseScores !== null || effectiveGap >= lower;
      const continuationAdjustment = pauseScores?.continuationScore
        ?? -Math.max(0, effectiveGap - lower) / Math.max(1, config.boundaryUncertaintyMs);
      const boundaryAdjustment = pauseScores?.boundaryScore
        ?? -Math.abs(effectiveGap - config.characterBoundaryMs) / Math.max(1, config.boundaryUncertaintyMs);
      hasCandidateBoundary ||= allowBoundary && allowContinuation;
      for (const alternative of input.alternatives) {
        if (allowContinuation && candidate.pendingSymbols.length < config.maxPendingSymbols) {
          const pendingSymbols = `${candidate.pendingSymbols}${alternative.symbol}`;
          if (isMorsePrefix(pendingSymbols)) {
            expanded.push({
              ...candidate,
              pendingSymbols,
              score: candidate.score + continuationAdjustment + alternative.scoreAdjustment,
            });
          }
        }
        if (allowBoundary) {
          const character = decodeMorse(candidate.pendingSymbols);
          if (character) {
            expanded.push({
              committedText: `${candidate.committedText}${character}`,
              pendingSymbols: alternative.symbol,
              score: candidate.score + boundaryAdjustment + alternative.scoreAdjustment,
            });
          }
        }
      }
    }

    if (expanded.length === 0) {
      const primary = input.alternatives[0]?.symbol ?? '.';
      const fallback = `${bestPending(current)}${primary}`.slice(-config.maxPendingSymbols);
      expanded.push({ committedText: '', pendingSymbols: fallback, score: -100 });
    }
    candidates = dedupeCandidates(expanded, config);
    if (hasCandidateBoundary) {
      boundaryEvent = event(next, 'candidate-boundary', input.endedAt);
    }
  }

  const events = [
    ...next.events,
    ...(boundaryEvent ? [boundaryEvent] : []),
    event({ ...next, events: [...next.events, ...(boundaryEvent ? [boundaryEvent] : [])] }, 'symbol-pending', input.endedAt, {
      symbol: input.alternatives[0]?.symbol,
    }),
  ];
  const withSymbol: StreamState = {
    ...next,
    events,
    candidates,
    pendingSymbols: bestPending(candidates),
    lastSymbolEndedAt: input.endedAt,
    status: candidates.length > 1 ? 'candidate' : isMorsePrefix(bestPending(candidates)) ? 'collecting' : 'uncertain',
  };
  return releaseStablePrefix(withSymbol, candidates, input.endedAt, config);
};

export const getTentativeText = (state: StreamState): string =>
  state.candidates[0]?.committedText ?? '';

interface FinalCandidate {
  text: string;
  score: number;
  code: string;
}

const finalizeCandidates = (state: StreamState): FinalCandidate[] =>
  initialCandidate(state)
    .map((candidate) => {
      const character = decodeMorse(candidate.pendingSymbols);
      return character
        ? { text: `${candidate.committedText}${character}`, score: candidate.score, code: candidate.pendingSymbols }
        : null;
    })
    .filter((candidate): candidate is FinalCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score);

const commitFinalText = (state: StreamState, text: string, at: number, code?: string): StreamState => ({
  ...state,
  committedText: `${state.committedText}${text}`,
  pendingSymbols: '',
  candidates: [],
  events: appendCommittedEvents(state, text, at, code),
  status: 'committed',
});

export const advanceStream = (
  state: StreamState,
  now: number,
  config: StreamConfig
): StreamState => {
  if (!state.pendingSymbols || state.lastSymbolEndedAt === null) return state;
  const idleMs = now - state.lastSymbolEndedAt;
  if (idleMs >= config.forceSplitMs) return forceSplit(state, now, config);
  const pauseModel = usablePauseModel(config);
  if (pauseModel) {
    const pauseScore = scorePauseGap(pauseModel, idleMs, lastMorseSymbol(state.pendingSymbols));
    if (
      idleMs < adaptiveBoundaryCeiling(config, pauseModel)
      && pauseScore.boundaryScore <= pauseScore.continuationScore + 0.35
    ) {
      return state;
    }
  } else if (idleMs < config.characterBoundaryMs) {
    return state;
  }

  const released = releaseStablePrefix(state, state.candidates, now, config);
  const finals = finalizeCandidates(released);
  const competitiveFinals = competitiveCandidates(
    finals.map(({ text, score, code }) => ({ committedText: text, pendingSymbols: code, score })),
    config
  ).map((candidate) => ({
    text: candidate.committedText,
    code: candidate.pendingSymbols,
    score: candidate.score,
  }));
  const distinct = Array.from(new Set(competitiveFinals.map((candidate) => candidate.text)));
  if (distinct.length === 1) return commitFinalText(released, distinct[0], now, competitiveFinals[0]?.code);
  return {
    ...released,
    status: 'candidate',
    events: released.events.some((item) => item.kind === 'candidate-boundary' && item.at === now)
      ? released.events
      : [...released.events, event(released, 'candidate-boundary', now)],
  };
};

export const forceSplit = (
  state: StreamState,
  now: number,
  _config: StreamConfig
): StreamState => {
  if (!state.pendingSymbols && state.candidates.length === 0) return state;
  const finals = finalizeCandidates(state);
  if (finals.length === 0) {
    return {
      ...state,
      pendingSymbols: '',
      candidates: [],
      events: [...state.events, event(state, 'discarded', now, { code: state.pendingSymbols, reason: 'invalid-tail' })],
      status: 'discarded',
    };
  }

  const distinct = Array.from(new Set(finals.map((candidate) => candidate.text)));
  if (distinct.length === 1) return commitFinalText(state, distinct[0], now, finals[0].code);

  const stable = commonPrefix(distinct);
  const second = finals[1];
  if (!second || finals[0].score - second.score > 0.75) {
    return commitFinalText(state, finals[0].text, now, finals[0].code);
  }

  let next = stable ? commitFinalText(state, stable, now) : { ...state, pendingSymbols: '', candidates: [] };
  const uncertainEvent = event(next, 'uncertain', now, { code: state.pendingSymbols, reason: 'ambiguous-tail' });
  next = {
    ...next,
    pendingSymbols: '',
    candidates: [],
    events: [
      ...next.events,
      uncertainEvent,
      event({ ...next, events: [...next.events, uncertainEvent] }, 'discarded', now, {
        code: state.pendingSymbols,
        reason: 'ambiguous-tail',
      }),
    ],
    status: 'discarded',
  };
  return next;
};

export const undoStream = (state: StreamState): StreamState => {
  if (state.pendingSymbols) {
    const pendingSymbols = state.pendingSymbols.slice(0, -1);
    const candidates = state.candidates
      .map((candidate) => ({ ...candidate, pendingSymbols: candidate.pendingSymbols.slice(0, -1) }))
      .filter((candidate) => candidate.pendingSymbols || candidate.committedText);
    const lastPendingIndex = [...state.events].reverse().findIndex((item) => item.kind === 'symbol-pending');
    const removeIndex = lastPendingIndex < 0 ? -1 : state.events.length - 1 - lastPendingIndex;
    return {
      ...state,
      pendingSymbols,
      candidates,
      events: removeIndex < 0 ? state.events : state.events.filter((_, index) => index !== removeIndex),
      status: pendingSymbols ? 'collecting' : state.committedText ? 'committed' : 'idle',
    };
  }

  if (!state.committedText) return state;
  return {
    ...state,
    committedText: state.committedText.slice(0, -1),
    status: state.committedText.length > 1 ? 'committed' : 'idle',
  };
};

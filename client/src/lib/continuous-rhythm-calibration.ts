import { classifyPulseDuration, type PulseInput } from './continuous-code-decoder';

export const RHYTHM_CALIBRATION_PATTERN = '...---...';

type RhythmCalibrationReason =
  | 'incomplete-attempt'
  | 'uncertain-pulse'
  | 'symbol-mismatch'
  | 'invalid-gap';

export type RhythmCalibrationAttemptResult =
  | {
      ok: true;
      symbols: string;
      withinCharacterGapsMs: number[];
      withinCharacterGapsAfterDotMs: number[];
      withinCharacterGapsAfterDashMs: number[];
      betweenCharacterGapsMs: number[];
    }
  | {
      ok: false;
      reason: RhythmCalibrationReason;
      symbols: string;
    };

export type RhythmCalibrationTrialStatus = 'pending' | 'recording' | 'review' | 'accepted';

export interface RhythmCalibrationTrial {
  id: number;
  status: RhythmCalibrationTrialStatus;
  pulses: PulseInput[];
  result: RhythmCalibrationAttemptResult | null;
}

export interface AcceptedRhythmCalibrationSamples {
  withinCharacterGapsMs: number[];
  withinCharacterGapsAfterDotMs: number[];
  withinCharacterGapsAfterDashMs: number[];
  betweenCharacterGapsMs: number[];
}

export const evaluateRhythmCalibrationAttempt = (
  pulses: readonly PulseInput[],
  config: {
    durationBoundaryMs: number;
    uncertaintyMarginMs: number;
  }
): RhythmCalibrationAttemptResult => {
  const classifications = pulses.map((pulse) => classifyPulseDuration(pulse.durationMs, config));
  const symbols = classifications
    .map((classification) => classification === 'dot' ? '.' : classification === 'dash' ? '-' : '?')
    .join('');

  if (pulses.length !== RHYTHM_CALIBRATION_PATTERN.length) {
    return { ok: false, reason: 'incomplete-attempt', symbols };
  }
  if (classifications.includes('uncertain')) {
    return { ok: false, reason: 'uncertain-pulse', symbols };
  }
  if (symbols !== RHYTHM_CALIBRATION_PATTERN) {
    return { ok: false, reason: 'symbol-mismatch', symbols };
  }

  const withinCharacterGapsMs: number[] = [];
  const withinCharacterGapsAfterDotMs: number[] = [];
  const withinCharacterGapsAfterDashMs: number[] = [];
  const betweenCharacterGapsMs: number[] = [];
  for (let index = 0; index < pulses.length - 1; index += 1) {
    const gapMs = pulses[index + 1].startedAt - pulses[index].endedAt;
    if (!Number.isFinite(gapMs) || gapMs < 0) {
      return { ok: false, reason: 'invalid-gap', symbols };
    }
    if (index === 2 || index === 5) {
      betweenCharacterGapsMs.push(gapMs);
    } else {
      withinCharacterGapsMs.push(gapMs);
      if (classifications[index] === 'dot') {
        withinCharacterGapsAfterDotMs.push(gapMs);
      } else {
        withinCharacterGapsAfterDashMs.push(gapMs);
      }
    }
  }

  return {
    ok: true,
    symbols,
    withinCharacterGapsMs,
    withinCharacterGapsAfterDotMs,
    withinCharacterGapsAfterDashMs,
    betweenCharacterGapsMs,
  };
};

export const createRhythmCalibrationTrials = (count: number): RhythmCalibrationTrial[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    status: 'pending',
    pulses: [],
    result: null,
  }));

export const beginRhythmCalibrationTrial = (
  trials: readonly RhythmCalibrationTrial[],
  trialIndex: number
): RhythmCalibrationTrial[] => {
  if (trials.some((trial) => trial.status === 'recording')) return [...trials];
  return trials.map((trial, index) => index === trialIndex
    ? { ...trial, status: 'recording', pulses: [], result: null }
    : trial);
};

export const appendRhythmCalibrationPulse = (
  trials: readonly RhythmCalibrationTrial[],
  trialIndex: number,
  pulse: PulseInput
): RhythmCalibrationTrial[] => trials.map((trial, index) => (
  index === trialIndex && trial.status === 'recording'
    ? { ...trial, pulses: [...trial.pulses, pulse] }
    : trial
));

export const finishRhythmCalibrationTrial = (
  trials: readonly RhythmCalibrationTrial[],
  trialIndex: number,
  config: {
    durationBoundaryMs: number;
    uncertaintyMarginMs: number;
  }
): RhythmCalibrationTrial[] => trials.map((trial, index) => (
  index === trialIndex && trial.status === 'recording'
    ? {
        ...trial,
        status: 'review',
        result: evaluateRhythmCalibrationAttempt(trial.pulses, config),
      }
    : trial
));

export const acceptRhythmCalibrationTrial = (
  trials: readonly RhythmCalibrationTrial[],
  trialIndex: number
): RhythmCalibrationTrial[] => trials.map((trial, index) => (
  index === trialIndex && trial.status === 'review' && trial.result?.ok
    ? { ...trial, status: 'accepted' }
    : trial
));

export const resetRhythmCalibrationTrial = (
  trials: readonly RhythmCalibrationTrial[],
  trialIndex: number
): RhythmCalibrationTrial[] => trials.map((trial, index) => index === trialIndex
  ? { ...trial, status: 'pending', pulses: [], result: null }
  : trial);

export const buildAcceptedRhythmCalibrationSamples = (
  trials: readonly RhythmCalibrationTrial[],
  requiredCount: number
): AcceptedRhythmCalibrationSamples | null => {
  if (trials.length !== requiredCount || trials.some((trial) => trial.status !== 'accepted' || !trial.result?.ok)) {
    return null;
  }

  const acceptedResults = trials.map((trial) => trial.result).filter(
    (result): result is Extract<RhythmCalibrationAttemptResult, { ok: true }> => Boolean(result?.ok)
  );
  if (acceptedResults.length !== requiredCount) return null;

  return acceptedResults.reduce<AcceptedRhythmCalibrationSamples>((samples, result) => ({
    withinCharacterGapsMs: [...samples.withinCharacterGapsMs, ...result.withinCharacterGapsMs],
    withinCharacterGapsAfterDotMs: [...samples.withinCharacterGapsAfterDotMs, ...result.withinCharacterGapsAfterDotMs],
    withinCharacterGapsAfterDashMs: [...samples.withinCharacterGapsAfterDashMs, ...result.withinCharacterGapsAfterDashMs],
    betweenCharacterGapsMs: [...samples.betweenCharacterGapsMs, ...result.betweenCharacterGapsMs],
  }), {
    withinCharacterGapsMs: [],
    withinCharacterGapsAfterDotMs: [],
    withinCharacterGapsAfterDashMs: [],
    betweenCharacterGapsMs: [],
  });
};

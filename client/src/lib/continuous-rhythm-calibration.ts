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

import { describe, expect, it } from 'vitest';
import {
  evaluateRhythmCalibrationAttempt,
  RHYTHM_CALIBRATION_PATTERN,
} from '../client/src/lib/continuous-rhythm-calibration';

const pulse = (symbol: '.' | '-', startedAt: number, endedAt: number) => ({
  type: 'pulse' as const,
  startedAt,
  endedAt,
  durationMs: symbol === '.' ? 260 : 760,
  peakEnvelope: 120,
});

const sosAttempt = [
  pulse('.', 0, 260),
  pulse('.', 720, 980),
  pulse('.', 1_480, 1_740),
  pulse('-', 3_220, 3_980),
  pulse('-', 5_000, 5_760),
  pulse('-', 6_820, 7_580),
  pulse('.', 9_080, 9_340),
  pulse('.', 9_820, 10_080),
  pulse('.', 10_600, 10_860),
];

describe('continuous Morse rhythm calibration attempt', () => {
  it('extracts within-character and between-character release gaps from SOS', () => {
    const result = evaluateRhythmCalibrationAttempt(sosAttempt, {
      durationBoundaryMs: 500,
      uncertaintyMarginMs: 80,
    });

    expect(RHYTHM_CALIBRATION_PATTERN).toBe('...---...');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.symbols).toBe('...---...');
    expect(result.withinCharacterGapsMs).toEqual([460, 500, 1_020, 1_060, 480, 520]);
    expect(result.betweenCharacterGapsMs).toEqual([1_480, 1_500]);
  });

  it('rejects a symbol mismatch without returning timing samples', () => {
    const mismatch = [...sosAttempt];
    mismatch[4] = pulse('.', 5_000, 5_260);
    const result = evaluateRhythmCalibrationAttempt(mismatch, {
      durationBoundaryMs: 500,
      uncertaintyMarginMs: 80,
    });

    expect(result).toMatchObject({ ok: false, reason: 'symbol-mismatch' });
    expect('withinCharacterGapsMs' in result).toBe(false);
  });

  it('rejects uncertain pulse duration and incomplete attempts', () => {
    const uncertain = [...sosAttempt];
    uncertain[8] = { ...uncertain[8], durationMs: 500 };

    expect(evaluateRhythmCalibrationAttempt(uncertain, {
      durationBoundaryMs: 500,
      uncertaintyMarginMs: 80,
    })).toMatchObject({ ok: false, reason: 'uncertain-pulse' });
    expect(evaluateRhythmCalibrationAttempt(sosAttempt.slice(0, 8), {
      durationBoundaryMs: 500,
      uncertaintyMarginMs: 80,
    })).toMatchObject({ ok: false, reason: 'incomplete-attempt' });
  });
});

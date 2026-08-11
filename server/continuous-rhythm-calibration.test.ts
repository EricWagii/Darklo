import { describe, expect, it } from 'vitest';
import {
  acceptRhythmCalibrationTrial,
  appendRhythmCalibrationPulse,
  beginRhythmCalibrationTrial,
  buildAcceptedRhythmCalibrationSamples,
  createRhythmCalibrationTrials,
  finishRhythmCalibrationTrial,
  evaluateRhythmCalibrationAttempt,
  resetRhythmCalibrationTrial,
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
    expect(result.withinCharacterGapsAfterDotMs).toEqual([460, 500, 480, 520]);
    expect(result.withinCharacterGapsAfterDashMs).toEqual([1_020, 1_060]);
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

  it('keeps three SOS trials isolated until each trial is explicitly accepted', () => {
    const config = { durationBoundaryMs: 500, uncertaintyMarginMs: 80 };
    let trials = createRhythmCalibrationTrials(3);

    for (let trialIndex = 0; trialIndex < 3; trialIndex += 1) {
      trials = beginRhythmCalibrationTrial(trials, trialIndex);
      for (const event of sosAttempt) {
        trials = appendRhythmCalibrationPulse(trials, trialIndex, event);
      }
      trials = finishRhythmCalibrationTrial(trials, trialIndex, config);

      expect(trials[trialIndex].status).toBe('review');
      expect(buildAcceptedRhythmCalibrationSamples(trials, 3)).toBeNull();

      trials = acceptRhythmCalibrationTrial(trials, trialIndex);
    }

    const samples = buildAcceptedRhythmCalibrationSamples(trials, 3);
    expect(samples).not.toBeNull();
    expect(samples?.betweenCharacterGapsMs).toHaveLength(6);
    expect(samples?.withinCharacterGapsMs).toHaveLength(18);
  });

  it('removes a retried trial completely without changing the other accepted trials', () => {
    const config = { durationBoundaryMs: 500, uncertaintyMarginMs: 80 };
    let trials = createRhythmCalibrationTrials(3);

    for (let trialIndex = 0; trialIndex < 3; trialIndex += 1) {
      trials = beginRhythmCalibrationTrial(trials, trialIndex);
      for (const event of sosAttempt) {
        trials = appendRhythmCalibrationPulse(trials, trialIndex, event);
      }
      trials = finishRhythmCalibrationTrial(trials, trialIndex, config);
      trials = acceptRhythmCalibrationTrial(trials, trialIndex);
    }

    trials = resetRhythmCalibrationTrial(trials, 1);

    expect(trials[0].status).toBe('accepted');
    expect(trials[1]).toMatchObject({ status: 'pending', pulses: [], result: null });
    expect(trials[2].status).toBe('accepted');
    expect(buildAcceptedRhythmCalibrationSamples(trials, 3)).toBeNull();
  });

  it('does not let a second trial record while another trial is active', () => {
    let trials = createRhythmCalibrationTrials(3);
    trials = beginRhythmCalibrationTrial(trials, 0);
    trials = beginRhythmCalibrationTrial(trials, 1);

    expect(trials.map((trial) => trial.status)).toEqual(['recording', 'pending', 'pending']);
  });
});

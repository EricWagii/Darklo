import { describe, expect, it } from 'vitest';
import { HARDWARE_CONFIG } from '../shared/hardware-config';
import * as baselineUtils from '../client/src/lib/resting-baseline-utils';
import { calculateActivityEvidence } from '../client/src/lib/temporal-burst-recognition';

const { getRestingBaselineWaveform } = baselineUtils;

const samples = (length: number): number[] => Array.from({ length }, (_, index) =>
  Math.sin(2 * Math.PI * 34 * index / HARDWARE_CONFIG.SAMPLE_RATE)
);

const baselineRecord = (length: number) => ({
  restingBaseline: { ch1: samples(length), ch2: samples(length), ch3: samples(length) },
});

const measuredBaselineRecord = (length: number, captureDurationMs = 5_000) => ({
  ...baselineRecord(length),
  captureDurationMs,
  measuredSampleRate: length / (captureDurationMs / 1_000),
});

describe('resting baseline eligibility for the active recognition pipeline', () => {
  it('refuses a legacy 100-point baseline that cannot produce activity evidence', () => {
    const record = baselineRecord(100);
    const rawAction = Array.from({ length: 1500 }, (_, index) =>
      index >= 400 && index < 700 ? 100 * Math.sin(2 * Math.PI * 80 * index / 500) : 0
    );

    expect(calculateActivityEvidence(rawAction, record.restingBaseline.ch2, 500).reliable).toBe(false);
    expect(Boolean(getRestingBaselineWaveform(record))).toBe(false);
  });

  it('requires measured timing and at least 80 percent of the configured 5-second sample count', () => {
    const minimum = HARDWARE_CONFIG.SAMPLE_RATE * 5 * 0.8;

    expect(Boolean(getRestingBaselineWaveform(baselineRecord(2_500)))).toBe(false);
    expect(Boolean(getRestingBaselineWaveform(measuredBaselineRecord(minimum - 1)))).toBe(false);
    expect(Boolean(getRestingBaselineWaveform(measuredBaselineRecord(minimum)))).toBe(true);
  });

  it('rejects a stored baseline whose recorded capture duration reveals a low frame rate', () => {
    const record = measuredBaselineRecord(2_100, 6_000);

    expect(Boolean(getRestingBaselineWaveform(record))).toBe(false);
  });

  it('supports both 500 Hz and 1000 Hz bands while rejecting the gap and overspeed data', () => {
    expect(Boolean(getRestingBaselineWaveform(measuredBaselineRecord(2_500)))).toBe(true);
    expect(Boolean(getRestingBaselineWaveform(measuredBaselineRecord(5_000)))).toBe(true);
    expect(Boolean(getRestingBaselineWaveform(measuredBaselineRecord(3_500)))).toBe(false);
    expect(Boolean(getRestingBaselineWaveform(measuredBaselineRecord(6_500)))).toBe(false);
    expect(Boolean(getRestingBaselineWaveform(measuredBaselineRecord(2_500, 3_000)))).toBe(false);
  });

  it('exposes a measured sample rate only for validated three-channel baseline data', () => {
    const getter = (baselineUtils as typeof baselineUtils & {
      getRestingBaselineSampleRate?: (record: ReturnType<typeof measuredBaselineRecord>) => number | undefined;
    }).getRestingBaselineSampleRate;
    expect(typeof getter).toBe('function');
    if (!getter) return;

    expect(getter(measuredBaselineRecord(2_500))).toBe(500);
    expect(getter(measuredBaselineRecord(5_000))).toBe(1000);
    expect(getter(baselineRecord(2_500) as ReturnType<typeof measuredBaselineRecord>)).toBeUndefined();
    const missingMeasuredRate = measuredBaselineRecord(2_500);
    delete (missingMeasuredRate as Partial<typeof missingMeasuredRate>).measuredSampleRate;
    expect(getter(missingMeasuredRate)).toBeUndefined();
    const invalid = measuredBaselineRecord(2_500);
    invalid.restingBaseline.ch3[0] = Number.NaN;
    expect(getter(invalid)).toBeUndefined();
  });
});

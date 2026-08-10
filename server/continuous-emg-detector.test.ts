import { describe, expect, it } from 'vitest';
import {
  ContinuousEmgDetector,
  buildContinuousCalibration,
  estimateContinuousBaseline,
  type DetectorEvent,
} from '../client/src/lib/continuous-emg-detector';

const SAMPLE_INTERVAL_MS = 4;

const feed = (
  detector: ContinuousEmgDetector,
  values: number[],
  startAt = 0
): DetectorEvent[] => values.flatMap((value, index) =>
  detector.push(value, startAt + index * SAMPLE_INTERVAL_MS)
);

const quiet = (length: number): number[] =>
  Array.from({ length }, (_, index) => [-2, 0, 2][index % 3]);

const bipolarBurst = (length: number, amplitude = 120): number[] =>
  Array.from({ length }, (_, index) => (index % 2 === 0 ? amplitude : -amplitude));

const createDetector = (overrides = {}) => new ContinuousEmgDetector({
  baselineCenter: 0,
  baselineNoise: 3,
  startupGuardMs: 500,
  minPulseMs: 80,
  releaseDebounceMs: 60,
  maxPulseMs: 2_000,
  ...overrides,
});

describe('continuous EMG detector', () => {
  it('estimates a robust resting center and noise scale', () => {
    const stats = estimateContinuousBaseline([...quiet(400), 900, -800]);
    expect(Math.abs(stats.center)).toBeLessThan(0.1);
    expect(stats.noise).toBeGreaterThan(1);
    expect(stats.noise).toBeLessThan(5);
  });

  it('does not emit pulses for resting noise', () => {
    const detector = createDetector();
    const events = feed(detector, quiet(600));
    expect(events.filter((event) => event.type === 'pulse')).toHaveLength(0);
  });

  it('emits one pulse for one sustained bipolar contraction', () => {
    const detector = createDetector();
    const values = [...quiet(150), ...bipolarBurst(100), ...quiet(50)];
    const events = feed(detector, values);
    const pulses = events.filter((event) => event.type === 'pulse');

    expect(pulses).toHaveLength(1);
    expect(pulses[0].type === 'pulse' && pulses[0].durationMs).toBeGreaterThan(300);
    expect(pulses[0].type === 'pulse' && pulses[0].durationMs).toBeLessThan(500);
  });

  it('does not split a pulse around a brief signal dip', () => {
    const detector = createDetector();
    const values = [
      ...quiet(150),
      ...bipolarBurst(55),
      ...quiet(8),
      ...bipolarBurst(55),
      ...quiet(50),
    ];
    const pulses = feed(detector, values).filter((event) => event.type === 'pulse');
    expect(pulses).toHaveLength(1);
  });

  it('ignores spikes shorter than the minimum pulse duration', () => {
    const detector = createDetector();
    const values = [...quiet(150), ...bipolarBurst(10), ...quiet(50)];
    const pulses = feed(detector, values).filter((event) => event.type === 'pulse');
    expect(pulses).toHaveLength(0);
  });

  it('suppresses contractions occurring entirely inside the startup guard', () => {
    const detector = createDetector({ startupGuardMs: 800 });
    const values = [...quiet(20), ...bipolarBurst(80), ...quiet(150)];
    const pulses = feed(detector, values).filter((event) => event.type === 'pulse');
    expect(pulses).toHaveLength(0);
  });

  it('blocks saturated input instead of decoding it', () => {
    const detector = createDetector({ startupGuardMs: 0 });
    const events = feed(detector, [32_767]);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'blocked',
      reason: 'saturation',
    }));
  });
});

describe('continuous EMG calibration', () => {
  it('builds separated short and long duration groups', () => {
    const result = buildContinuousCalibration({
      baselineSamples: quiet(750),
      shortDurationsMs: [220, 250, 270, 240],
      longDurationsMs: [650, 700, 750, 680],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.calibration.durationBoundaryMs).toBeGreaterThan(270);
      expect(result.calibration.durationBoundaryMs).toBeLessThan(650);
      expect(result.calibration.uncertaintyMarginMs).toBeGreaterThan(0);
    }
  });

  it('rejects overlapping short and long duration groups', () => {
    const result = buildContinuousCalibration({
      baselineSamples: quiet(750),
      shortDurationsMs: [300, 420, 500],
      longDurationsMs: [430, 500, 560],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('区分');
    }
  });

  it('keeps field-recorded short and long bites on opposite sides of the boundary', () => {
    const result = buildContinuousCalibration({
      baselineSamples: quiet(750),
      shortDurationsMs: [366, 498, 294],
      longDurationsMs: [900, 1_176, 1_174],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The field session contained valid short events up to 554 ms and valid
      // long events down to 720 ms. A midpoint at 770 ms loses those long bites.
      expect(result.calibration.durationBoundaryMs).toBeGreaterThan(554);
      expect(result.calibration.durationBoundaryMs).toBeLessThan(720);
    }
  });

  it('calibrates release debounce so a brief internal dropout stays one contraction', () => {
    const result = buildContinuousCalibration({
      baselineSamples: quiet(750),
      shortDurationsMs: [360, 400, 420],
      longDurationsMs: [850, 900, 950],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calibration.detectorConfig.releaseDebounceMs).toBeGreaterThanOrEqual(90);

    const detector = new ContinuousEmgDetector({
      ...result.calibration.detectorConfig,
      startupGuardMs: 0,
    });
    const values = [
      ...quiet(20),
      ...bipolarBurst(75),
      ...quiet(35),
      ...bipolarBurst(75),
      ...quiet(60),
    ];
    const pulses = feed(detector, values).filter((event) => event.type === 'pulse');

    expect(pulses).toHaveLength(1);
  });

  it('still separates two intentional contractions after calibrated debounce', () => {
    const result = buildContinuousCalibration({
      baselineSamples: quiet(750),
      shortDurationsMs: [360, 400, 420],
      longDurationsMs: [850, 900, 950],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const detector = new ContinuousEmgDetector({
      ...result.calibration.detectorConfig,
      startupGuardMs: 0,
    });
    const values = [
      ...quiet(20),
      ...bipolarBurst(75),
      ...quiet(90),
      ...bipolarBurst(75),
      ...quiet(60),
    ];
    const pulses = feed(detector, values).filter((event) => event.type === 'pulse');

    expect(pulses).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  assessTestBurstActivity,
  buildTemporalBurstModel,
  extractTemporalBurstFeatures,
  recognizeTemporalBurst,
} from '../client/src/lib/temporal-burst-recognition';
import { processWaveformUnified } from '../client/src/lib/unified-waveform-pipeline';
import { isProcessingAcceptable, processTestWaveform } from '../client/src/lib/recognition-processing';
import { evaluateAllCollectionsImproved } from '../client/src/lib/quality-scoring-improved';

const makeBurstSignal = (burstCount: number, length = 512): number[] => {
  const signal = Array.from({ length }, () => 0);
  const centers = Array.from({ length: burstCount }, (_, index) =>
    Math.round(((index + 1) * length) / (burstCount + 1))
  );
  for (const center of centers) {
    for (let offset = -24; offset <= 24; offset++) {
      const index = center + offset;
      if (index >= 0 && index < signal.length) {
        signal[index] += Math.exp(-(offset * offset) / 180) * Math.sin(offset * 0.9) * 900;
      }
    }
  }
  return signal;
};

describe('temporal burst recognition reliability', () => {
  it('does not score an action-looking normalized waveform without pre-scale activity evidence', () => {
    expect(assessTestBurstActivity(makeBurstSignal(1))).toMatchObject({
      usable: false,
      reason: '缺少可靠的静息基线对比',
    });
  });

  it('rejects a flat capture with no EMG burst', () => {
    expect(assessTestBurstActivity(Array.from({ length: 512 }, () => 0))).toMatchObject({
      usable: false,
      reason: '未检测到有效肌电动作',
    });
  });

  it('rejects a rest-only capture even when the waveform pipeline reports acceptable quality', () => {
    const baselineCh2 = Array.from({ length: 500 }, (_, index) =>
      1.2 * Math.sin(2 * Math.PI * 34 * index / 500)
    );
    const restCh2 = Array.from({ length: 1500 }, (_, index) =>
      1.2 * Math.sin(2 * Math.PI * 34 * index / 500)
    );
    const processed = processTestWaveform(
      restCh2.map((value) => value * 0.45),
      restCh2,
      restCh2.map((value) => value * 0.18),
      {
        ch1: baselineCh2.map((value) => value * 0.45),
        ch2: baselineCh2,
        ch3: baselineCh2.map((value) => value * 0.18),
      }
    );

    expect(isProcessingAcceptable(processed)).toBe(true);
    expect(processed.meta.activityEvidence).toMatchObject({ reliable: true, usable: false });
    expect(assessTestBurstActivity(processed.ch2, processed.meta.activityEvidence)).toMatchObject({
      usable: false,
      reason: '原始肌电强度与静息基线无明显差异',
    });
  });

  it('rejects resting oscillations across frequencies and phases', () => {
    for (const frequency of [20, 34, 80, 90]) {
      for (const phase of [0, 1.2, 2.4]) {
        const rest = Array.from({ length: 1500 }, (_, index) =>
          1.2 * Math.sin(2 * Math.PI * frequency * index / 500 + phase)
        );
        const baseline = rest.slice(0, 500);
        const processed = processTestWaveform(
          rest.map((value) => value * 0.45),
          rest,
          rest.map((value) => value * 0.18),
          {
            ch1: baseline.map((value) => value * 0.45),
            ch2: baseline,
            ch3: baseline.map((value) => value * 0.18),
          }
        );
        expect(
          assessTestBurstActivity(processed.ch2, processed.meta.activityEvidence).usable,
          `rest at ${frequency}Hz, phase ${phase}`
        ).toBe(false);
      }
    }
  });

  it('rejects steady broadband resting noise against its baseline', () => {
    const makeNoise = (seed: number, length: number): number[] => {
      let state = seed;
      return Array.from({ length }, () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return 2.4 * (state / 0xffffffff - 0.5);
      });
    };
    for (const seed of [1, 2, 3, 4]) {
      const baselineCh2 = makeNoise(seed, 500);
      const restCh2 = makeNoise(seed + 200, 1500);
      const processed = processTestWaveform(
        restCh2.map((value) => value * 0.45),
        restCh2,
        restCh2.map((value) => value * 0.18),
        {
          ch1: baselineCh2.map((value) => value * 0.45),
          ch2: baselineCh2,
          ch3: baselineCh2.map((value) => value * 0.18),
        }
      );
      expect(processed.meta.activityEvidence?.usable, `noise seed ${seed}`).toBe(false);
      expect(assessTestBurstActivity(processed.ch2, processed.meta.activityEvidence).usable).toBe(false);
    }
  });

  it('does not treat one isolated electrical spike as sustained EMG activity', () => {
    const baselineCh2 = Array.from({ length: 500 }, (_, index) =>
      1.2 * Math.sin(2 * Math.PI * 34 * index / 500)
    );
    const restCh2 = Array.from({ length: 1500 }, (_, index) =>
      1.2 * Math.sin(2 * Math.PI * 34 * index / 500)
    );
    restCh2[750] += 1000;
    const processed = processTestWaveform(
      restCh2.map((value) => value * 0.45),
      restCh2,
      restCh2.map((value) => value * 0.18),
      {
        ch1: baselineCh2.map((value) => value * 0.45),
        ch2: baselineCh2,
        ch3: baselineCh2.map((value) => value * 0.18),
      }
    );
    expect(processed.meta.activityEvidence?.usable).toBe(false);
    expect(assessTestBurstActivity(processed.ch2, processed.meta.activityEvidence).usable).toBe(false);
  });

  it('accepts a clear contraction after the waveform pipeline', () => {
    const ch2 = Array.from({ length: 1500 }, (_, index) => {
      const seconds = index / 500;
      return 1.2 * Math.sin(2 * Math.PI * 34 * seconds) +
        (seconds >= 0.7 && seconds < 1.05
          ? 100 * Math.sin(2 * Math.PI * 80 * seconds)
          : 0);
    });
    const baselineCh2 = Array.from({ length: 500 }, (_, index) =>
      1.2 * Math.sin(2 * Math.PI * 34 * index / 500)
    );
    const processed = processWaveformUnified({
      ch1: ch2.map((value) => value * 0.45),
      ch2,
      ch3: ch2.map((value) => value * 0.18),
    }, { targetLength: 512, samplingRate: 500, restingBaseline: {
      ch1: baselineCh2.map((value) => value * 0.45),
      ch2: baselineCh2,
      ch3: baselineCh2.map((value) => value * 0.18),
    } });

    expect(assessTestBurstActivity(processed.processed.ch2, processed.metadata.activityEvidence)).toMatchObject({
      usable: true,
      reason: '动作清晰可评分',
    });
  });

  it('keeps short and long contractions usable across frequencies and phases', () => {
    const baselineCh2 = Array.from({ length: 500 }, (_, index) =>
      1.2 * Math.sin(2 * Math.PI * 34 * index / 500)
    );
    const baseline = {
      ch1: baselineCh2.map((value) => value * 0.45),
      ch2: baselineCh2,
      ch3: baselineCh2.map((value) => value * 0.18),
    };
    for (const duration of [0.15, 0.20, 0.50, 0.60]) {
      for (const frequency of [70, 80, 90]) {
        for (const phase of [0, 1.2]) {
          const ch2 = Array.from({ length: 1500 }, (_, index) => {
            const seconds = index / 500;
            const contraction = seconds >= 0.7 && seconds < 0.7 + duration
              ? 100 * Math.sin(2 * Math.PI * frequency * seconds + phase)
              : 0;
            return 1.2 * Math.sin(2 * Math.PI * 34 * seconds) + contraction;
          });
          const processed = processWaveformUnified({
            ch1: ch2.map((value) => value * 0.45),
            ch2,
            ch3: ch2.map((value) => value * 0.18),
          }, { targetLength: 512, samplingRate: 500, restingBaseline: baseline });
          const features = assessTestBurstActivity(processed.processed.ch2, processed.metadata.activityEvidence);
          const [trainingQuality] = evaluateAllCollectionsImproved([processed.processed]);
          expect(features.usable, `${duration}s at ${frequency}Hz, phase ${phase}`).toBe(true);
          expect(features.features.burstCount, `${duration}s at ${frequency}Hz, phase ${phase}`).toBe(1);
          expect(trainingQuality.activityClarity, `${duration}s at ${frequency}Hz, phase ${phase}`).toBeGreaterThanOrEqual(20);
        }
      }
    }
  });

  it('converts a normalized burst width back to physical seconds only with valid capture timing', () => {
    const signal = makeBurstSignal(1);
    const normalized = extractTemporalBurstFeatures(signal);
    const timed = extractTemporalBurstFeatures(signal, 0.7);

    expect(timed.meanBurstDurationSeconds).toBeCloseTo(normalized.meanBurstDurationRatio * 0.7);
    expect(normalized.meanBurstDurationSeconds).toBeUndefined();
    expect(extractTemporalBurstFeatures(signal, Number.NaN).meanBurstDurationSeconds).toBeUndefined();
  });

  it('keeps one sustained contraction as one burst after the capture pipeline', () => {
    const ch2 = Array.from({ length: 1500 }, (_, index) => {
      const seconds = index / 500;
      const restingNoise = 1.2 * Math.sin(2 * Math.PI * 34 * seconds);
      const contraction = seconds >= 0.7 && seconds < 1.05
        ? 100 * Math.sin(2 * Math.PI * 80 * seconds)
        : 0;
      return restingNoise + contraction;
    });
    const capture = {
      ch1: ch2.map((value) => value * 0.45),
      ch2,
      ch3: ch2.map((value) => value * 0.18),
    };
    const baseline = {
      ch1: Array.from({ length: 500 }, () => 0),
      ch2: Array.from({ length: 500 }, () => 0),
      ch3: Array.from({ length: 500 }, () => 0),
    };

    expect(extractTemporalBurstFeatures(capture.ch2).burstCount).toBe(1);
    const processed = processWaveformUnified(capture, {
      targetLength: 512,
      samplingRate: 500,
      restingBaseline: baseline,
    });
    expect(extractTemporalBurstFeatures(processed.processed.ch2).burstCount).toBe(1);
  });

  it('distinguishes short and long single bursts when physical capture durations are supplied', () => {
    const oneBurst = makeBurstSignal(1);
    const twoBursts = makeBurstSignal(2);
    const threeBursts = makeBurstSignal(3);
    const model = buildTemporalBurstModel([
      { name: 'short', signals: [oneBurst, oneBurst], captureDurationsSeconds: [0.7, 0.7] },
      { name: 'long', signals: [oneBurst, oneBurst], captureDurationsSeconds: [2.1, 2.1] },
      { name: 'double', signals: [twoBursts, twoBursts], captureDurationsSeconds: [1.2, 1.2] },
      { name: 'triple', signals: [threeBursts, threeBursts], captureDurationsSeconds: [1.4, 1.4] },
    ]);

    expect(model.applicable).toBe(true);
    expect(recognizeTemporalBurst(oneBurst, model, 0.7)?.command).toBe('short');
    expect(recognizeTemporalBurst(oneBurst, model, 2.1)?.command).toBe('long');
    expect(recognizeTemporalBurst(oneBurst, model)).toBeNull();
  });

  it('does not activate a partial model when any supplied command lacks repeated samples', () => {
    const model = buildTemporalBurstModel([
      { name: 'single', signals: [makeBurstSignal(1), makeBurstSignal(1)] },
      { name: 'double', signals: [makeBurstSignal(2), makeBurstSignal(2)] },
      { name: 'triple', signals: [makeBurstSignal(3)] },
    ]);

    expect(model.applicable).toBe(false);
    expect(model.reason).toContain('每个指令');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildTemporalBurstModel,
  extractTemporalBurstFeatures,
  recognizeTemporalBurst,
} from '../client/src/lib/temporal-burst-recognition';
import { highPassFilter } from '../client/src/lib/adaptive-waveform-filtering';
import { isProcessingAcceptable } from '../client/src/lib/recognition-processing';

const makeBurstSignal = (burstCount: number, length = 512): number[] => {
  const signal = Array.from({ length }, () => 0);
  const centers = Array.from({ length: burstCount }, (_, index) =>
    Math.round(((index + 1) * length) / (burstCount + 1))
  );

  for (const center of centers) {
    for (let offset = -24; offset <= 24; offset++) {
      const index = center + offset;
      if (index >= 0 && index < signal.length) {
        const envelope = Math.exp(-(offset * offset) / 180);
        signal[index] += envelope * Math.sin(offset * 0.9) * 900;
      }
    }
  }
  return signal;
};

describe('temporal burst recognition', () => {
  it.each([1, 2, 3])('extracts %i distinct muscle bursts', (burstCount) => {
    expect(extractTemporalBurstFeatures(makeBurstSignal(burstCount)).burstCount).toBe(burstCount);
  });

  it('ignores a filter settling transient at the beginning', () => {
    const signal = makeBurstSignal(2);
    for (let index = 0; index < 28; index++) {
      signal[index] += 1600 * Math.exp(-index / 8);
    }
    expect(extractTemporalBurstFeatures(signal).burstCount).toBe(2);
  });

  it('does not create a startup transient from a constant ADC offset', () => {
    const filtered = highPassFilter(Array.from({ length: 100 }, () => 2000));
    expect(Math.max(...filtered.map(Math.abs))).toBeLessThan(1e-9);
  });

  it('rejects a processing result when startup artifact cannot be separated', () => {
    expect(isProcessingAcceptable({
      ch1: makeBurstSignal(1),
      ch2: makeBurstSignal(1),
      ch3: makeBurstSignal(1),
      meta: {
        croppingMeta: {
          startIdx: 0,
          endIdx: 512,
          confidence: 0.8,
          method: 'unified-pipeline',
          stage: 'primary',
          reason: 'test',
        },
        normalizationMeta: {
          originalLength: 1500,
          targetLength: 512,
          timestamp: Date.now(),
        },
        startupArtifactMeta: {
          detected: true,
          ambiguous: true,
          suppressedSamples: 0,
          artifactRatio: 6,
          stabilizationIndex: null,
          reason: '未找到可确认的稳定间隔',
        },
        pipelineQualityScore: 45,
      },
    })).toBe(false);
  });

  it('builds a model only when command burst profiles are distinct', () => {
    const model = buildTemporalBurstModel([
      { name: 'A', signals: [makeBurstSignal(1), makeBurstSignal(1)] },
      { name: 'B', signals: [makeBurstSignal(2), makeBurstSignal(2)] },
      { name: 'C', signals: [makeBurstSignal(3), makeBurstSignal(3)] },
    ]);
    expect(model.applicable).toBe(true);
    expect(model.profiles.map((profile) => profile.expectedBurstCount)).toEqual([1, 2, 3]);
  });

  it('falls back when commands do not have distinct burst counts', () => {
    const model = buildTemporalBurstModel([
      { name: 'A', signals: [makeBurstSignal(1), makeBurstSignal(1)] },
      { name: 'B', signals: [makeBurstSignal(1), makeBurstSignal(1)] },
    ]);
    expect(model.applicable).toBe(false);
  });

  it.each([[1, 'A'], [2, 'B'], [3, 'C']] as const)(
    'recognizes %i bursts as command %s',
    (burstCount, expectedCommand) => {
      const model = buildTemporalBurstModel([
        { name: 'A', signals: [makeBurstSignal(1), makeBurstSignal(1)] },
        { name: 'B', signals: [makeBurstSignal(2), makeBurstSignal(2)] },
        { name: 'C', signals: [makeBurstSignal(3), makeBurstSignal(3)] },
      ]);
      const result = recognizeTemporalBurst(makeBurstSignal(burstCount), model);
      expect(result?.command).toBe(expectedCommand);
      expect(result?.margin).toBeGreaterThan(10);
    }
  );
});

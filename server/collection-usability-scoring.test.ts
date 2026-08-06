import { describe, expect, it } from 'vitest';
import { evaluateAllCollectionsImproved } from '../client/src/lib/quality-scoring-improved';

const makeBurstSignal = (burstCount: number, amplitude = 900, length = 512): number[] => {
  const signal = Array.from({ length }, (_, index) => Math.sin(index * 0.37) * 4);
  const centers = Array.from({ length: burstCount }, (_, index) =>
    Math.round(((index + 1) * length) / (burstCount + 1))
  );

  for (const center of centers) {
    for (let offset = -24; offset <= 24; offset++) {
      const index = center + offset;
      if (index >= 0 && index < signal.length) {
        const envelope = Math.exp(-(offset * offset) / 180);
        signal[index] += envelope * Math.sin(offset * 0.9) * amplitude;
      }
    }
  }
  return signal;
};

const waveform = (burstCount: number, amplitude = 900) => ({
  ch1: Array.from({ length: 512 }, () => 0),
  ch2: makeBurstSignal(burstCount, amplitude),
  ch3: Array.from({ length: 512 }, () => 0),
});

describe('collection usability scoring', () => {
  it('scores a sample with the wrong contraction rhythm below stable peers', () => {
    const scores = evaluateAllCollectionsImproved([
      waveform(2),
      waveform(2, 850),
      waveform(2, 950),
      waveform(1),
    ]);

    expect(scores[0].expectedBurstCount).toBe(2);
    expect(scores[0].detectedBurstCount).toBe(2);
    expect(scores[0].overallScore).toBeGreaterThanOrEqual(70);
    expect(scores[3].detectedBurstCount).toBe(1);
    expect(scores[3].overallScore).toBeLessThan(50);
    expect(scores[3].isOutlier).toBe(true);
  });

  it('does not describe a flat capture as usable even when it is internally stable', () => {
    const flat = {
      ch1: Array.from({ length: 512 }, () => 0),
      ch2: Array.from({ length: 512 }, () => 1200),
      ch3: Array.from({ length: 512 }, () => 0),
    };
    const scores = evaluateAllCollectionsImproved([flat, waveform(1), waveform(1)]);

    expect(scores[0].detectedBurstCount).toBe(0);
    expect(scores[0].activityClarity).toBeLessThan(20);
    expect(scores[0].overallScore).toBeLessThan(40);
    expect(scores[0].isOutlier).toBe(true);
  });

  it('marks a single sample as provisional instead of claiming excellent quality', () => {
    const [score] = evaluateAllCollectionsImproved([waveform(1)]);

    expect(score.provisional).toBe(true);
    expect(score.overallScore).toBeLessThanOrEqual(75);
    expect(score.recommendation).toContain('更多同指令样本');
  });

  it('rebuilds the expected rhythm from the remaining samples after deletion', () => {
    const before = evaluateAllCollectionsImproved([
      waveform(1),
      waveform(1),
      waveform(2),
      waveform(2),
      waveform(2),
    ]);
    const after = evaluateAllCollectionsImproved([
      waveform(1),
      waveform(1),
    ]);

    expect(before[0].expectedBurstCount).toBe(2);
    expect(after[0].expectedBurstCount).toBe(1);
    expect(after[0].rhythmConsistency).toBeGreaterThan(before[0].rhythmConsistency);
  });
});

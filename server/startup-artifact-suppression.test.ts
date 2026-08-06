import { describe, expect, it } from 'vitest';
import {
  suppressStartupArtifactMultiChannel,
} from '../client/src/lib/startup-artifact-suppression';
import { extractTemporalBurstFeatures } from '../client/src/lib/temporal-burst-recognition';

const makeBurstSignal = (
  burstCount: number,
  length = 1500,
  startAt = 420
): number[] => {
  const signal = Array.from({ length }, (_, index) => Math.sin(index * 0.31) * 3);
  const available = length - startAt - 120;
  const centers = Array.from({ length: burstCount }, (_, index) =>
    Math.round(startAt + ((index + 1) * available) / (burstCount + 1))
  );

  for (const center of centers) {
    for (let offset = -35; offset <= 35; offset++) {
      const sampleIndex = center + offset;
      if (sampleIndex >= 0 && sampleIndex < length) {
        const envelope = Math.exp(-(offset * offset) / 260);
        signal[sampleIndex] += envelope * Math.sin(offset * 0.82) * 900;
      }
    }
  }
  return signal;
};

const addStartupDecay = (signal: number[], duration = 180): number[] =>
  signal.map((value, index) => (
    index < duration ? value + 1800 * Math.exp(-index / 42) : value
  ));

describe('startup artifact suppression', () => {
  it('removes a long startup decay while preserving later muscle bursts', () => {
    const ch2 = addStartupDecay(makeBurstSignal(2));
    const result = suppressStartupArtifactMultiChannel(
      { ch1: ch2.map((value) => value * 0.2), ch2, ch3: ch2.map((value) => value * 0.1) },
      500
    );

    expect(result.metadata.detected).toBe(true);
    expect(result.metadata.ambiguous).toBe(false);
    expect(result.metadata.suppressedSamples).toBeGreaterThan(30);
    expect(Math.max(...result.cleaned.ch2.slice(0, result.metadata.suppressedSamples).map(Math.abs)))
      .toBeLessThan(1e-9);
    expect(extractTemporalBurstFeatures(result.cleaned.ch2).burstCount).toBe(2);
  });

  it('marks a startup transient as ambiguous when no quiet separation is found', () => {
    const ch2 = Array.from({ length: 1500 }, (_, index) => (
      1500 * Math.exp(-index / 170) + Math.sin(index * 0.8) * 140
    ));
    const result = suppressStartupArtifactMultiChannel(
      { ch1: ch2, ch2, ch3: ch2 },
      500
    );

    expect(result.metadata.detected).toBe(true);
    expect(result.metadata.ambiguous).toBe(true);
    expect(result.metadata.suppressedSamples).toBe(0);
  });

  it('leaves a clean delayed action unchanged', () => {
    const ch2 = makeBurstSignal(1);
    const result = suppressStartupArtifactMultiChannel(
      { ch1: ch2, ch2, ch3: ch2 },
      500
    );

    expect(result.metadata.detected).toBe(false);
    expect(result.metadata.suppressedSamples).toBe(0);
    expect(result.cleaned.ch2).toEqual(ch2);
  });

  it('does not erase a real high-frequency contraction that starts immediately', () => {
    const ch2 = Array.from({ length: 1500 }, (_, index) => Math.sin(index * 0.31) * 3);
    for (const center of [38, 520, 820]) {
      for (let offset = -35; offset <= 35; offset++) {
        const sampleIndex = center + offset;
        if (sampleIndex >= 0 && sampleIndex < ch2.length) {
          const envelope = Math.exp(-(offset * offset) / 260);
          ch2[sampleIndex] += envelope * Math.sin(offset * 0.82) * 900;
        }
      }
    }

    const result = suppressStartupArtifactMultiChannel(
      { ch1: ch2, ch2, ch3: ch2 },
      500
    );

    expect(result.metadata.suppressedSamples).toBe(0);
    expect(result.cleaned.ch2).toEqual(ch2);
    expect(extractTemporalBurstFeatures(result.cleaned.ch2).burstCount).toBeGreaterThanOrEqual(2);
  });

  it('does not erase a slower bipolar contraction that starts immediately', () => {
    const ch2 = Array.from({ length: 1500 }, (_, index) => Math.sin(index * 0.31) * 3);
    for (const center of [38, 520]) {
      for (let offset = -40; offset <= 40; offset++) {
        const sampleIndex = center + offset;
        if (sampleIndex >= 0 && sampleIndex < ch2.length) {
          const envelope = Math.exp(-(offset * offset) / 320);
          ch2[sampleIndex] += envelope * Math.sin(offset * 0.22) * 900;
        }
      }
    }

    const result = suppressStartupArtifactMultiChannel(
      { ch1: ch2, ch2, ch3: ch2 },
      500
    );

    expect(result.metadata.suppressedSamples).toBe(0);
    expect(result.cleaned.ch2).toEqual(ch2);
  });
});

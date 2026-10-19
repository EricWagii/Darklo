import { describe, expect, it } from 'vitest';
import { computeFFT } from '../client/src/lib/fft-analysis';

describe('baseline FFT diagnostics', () => {
  it.each([
    { sampleRate: 500, frequency: 34 },
    { sampleRate: 1_000, frequency: 80 },
  ])('labels a $frequency Hz signal sampled at $sampleRate Hz correctly', ({ sampleRate, frequency }) => {
    const signal = Array.from({ length: 2_048 }, (_, index) =>
      Math.sin(2 * Math.PI * frequency * index / sampleRate)
    );

    const spectrum = computeFFT(signal, sampleRate);

    expect(spectrum.dominantFrequency).toBeCloseTo(frequency, 0);
    expect(Number.isFinite(spectrum.snr)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  comprehensiveFiltering,
  highPassFilter,
  notchFilter,
} from '../client/src/lib/adaptive-waveform-filtering';
import { processWaveformUnified } from '../client/src/lib/unified-waveform-pipeline';
import { assessTrainingCollections } from '../client/src/lib/training-sample-usability';

const SAMPLE_RATE = 500;

const amplitudeAt = (signal: number[], frequency: number): number => {
  const start = 250;
  let sine = 0;
  let cosine = 0;
  for (let index = start; index < signal.length; index++) {
    const phase = 2 * Math.PI * frequency * index / SAMPLE_RATE;
    sine += signal[index] * Math.sin(phase);
    cosine += signal[index] * Math.cos(phase);
  }
  return 2 * Math.hypot(sine, cosine) / (signal.length - start);
};

const rms = (signal: number[]): number =>
  Math.sqrt(signal.reduce((sum, value) => sum + value * value, 0) / signal.length);

const filteredBeforeSpikeRemoval = (signal: number[]): number[] =>
  notchFilter(highPassFilter(signal, 20, SAMPLE_RATE), 50, SAMPLE_RATE, 35);

describe('comprehensiveFiltering EMG bandwidth reliability', () => {
  it.each([80, 90, 100, 120, 150])('retains the %i Hz contraction component', (frequency) => {
    const signal = Array.from({ length: 4000 }, (_, index) =>
      Math.sin(2 * Math.PI * frequency * index / SAMPLE_RATE)
    );
    const before = filteredBeforeSpikeRemoval(signal);
    const after = comprehensiveFiltering(signal, signal, signal, undefined, SAMPLE_RATE).ch2;

    expect(amplitudeAt(after, frequency) / amplitudeAt(before, frequency)).toBeGreaterThan(0.85);
  });

  it('preserves broadband contraction energy without isolated spikes', () => {
    const frequencies = [35, 45, 65, 75, 80, 85, 90, 95, 100, 105, 120, 135];
    const signal = Array.from({ length: 4000 }, (_, index) =>
      frequencies.reduce((sum, frequency, harmonic) =>
        sum + Math.sin(2 * Math.PI * frequency * index / SAMPLE_RATE + harmonic * 0.37), 0
      ) / Math.sqrt(frequencies.length)
    );
    const before = filteredBeforeSpikeRemoval(signal);
    const after = comprehensiveFiltering(signal, signal, signal, undefined, SAMPLE_RATE).ch2;

    expect(rms(after.slice(250)) / rms(before.slice(250))).toBeGreaterThan(0.85);
  });

  it('suppresses an isolated electrode spike in an otherwise valid signal', () => {
    const clean = Array.from({ length: 1200 }, (_, index) =>
      Math.sin(2 * Math.PI * 90 * index / SAMPLE_RATE)
    );
    const spiked = [...clean];
    const spikeIndex = 600;
    spiked[spikeIndex] += 30;

    const cleanResult = comprehensiveFiltering(clean, clean, clean, undefined, SAMPLE_RATE).ch2;
    const spikedResult = comprehensiveFiltering(spiked, spiked, spiked, undefined, SAMPLE_RATE).ch2;
    const uncorrected = filteredBeforeSpikeRemoval(spiked);
    const cleanUncorrected = filteredBeforeSpikeRemoval(clean);
    const remainingError = Math.abs(spikedResult[spikeIndex] - cleanResult[spikeIndex]);
    const initialError = Math.abs(uncorrected[spikeIndex] - cleanUncorrected[spikeIndex]);

    expect(remainingError).toBeLessThan(initialError * 0.4);
  });

  it.each([0, 1, 1198, 1199])('suppresses a boundary spike at sample %i', (spikeIndex) => {
    const clean = Array.from({ length: 1200 }, (_, index) =>
      Math.sin(2 * Math.PI * 90 * index / SAMPLE_RATE)
    );
    const spiked = [...clean];
    spiked[spikeIndex] += 1000;
    const reference = comprehensiveFiltering(clean, clean, clean, undefined, SAMPLE_RATE).ch2;
    const corrected = comprehensiveFiltering(spiked, spiked, spiked, undefined, SAMPLE_RATE).ch2;
    const uncorrected = filteredBeforeSpikeRemoval(spiked);
    const range = spikeIndex < 2 ? [0, 1, 2, 3] : [1196, 1197, 1198, 1199];
    const error = (candidate: number[]) => Math.max(...range.map((index) =>
      Math.abs(candidate[index] - reference[index])
    ));

    expect(error(corrected)).toBeLessThan(error(uncorrected) * 0.4);
  });

  it('preserves a real terminal 90 Hz action while excluding an added last-sample impulse', () => {
    const clean = Array.from({ length: 1500 }, (_, index) =>
      (index >= 400 && index < 600) || index >= 1250
        ? 15 * Math.sin(2 * Math.PI * 90 * index / SAMPLE_RATE)
        : 0
    );
    const spiked = [...clean];
    spiked[1499] += 1000;
    const cleanFiltered = comprehensiveFiltering(clean, clean, clean, undefined, SAMPLE_RATE).ch2;
    const spikedFiltered = comprehensiveFiltering(spiked, spiked, spiked, undefined, SAMPLE_RATE).ch2;
    const before = filteredBeforeSpikeRemoval(clean);

    expect(rms(cleanFiltered.slice(1250)) / rms(before.slice(1250))).toBeGreaterThan(0.85);
    expect(Math.abs(spikedFiltered[1499] - cleanFiltered[1499])).toBeLessThan(100);

    const baseline = Array.from({ length: 1500 }, () => 0);
    const pipeline = (signal: number[]) => processWaveformUnified(
      { ch1: signal, ch2: signal, ch3: signal },
      {
        targetLength: 512,
        samplingRate: SAMPLE_RATE,
        restingBaseline: { ch1: baseline, ch2: baseline, ch3: baseline },
      }
    );
    const cleanProcessed = pipeline(clean);
    const spikedProcessed = pipeline(spiked);
    const sample = {
      waveform: spikedProcessed.processed,
      preprocessingMeta: { pipelineVersion: 'resting-baseline-v3', requiresRestingBaseline: true },
      pipelineMetadata: spikedProcessed.metadata,
    };

    expect(spikedProcessed.metadata.finalLength).toBe(512);
    expect(assessTrainingCollections([sample]).usableCollections).toHaveLength(1);
    expect(Math.max(...spikedProcessed.processed.ch2)).toBeLessThan(
      Math.max(...cleanProcessed.processed.ch2) * 3
    );
  });

  it('keeps the unified training and recognition preprocessing output usable', () => {
    const signal = Array.from({ length: 1500 }, (_, index) => {
      const active = index >= 400 && index < 950;
      return active ? 15 * Math.sin(2 * Math.PI * 90 * index / SAMPLE_RATE) : 0;
    });
    const baseline = Array.from({ length: 1500 }, () => 0);
    const result = processWaveformUnified(
      { ch1: signal, ch2: signal, ch3: signal },
      {
        targetLength: 512,
        samplingRate: SAMPLE_RATE,
        restingBaseline: { ch1: baseline, ch2: baseline, ch3: baseline },
      }
    );

    expect(result.metadata.finalLength).toBe(512);
    expect(result.metadata.qualityScore).toBeGreaterThan(0);
    for (const channel of [result.processed.ch1, result.processed.ch2, result.processed.ch3]) {
      expect(channel).toHaveLength(512);
      expect(channel.every(Number.isFinite)).toBe(true);
    }
  });
});

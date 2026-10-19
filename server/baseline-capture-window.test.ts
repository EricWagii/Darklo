import { describe, expect, it } from 'vitest';
import { evaluateBaselineCapture } from '../client/src/lib/baseline-capture-window';

describe('baseline capture window', () => {
  it('uses elapsed wall-clock time for progress instead of the received frame count', () => {
    const snapshot = evaluateBaselineCapture({
      startedAt: 1_000,
      now: 2_500,
      durationMs: 3_000,
      sampleCount: 0,
      minimumSamples: 250,
    });

    expect(snapshot.status).toBe('collecting');
    expect(snapshot.progress).toBe(50);
    expect(snapshot.sampleCount).toBe(0);
  });

  it('reports no-data when the capture window ends without a parsed frame', () => {
    const snapshot = evaluateBaselineCapture({
      startedAt: 1_000,
      now: 4_000,
      durationMs: 3_000,
      sampleCount: 0,
      minimumSamples: 250,
    });

    expect(snapshot.status).toBe('no-data');
    expect(snapshot.progress).toBe(100);
    expect(snapshot.measuredSampleRate).toBe(0);
  });

  it('distinguishes an insufficient low-rate capture from a missing stream', () => {
    const snapshot = evaluateBaselineCapture({
      startedAt: 1_000,
      now: 4_000,
      durationMs: 3_000,
      sampleCount: 120,
      minimumSamples: 250,
    });

    expect(snapshot.status).toBe('insufficient');
    expect(snapshot.measuredSampleRate).toBe(40);
  });

  it('completes after the duration when enough samples were received', () => {
    const snapshot = evaluateBaselineCapture({
      startedAt: 1_000,
      now: 4_200,
      durationMs: 3_000,
      sampleCount: 1_440,
      minimumSamples: 250,
    });

    expect(snapshot.status).toBe('complete');
    expect(snapshot.progress).toBe(100);
    expect(snapshot.measuredSampleRate).toBe(450);
  });

  it('rejects a long capture whose frame count meets the count floor but frame rate is too low', () => {
    const snapshot = evaluateBaselineCapture({
      startedAt: 1_000,
      now: 7_000,
      durationMs: 5_000,
      sampleCount: 2_100,
      minimumSamples: 2_000,
      minimumSampleRate: 400,
    });

    expect(snapshot.measuredSampleRate).toBe(350);
    expect(snapshot.status).toBe('insufficient');
  });

  it('rejects a capture running faster than the configured sampling range', () => {
    const snapshot = evaluateBaselineCapture({
      startedAt: 1_000,
      now: 6_000,
      durationMs: 5_000,
      sampleCount: 3_500,
      minimumSamples: 2_000,
      minimumSampleRate: 400,
      maximumSampleRate: 600,
    });

    expect(snapshot.measuredSampleRate).toBe(700);
    expect(snapshot.status).toBe('insufficient');
  });

  it('accepts the 1000 Hz band but rejects the 700 Hz gap at the same five-second duration', () => {
    const capture = (sampleCount: number) => evaluateBaselineCapture({
      startedAt: 1_000,
      now: 6_000,
      durationMs: 5_000,
      sampleCount,
      minimumSamples: 2_000,
      acceptedSampleRateRanges: [{ min: 400, max: 600 }, { min: 800, max: 1200 }],
    });

    expect(capture(5_000).status).toBe('complete');
    expect(capture(3_500).status).toBe('insufficient');
    expect(capture(6_500).status).toBe('insufficient');
  });
});

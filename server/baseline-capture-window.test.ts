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
});

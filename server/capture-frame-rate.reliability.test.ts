import { describe, expect, it } from 'vitest';
import {
  assessCaptureBaselineCompatibility,
  assessCaptureFrameRate,
  isSupportedCaptureSampleRate,
} from '../client/src/lib/capture-frame-rate';

describe('complete EMG capture frame-rate acceptance', () => {
  it('accepts a one-second capture at the expected 500 Hz', () => {
    expect(assessCaptureFrameRate(500, 1_000)).toMatchObject({
      acceptable: true,
      measuredHz: 500,
      nominalHz: 500,
      reason: 'acceptable',
    });
  });

  it.each([400, 600, 800, 1_200])('accepts the inclusive %i Hz tolerance boundary', (sampleCount) => {
    expect(assessCaptureFrameRate(sampleCount, 1_000)).toMatchObject({
      acceptable: true,
      nominalHz: sampleCount <= 600 ? 500 : 1_000,
    });
  });

  it('accepts a 1000 Hz acquisition and returns its measured rate for filtering', () => {
    expect(assessCaptureFrameRate(2_090, 2_000)).toMatchObject({
      acceptable: true,
      nominalHz: 1_000,
      measuredHz: 1_045,
    });
  });

  it('uses actual elapsed time rather than assuming all captures last one second', () => {
    expect(assessCaptureFrameRate(1_200, 2_400)).toMatchObject({
      acceptable: true,
      measuredHz: 500,
    });
  });

  it('rejects a short capture even if its apparent frame rate is 500 Hz', () => {
    expect(assessCaptureFrameRate(250, 500)).toMatchObject({
      acceptable: false,
      reason: 'too-short',
    });
  });

  it('rejects a capture with too few received frames for its actual duration', () => {
    const result = assessCaptureFrameRate(300, 1_000);
    expect(result).toMatchObject({ acceptable: false, reason: 'low-rate', measuredHz: 300 });
    expect(result.message).toContain('300');
    expect(result.message).toContain('400–600');
  });

  it('rejects the unsupported gap between 500 and 1000 Hz bands', () => {
    expect(assessCaptureFrameRate(700, 1_000)).toMatchObject({
      acceptable: false,
      reason: 'unsupported-rate',
      measuredHz: 700,
    });
  });

  it('rejects a capture above the 1000 Hz tolerance band', () => {
    expect(assessCaptureFrameRate(1_300, 1_000)).toMatchObject({
      acceptable: false,
      reason: 'high-rate',
    });
  });

  it('rejects missing or invalid timing instead of silently assuming 500 Hz', () => {
    expect(assessCaptureFrameRate(500, Number.NaN)).toMatchObject({
      acceptable: false,
      reason: 'invalid',
    });
    expect(assessCaptureFrameRate(-1, 1_000).acceptable).toBe(false);
  });

  it('accepts a same-band baseline within 20% of the current measured rate', () => {
    expect(assessCaptureBaselineCompatibility(550, 500)).toMatchObject({ compatible: true });
    expect(assessCaptureBaselineCompatibility(1_100, 1_000)).toMatchObject({ compatible: true });
  });

  it('rejects a different baseline sampling band and requests baseline recapture', () => {
    const result = assessCaptureBaselineCompatibility(1_000, 500);
    expect(result.compatible).toBe(false);
    expect(result.message).toContain('重录静息基线');
  });

  it('rejects more than 20% baseline-to-capture rate drift even within one band', () => {
    const result = assessCaptureBaselineCompatibility(600, 400);
    expect(result.compatible).toBe(false);
    expect(result.message).toContain('重录静息基线');
  });

  it('rejects absent or unsupported baseline rate instead of guessing its sampling band', () => {
    expect(assessCaptureBaselineCompatibility(500, undefined).compatible).toBe(false);
    expect(assessCaptureBaselineCompatibility(500, 700).compatible).toBe(false);
  });

  it('shares the exact two-band sampling-rate rule with persisted training metadata', () => {
    expect([400, 500, 600, 800, 1_000, 1_200].every(isSupportedCaptureSampleRate)).toBe(true);
    expect([0, 399, 700, 1_201, Number.NaN].some(isSupportedCaptureSampleRate)).toBe(false);
  });
});

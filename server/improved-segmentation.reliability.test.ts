import { describe, expect, it } from 'vitest';
import {
  alignMultipleCollectionsImproved,
  detectValidSegmentImproved,
} from '../client/src/lib/improved-segmentation';

const makeNormalizedBurst = (start: number, end: number) =>
  Array.from({ length: 512 }, (_, index) =>
    index >= start && index < end ? Math.sin(index * 1.7) : 0
  );

describe('segmentation of preprocessed 512-point templates', () => {
  it('returns raw sample indices instead of multiplying sliding-window positions', () => {
    const segment = detectValidSegmentImproved(makeNormalizedBurst(180, 300));
    expect(segment.activeRegions.length).toBeGreaterThan(0);
    expect(segment.startIdx).toBeGreaterThanOrEqual(150);
    expect(segment.startIdx).toBeLessThan(220);
    expect(segment.endIdx).toBeGreaterThan(270);
    expect(segment.endIdx).toBeLessThanOrEqual(330);
    expect(segment.startIdx).toBeLessThan(segment.endIdx);
  });

  it('can align a batch of normalized templates within their 512-point domain', () => {
    const waveforms = [
      makeNormalizedBurst(175, 290),
      makeNormalizedBurst(185, 300),
      makeNormalizedBurst(195, 310),
    ].map((ch2) => ({ ch1: ch2, ch2, ch3: ch2 }));

    const alignment = alignMultipleCollectionsImproved(waveforms);
    expect(alignment.startIdx).toBeGreaterThanOrEqual(150);
    expect(alignment.startIdx).toBeLessThan(220);
    expect(alignment.endIdx).toBeGreaterThan(270);
    expect(alignment.endIdx).toBeLessThanOrEqual(340);
    expect(alignment.startIdx).toBeLessThan(alignment.endIdx);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPauseTimingModel,
  scorePauseGap,
} from '../client/src/lib/continuous-pause-calibration';

describe('continuous Morse pause calibration', () => {
  it('builds robust separated timing distributions despite an outlier', () => {
    const result = buildPauseTimingModel({
      withinCharacterGapsMs: [460, 480, 500, 520, 540, 8_000],
      betweenCharacterGapsMs: [1_420, 1_500, 1_560, 1_620],
      fallbackBoundaryMs: 1_200,
    });

    expect(result.model.source).toBe('calibrated');
    expect(result.model.withinCharacter.centerMs).toBeGreaterThan(470);
    expect(result.model.withinCharacter.centerMs).toBeLessThan(550);
    expect(result.model.betweenCharacter.centerMs).toBeGreaterThan(1_450);
    expect(result.model.separationConfidence).toBeGreaterThan(0.7);
    expect(result.warning).toBeNull();
  });

  it('reports overlap instead of pretending the boundary is reliable', () => {
    const result = buildPauseTimingModel({
      withinCharacterGapsMs: [700, 820, 940, 1_020, 1_080],
      betweenCharacterGapsMs: [900, 1_000, 1_100, 1_180],
      fallbackBoundaryMs: 1_200,
    });

    expect(result.model.source).toBe('calibrated');
    expect(result.model.separationConfidence).toBeLessThan(0.5);
    expect(result.warning).toContain('重叠');
  });

  it('uses a clearly marked fallback when there are too few examples', () => {
    const result = buildPauseTimingModel({
      withinCharacterGapsMs: [500],
      betweenCharacterGapsMs: [1_500],
      fallbackBoundaryMs: 1_200,
    });

    expect(result.model.source).toBe('fallback');
    expect(result.model.boundaryMs).toBe(1_200);
    expect(result.model.separationConfidence).toBe(0);
    expect(result.warning).toContain('样本不足');
  });

  it('scores a short rest as continuation and a long rest as a boundary', () => {
    const { model } = buildPauseTimingModel({
      withinCharacterGapsMs: [420, 460, 500, 520, 540, 560],
      betweenCharacterGapsMs: [1_450, 1_500, 1_550, 1_600],
      fallbackBoundaryMs: 1_200,
    });

    const short = scorePauseGap(model, 500);
    const long = scorePauseGap(model, 1_520);

    expect(short.continuationScore).toBeGreaterThan(short.boundaryScore);
    expect(long.boundaryScore).toBeGreaterThan(long.continuationScore);
  });
});

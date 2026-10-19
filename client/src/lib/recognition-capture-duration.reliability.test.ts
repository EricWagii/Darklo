import { describe, expect, it } from 'vitest';
import {
  getTestCaptureDurationSeconds,
  getTrainingCaptureDurationSeconds,
} from './recognition-capture-duration';

describe('recognition capture duration', () => {
  it('uses the original cropped sample count, not the normalized 512-point length', () => {
    expect(getTrainingCaptureDurationSeconds({
      pipelineMetadata: { croppedLength: 265, samplingRate: 500 },
    })).toBeCloseTo(0.53);
    expect(getTrainingCaptureDurationSeconds({
      pipelineMetadata: { croppedLength: 530, samplingRate: 1_000 },
    })).toBeCloseTo(0.53);
  });

  it('uses the test crop inclusive boundaries and recorded rate before normalization', () => {
    expect(getTestCaptureDurationSeconds({
      meta: { samplingRate: 500, croppingMeta: { startIdx: 100, endIdx: 364 } },
    })).toBeCloseTo(0.53);
    expect(getTestCaptureDurationSeconds({
      meta: { samplingRate: 1_000, croppingMeta: { startIdx: 100, endIdx: 629 } },
    })).toBeCloseTo(0.53);
  });

  it('withholds timing when source sample rate or crop metadata is missing or invalid', () => {
    expect(getTrainingCaptureDurationSeconds({ pipelineMetadata: {} })).toBeUndefined();
    expect(getTrainingCaptureDurationSeconds({ pipelineMetadata: { croppedLength: -4 } })).toBeUndefined();
    expect(getTrainingCaptureDurationSeconds({ pipelineMetadata: { croppedLength: 265 } })).toBeUndefined();
    expect(getTrainingCaptureDurationSeconds({ pipelineMetadata: { croppedLength: 265, samplingRate: 0 } })).toBeUndefined();
    expect(getTrainingCaptureDurationSeconds({
      pipelineMetadata: { croppedLength: 265, samplingRate: 500, durationReliable: false },
    })).toBeUndefined();
    expect(getTestCaptureDurationSeconds({
      meta: { samplingRate: 500, croppingMeta: { startIdx: 300, endIdx: 100 } },
    })).toBeUndefined();
    expect(getTestCaptureDurationSeconds({
      meta: { croppingMeta: { startIdx: 100, endIdx: 364 } },
    })).toBeUndefined();
  });
});

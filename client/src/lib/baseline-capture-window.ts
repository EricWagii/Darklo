export type BaselineCaptureStatus =
  | 'collecting'
  | 'complete'
  | 'no-data'
  | 'insufficient';

interface BaselineCaptureInput {
  startedAt: number;
  now: number;
  durationMs: number;
  sampleCount: number;
  minimumSamples: number;
  minimumSampleRate?: number;
  maximumSampleRate?: number;
  acceptedSampleRateRanges?: readonly { min: number; max: number }[];
}

export interface BaselineCaptureSnapshot {
  elapsedMs: number;
  progress: number;
  sampleCount: number;
  measuredSampleRate: number;
  status: BaselineCaptureStatus;
}

export function evaluateBaselineCapture({
  startedAt,
  now,
  durationMs,
  sampleCount,
  minimumSamples,
  minimumSampleRate,
  maximumSampleRate,
  acceptedSampleRateRanges,
}: BaselineCaptureInput): BaselineCaptureSnapshot {
  const safeDurationMs = Math.max(1, durationMs);
  const elapsedMs = Math.max(0, now - startedAt);
  const progress = Math.min(100, (elapsedMs / safeDurationMs) * 100);
  const measuredSampleRate = elapsedMs > 0
    ? sampleCount / (elapsedMs / 1_000)
    : 0;

  let status: BaselineCaptureStatus = 'collecting';
  if (elapsedMs >= safeDurationMs) {
    status = sampleCount === 0
      ? 'no-data'
      : sampleCount < minimumSamples ||
          (minimumSampleRate !== undefined && measuredSampleRate < minimumSampleRate) ||
          (maximumSampleRate !== undefined && measuredSampleRate > maximumSampleRate) ||
          (acceptedSampleRateRanges !== undefined &&
            !acceptedSampleRateRanges.some(({ min, max }) =>
              measuredSampleRate >= min && measuredSampleRate <= max))
        ? 'insufficient'
        : 'complete';
  }

  return {
    elapsedMs,
    progress,
    sampleCount,
    measuredSampleRate,
    status,
  };
}

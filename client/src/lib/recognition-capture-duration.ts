const durationFromSampleCount = (
  sampleCount: number | undefined,
  samplingRate: number | undefined,
): number | undefined => {
  if (!Number.isInteger(sampleCount) || (sampleCount ?? 0) <= 0) return undefined;
  if (!Number.isFinite(samplingRate) || (samplingRate ?? 0) <= 0) return undefined;
  return sampleCount! / samplingRate!;
};

export function getTrainingCaptureDurationSeconds(collection: {
  pipelineMetadata?: { croppedLength?: number; samplingRate?: number; durationReliable?: boolean };
}): number | undefined {
  if (collection.pipelineMetadata?.durationReliable === false) return undefined;
  return durationFromSampleCount(
    collection.pipelineMetadata?.croppedLength,
    collection.pipelineMetadata?.samplingRate,
  );
}

export function getTestCaptureDurationSeconds(processed: {
  meta?: { samplingRate?: number; croppingMeta?: { startIdx?: number; endIdx?: number } };
}): number | undefined {
  const crop = processed.meta?.croppingMeta;
  if (!Number.isInteger(crop?.startIdx) || !Number.isInteger(crop?.endIdx)) return undefined;
  return durationFromSampleCount(
    crop!.endIdx! - crop!.startIdx! + 1,
    processed.meta?.samplingRate,
  );
}

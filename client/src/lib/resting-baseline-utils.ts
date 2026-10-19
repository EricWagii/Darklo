import { HARDWARE_CONFIG } from '@shared/hardware-config';

export const RESTING_BASELINE_CAPTURE_DURATION_MS = 5_000;
export const MIN_RESTING_BASELINE_SAMPLE_RATE = HARDWARE_CONFIG.SAMPLE_RATE * 0.8;
export const MAX_RESTING_BASELINE_SAMPLE_RATE = HARDWARE_CONFIG.SAMPLE_RATE * 1.2;
export const MIN_RESTING_BASELINE_SAMPLES = Math.ceil(
  MIN_RESTING_BASELINE_SAMPLE_RATE * RESTING_BASELINE_CAPTURE_DURATION_MS / 1_000
);
export const MAX_RESTING_BASELINE_SAMPLES = Math.floor(
  MAX_RESTING_BASELINE_SAMPLE_RATE * RESTING_BASELINE_CAPTURE_DURATION_MS / 1_000
);
export const SUPPORTED_RESTING_BASELINE_SAMPLE_RATE_RANGES = [
  { min: HARDWARE_CONFIG.SAMPLE_RATE * 0.8, max: HARDWARE_CONFIG.SAMPLE_RATE * 1.2 },
  { min: HARDWARE_CONFIG.SAMPLE_RATE * 2 * 0.8, max: HARDWARE_CONFIG.SAMPLE_RATE * 2 * 1.2 },
] as const;

export interface RestingBaselineWaveform {
  ch1: number[];
  ch2: number[];
  ch3: number[];
}

export interface RestingBaselineStats {
  ch1Mean: number;
  ch1Std: number;
  ch2Mean: number;
  ch2Std: number;
  ch3Mean: number;
  ch3Std: number;
  capturedAt?: string;
  samplesCollected?: number;
}

export interface RestingBaselineRecord extends Partial<RestingBaselineStats> {
  captureDurationMs?: number;
  measuredSampleRate?: number;
  restingBaseline?: RestingBaselineWaveform;
  baseline?: {
    ch1?: number;
    ch2?: number;
    ch3?: number;
    timestamp?: number;
    quality?: number;
  };
  std?: {
    ch1?: number;
    ch2?: number;
    ch3?: number;
  };
}

export const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const stdDev = (values: number[]): number => {
  if (values.length === 0) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
};

export const calculateRestingStats = (waveform: RestingBaselineWaveform): RestingBaselineStats => {
  return {
    ch1Mean: mean(waveform.ch1),
    ch1Std: stdDev(waveform.ch1),
    ch2Mean: mean(waveform.ch2),
    ch2Std: stdDev(waveform.ch2),
    ch3Mean: mean(waveform.ch3),
    ch3Std: stdDev(waveform.ch3),
    samplesCollected: waveform.ch1.length,
    capturedAt: new Date().toISOString(),
  };
};

export const getRestingBaselineSampleRate = (record: RestingBaselineRecord | null | undefined): number | undefined => {
  if (!record?.restingBaseline) return undefined;
  const { ch1, ch2, ch3 } = record.restingBaseline;
  if (!Array.isArray(ch1) || !Array.isArray(ch2) || !Array.isArray(ch3)) return undefined;
  if (
    ch1.length < MIN_RESTING_BASELINE_SAMPLES ||
    ch2.length !== ch1.length || ch3.length !== ch1.length ||
    !ch1.every(Number.isFinite) || !ch2.every(Number.isFinite) || !ch3.every(Number.isFinite)
  ) return undefined;
  const captureDurationMs = record.captureDurationMs;
  if (
    !Number.isFinite(captureDurationMs) ||
    (captureDurationMs ?? 0) < RESTING_BASELINE_CAPTURE_DURATION_MS ||
    !Number.isFinite(record.measuredSampleRate)
  ) return undefined;
  const measuredSampleRate = ch1.length / (captureDurationMs! / 1_000);
  if (
    Math.abs(measuredSampleRate - record.measuredSampleRate!) > Math.max(1, measuredSampleRate * 0.01) ||
    !SUPPORTED_RESTING_BASELINE_SAMPLE_RATE_RANGES.some(({ min, max }) =>
      measuredSampleRate >= min && measuredSampleRate <= max)
  ) return undefined;
  return measuredSampleRate;
};

export const getRestingBaselineWaveform = (record: RestingBaselineRecord | null | undefined): RestingBaselineWaveform | undefined => {
  if (getRestingBaselineSampleRate(record) === undefined) return undefined;
  const { ch1, ch2, ch3 } = record!.restingBaseline!;
  return { ch1, ch2, ch3 };
};

export const getRestingBaselineStats = (record: RestingBaselineRecord | null | undefined): RestingBaselineStats | undefined => {
  if (!record) return undefined;

  if (
    typeof record.ch1Mean === 'number' &&
    typeof record.ch1Std === 'number' &&
    typeof record.ch2Mean === 'number' &&
    typeof record.ch2Std === 'number' &&
    typeof record.ch3Mean === 'number' &&
    typeof record.ch3Std === 'number'
  ) {
    return {
      ch1Mean: record.ch1Mean,
      ch1Std: record.ch1Std,
      ch2Mean: record.ch2Mean,
      ch2Std: record.ch2Std,
      ch3Mean: record.ch3Mean,
      ch3Std: record.ch3Std,
      capturedAt: record.capturedAt,
      samplesCollected: record.samplesCollected,
    };
  }

  if (record.baseline && record.std) {
    return {
      ch1Mean: record.baseline.ch1 ?? 0,
      ch1Std: record.std.ch1 ?? 0,
      ch2Mean: record.baseline.ch2 ?? 0,
      ch2Std: record.std.ch2 ?? 0,
      ch3Mean: record.baseline.ch3 ?? 0,
      ch3Std: record.std.ch3 ?? 0,
      capturedAt: record.baseline.timestamp ? new Date(record.baseline.timestamp).toISOString() : undefined,
    };
  }

  const waveform = getRestingBaselineWaveform(record);
  return waveform ? calculateRestingStats(waveform) : undefined;
};

export const isLikelyMuscleActivity = (
  waveform: RestingBaselineWaveform,
  baselineStats: RestingBaselineStats,
  activityMultiplier = 4
): boolean => {
  const currentStd = {
    ch1: stdDev(waveform.ch1),
    ch2: stdDev(waveform.ch2),
    ch3: stdDev(waveform.ch3),
  };

  return currentStd.ch1 > Math.max(baselineStats.ch1Std * activityMultiplier, 1) ||
    currentStd.ch2 > Math.max(baselineStats.ch2Std * activityMultiplier, 1) ||
    currentStd.ch3 > Math.max(baselineStats.ch3Std * activityMultiplier, 1);
};

export const detectRestingNoiseDrift = (
  waveform: RestingBaselineWaveform,
  baselineStats: RestingBaselineStats
): { abnormal: boolean; reasons: string[] } => {
  const currentStats = calculateRestingStats(waveform);
  const reasons: string[] = [];

  const checks = [
    { channel: 'ch1', mean: currentStats.ch1Mean, std: currentStats.ch1Std, baselineMean: baselineStats.ch1Mean, baselineStd: baselineStats.ch1Std },
    { channel: 'ch2', mean: currentStats.ch2Mean, std: currentStats.ch2Std, baselineMean: baselineStats.ch2Mean, baselineStd: baselineStats.ch2Std },
    { channel: 'ch3', mean: currentStats.ch3Mean, std: currentStats.ch3Std, baselineMean: baselineStats.ch3Mean, baselineStd: baselineStats.ch3Std },
  ];

  for (const check of checks) {
    const safeStd = Math.max(check.baselineStd, 1);
    if (Math.abs(check.mean - check.baselineMean) > safeStd * 3) {
      reasons.push(`${check.channel} 均值漂移`);
    }
    if (check.std > safeStd * 2.5) {
      reasons.push(`${check.channel} 底噪升高`);
    }
  }

  return { abnormal: reasons.length > 0, reasons };
};

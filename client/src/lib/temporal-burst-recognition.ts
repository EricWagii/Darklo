import { highPassFilter, notchFilter } from './adaptive-waveform-filtering';

export interface TemporalBurstFeatures {
  burstCount: number;
  activeRatio: number;
  meanBurstDurationRatio: number;
  meanGapRatio: number;
  threshold: number;
  baselineLevel: number;
  activeLevel: number;
  activityContrast: number;
  startupArtifactRatio: number;
  /** Physical timing is present only when the caller supplies the pre-resampling capture duration. */
  meanBurstDurationSeconds?: number;
  meanGapSeconds?: number;
}

export interface TemporalBurstProfile extends TemporalBurstFeatures {
  command: string;
  expectedBurstCount: number;
  consistency: number;
  sampleCount: number;
  minBurstDurationSeconds?: number;
  maxBurstDurationSeconds?: number;
}

export interface TemporalBurstModel {
  applicable: boolean;
  profiles: TemporalBurstProfile[];
  reason: string;
}

export interface TemporalBurstRecognition {
  command: string;
  score: number;
  margin: number;
  features: TemporalBurstFeatures;
  scores: Array<{
    command: string;
    score: number;
    expectedBurstCount: number;
  }>;
}

export interface TestBurstActivityAssessment {
  usable: boolean;
  reason: '未检测到有效肌电动作' | '缺少可靠的静息基线对比' |
    '原始肌电强度与静息基线无明显差异' | '动作与静息分离度不足' | '动作清晰可评分';
  features: TemporalBurstFeatures;
}

export interface ActivityEvidence {
  reliable: boolean;
  usable: boolean;
  sustainedRmsRatio: number | null;
  thresholdRatio: number;
  baselineRms: number | null;
  reason: '缺少可靠的静息基线对比' | '原始肌电强度与静息基线无明显差异' |
    '原始肌电动作强于静息基线';
}

interface Segment {
  start: number;
  end: number;
}

const isValidCaptureDuration = (seconds: number | undefined): seconds is number =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
const MIN_ACTIVITY_CONTRAST = 0.20;
const MIN_SUSTAINED_RMS_RATIO = 2.5;

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

const movingMeanAbsolute = (signal: number[], windowSize: number): number[] => {
  const result = Array.from({ length: signal.length }, () => 0);
  let runningSum = 0;
  for (let index = 0; index < signal.length; index++) {
    runningSum += Math.abs(signal[index]);
    if (index >= windowSize) {
      runningSum -= Math.abs(signal[index - windowSize]);
    }
    result[index] = runningSum / Math.min(index + 1, windowSize);
  }
  return result;
};

const localRms = (signal: number[], samplingRate: number): number[] => {
  const windowSize = Math.max(12, Math.round(samplingRate * 0.05));
  const step = Math.max(6, Math.round(samplingRate * 0.025));
  const settlingSamples = Math.round(samplingRate * 0.12);
  const values: number[] = [];
  for (let start = settlingSamples; start + windowSize <= signal.length; start += step) {
    let sumSquares = 0;
    for (let index = start; index < start + windowSize; index++) {
      sumSquares += signal[index] * signal[index];
    }
    values.push(Math.sqrt(sumSquares / windowSize));
  }
  return values;
};

const suppressSingleSampleSpikes = (signal: number[]): number[] => {
  const cleaned = [...signal];
  for (let index = 2; index < signal.length - 2; index++) {
    const neighbors = [
      signal[index - 2], signal[index - 1], signal[index + 1], signal[index + 2],
    ].sort((left, right) => left - right);
    const center = (neighbors[1] + neighbors[2]) / 2;
    const deviations = neighbors.map((value) => Math.abs(value - center))
      .sort((left, right) => left - right);
    const mad = (deviations[1] + deviations[2]) / 2;
    const outlier = Math.abs(signal[index] - center);
    if (
      outlier > 6 * 1.4826 * mad &&
      outlier > 4 * Math.max(...neighbors.map((value) => Math.abs(value)))
    ) {
      cleaned[index] = center;
    }
  }
  return cleaned;
};

/** Preserve activity strength before cropping and amplitude normalization erase it. */
export function calculateActivityEvidence(
  rawSignal: number[],
  restingBaseline: number[] | undefined,
  samplingRate: number
): ActivityEvidence {
  const unavailable = (): ActivityEvidence => ({
    reliable: false,
    usable: false,
    sustainedRmsRatio: null,
    thresholdRatio: MIN_SUSTAINED_RMS_RATIO,
    baselineRms: null,
    reason: '缺少可靠的静息基线对比',
  });
  if (
    !restingBaseline || !Number.isFinite(samplingRate) || samplingRate <= 0 ||
    rawSignal.length < samplingRate * 0.4 || restingBaseline.length < samplingRate * 0.4 ||
    !rawSignal.every(Number.isFinite) || !restingBaseline.every(Number.isFinite)
  ) {
    return unavailable();
  }

  const bandFiltered = (signal: number[]): number[] =>
    notchFilter(highPassFilter(suppressSingleSampleSpikes(signal), 20, samplingRate), 50, samplingRate, 35);
  const baselineWindows = localRms(bandFiltered(restingBaseline), samplingRate);
  const captureWindows = localRms(bandFiltered(rawSignal), samplingRate);
  if (baselineWindows.length < 3 || captureWindows.length < 3) return unavailable();

  const baselineRms = percentile(baselineWindows, 0.75);
  // Three adjacent overlapping windows must all rise above the baseline. A
  // single spike or a startup filter transient should not become a command.
  let sustainedRms = 0;
  for (let index = 0; index <= captureWindows.length - 3; index++) {
    sustainedRms = Math.max(
      sustainedRms,
      Math.min(captureWindows[index], captureWindows[index + 1], captureWindows[index + 2])
    );
  }
  const sustainedRmsRatio = sustainedRms / Math.max(baselineRms, 1e-6);
  const usable = sustainedRmsRatio >= MIN_SUSTAINED_RMS_RATIO;
  return {
    reliable: true,
    usable,
    sustainedRmsRatio,
    thresholdRatio: MIN_SUSTAINED_RMS_RATIO,
    baselineRms,
    reason: usable ? '原始肌电动作强于静息基线' : '原始肌电强度与静息基线无明显差异',
  };
}

const findSegments = (active: boolean[]): Segment[] => {
  const segments: Segment[] = [];
  let start = -1;
  for (let index = 0; index <= active.length; index++) {
    if (index < active.length && active[index] && start < 0) {
      start = index;
    } else if ((index === active.length || !active[index]) && start >= 0) {
      segments.push({ start, end: index - 1 });
      start = -1;
    }
  }
  return segments;
};

const mergeNearbySegments = (segments: Segment[], maxGap: number): Segment[] => {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous && segment.start - previous.end - 1 <= maxGap) {
      previous.end = segment.end;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
};

/**
 * Extracts contraction bursts from the main derived EMG signal (currently ch2).
 * The first 6% is excluded from thresholding and segmentation so filter settling
 * cannot become a synthetic contraction.
 */
export function extractTemporalBurstFeatures(
  signal: number[],
  captureDurationSeconds?: number
): TemporalBurstFeatures {
  if (signal.length < 32) {
    return {
      burstCount: 0,
      activeRatio: 0,
      meanBurstDurationRatio: 0,
      meanGapRatio: 0,
      threshold: 0,
      baselineLevel: 0,
      activeLevel: 0,
      activityContrast: 0,
      startupArtifactRatio: 0,
    };
  }

  const centered = signal.map((value) => value - median(signal));
  const envelope = movingMeanAbsolute(centered, Math.max(5, Math.round(signal.length / 64)));
  const settlingSamples = Math.max(12, Math.round(signal.length * 0.06));
  const analysisEnvelope = envelope.slice(settlingSamples);
  const activeLevel = percentile(analysisEnvelope, 0.90);
  const baselineP30 = percentile(analysisEnvelope, 0.30);
  const contrastP30 = (activeLevel - baselineP30) /
    Math.max(activeLevel + baselineP30, Number.EPSILON);
  // Keep P30 for ordinary captures. A sustained action may occupy >70% of the
  // cropped waveform, putting P30 inside the action; then the quiet P10 margin
  // separates it from rest without raising the threshold into carrier ripples.
  const baselineLevel = contrastP30 < MIN_ACTIVITY_CONTRAST
    ? percentile(analysisEnvelope, 0.10)
    : baselineP30;
  const threshold = baselineLevel + (activeLevel - baselineLevel) * 0.35;
  const scale = Math.max(activeLevel + baselineLevel, Number.EPSILON);
  const activityContrast = threshold > Number.EPSILON
    ? Math.max(0, Math.min(1, (activeLevel - baselineLevel) / scale))
    : 0;
  const startupLevel = percentile(envelope.slice(0, settlingSamples), 0.90);
  const startupArtifactRatio = activeLevel > Number.EPSILON
    ? startupLevel / activeLevel
    : 0;
  const active = envelope.map(
    (value, index) => threshold > Number.EPSILON && index >= settlingSamples && value >= threshold
  );
  const minDuration = Math.max(8, Math.round(signal.length * 0.023));
  const maxGap = Math.max(12, Math.round(signal.length * 0.047));
  const segments = mergeNearbySegments(findSegments(active), maxGap)
    .filter((segment) => segment.end - segment.start + 1 >= minDuration);

  const durations = segments.map((segment) => segment.end - segment.start + 1);
  const gaps = segments.slice(1).map((segment, index) => segment.start - segments[index].end - 1);
  const activeSamples = durations.reduce((sum, duration) => sum + duration, 0);
  const timed = isValidCaptureDuration(captureDurationSeconds);

  return {
    burstCount: segments.length,
    activeRatio: activeSamples / signal.length,
    meanBurstDurationRatio: mean(durations) / signal.length,
    meanGapRatio: mean(gaps) / signal.length,
    threshold,
    baselineLevel,
    activeLevel,
    activityContrast,
    startupArtifactRatio,
    meanBurstDurationSeconds: timed && durations.length > 0
      ? (mean(durations) / signal.length) * captureDurationSeconds
      : undefined,
    meanGapSeconds: timed && gaps.length > 0
      ? (mean(gaps) / signal.length) * captureDurationSeconds
      : undefined,
  };
}

/** Reject rest-only test captures before any command score can be considered. */
export function assessTestBurstActivity(
  signal: number[],
  activityEvidence?: ActivityEvidence,
  captureDurationSeconds?: number
): TestBurstActivityAssessment {
  const features = extractTemporalBurstFeatures(signal, captureDurationSeconds);
  if (features.burstCount <= 0) {
    return { usable: false, reason: '未检测到有效肌电动作', features };
  }
  if (!activityEvidence?.reliable) {
    return { usable: false, reason: '缺少可靠的静息基线对比', features };
  }
  if (!activityEvidence.usable) {
    return { usable: false, reason: '原始肌电强度与静息基线无明显差异', features };
  }
  // Training uses activityClarity = activityContrast * 100 with a minimum of 20.
  if (features.activityContrast < MIN_ACTIVITY_CONTRAST) {
    return { usable: false, reason: '动作与静息分离度不足', features };
  }
  return { usable: true, reason: '动作清晰可评分', features };
}

const dominantInteger = (values: number[]): { value: number; consistency: number } => {
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const [value, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] || [0, 0];
  return { value, consistency: values.length > 0 ? count / values.length : 0 };
};

export function buildTemporalBurstModel(
  commands: Array<{
    name: string;
    signals: number[][];
    captureDurationsSeconds?: Array<number | undefined>;
  }>
): TemporalBurstModel {
  const profiles = commands
    .map((command): TemporalBurstProfile => {
      const features = command.signals.map((signal, index) =>
        extractTemporalBurstFeatures(signal, command.captureDurationsSeconds?.[index])
      );
      const dominant = dominantInteger(features.map((feature) => feature.burstCount));
      const physicalDurations = features.map((feature) => feature.meanBurstDurationSeconds);
      const hasCompletePhysicalTiming = physicalDurations.length > 0 &&
        physicalDurations.every(isValidCaptureDuration);
      const validPhysicalDurations = hasCompletePhysicalTiming
        ? physicalDurations as number[]
        : [];
      return {
        command: command.name,
        expectedBurstCount: dominant.value,
        consistency: dominant.consistency,
        sampleCount: features.length,
        burstCount: dominant.value,
        activeRatio: median(features.map((feature) => feature.activeRatio)),
        meanBurstDurationRatio: median(features.map((feature) => feature.meanBurstDurationRatio)),
        meanGapRatio: median(features.map((feature) => feature.meanGapRatio)),
        threshold: median(features.map((feature) => feature.threshold)),
        baselineLevel: median(features.map((feature) => feature.baselineLevel)),
        activeLevel: median(features.map((feature) => feature.activeLevel)),
        activityContrast: median(features.map((feature) => feature.activityContrast)),
        startupArtifactRatio: median(features.map((feature) => feature.startupArtifactRatio)),
        meanBurstDurationSeconds: hasCompletePhysicalTiming
          ? median(validPhysicalDurations)
          : undefined,
        minBurstDurationSeconds: hasCompletePhysicalTiming
          ? Math.min(...validPhysicalDurations)
          : undefined,
        maxBurstDurationSeconds: hasCompletePhysicalTiming
          ? Math.max(...validPhysicalDurations)
          : undefined,
      };
    });

  if (profiles.length < 2) {
    return { applicable: false, profiles, reason: '至少需要两个具有重复样本的指令' };
  }
  if (commands.some((command) => command.signals.length < 2)) {
    return { applicable: false, profiles, reason: '每个指令至少需要两条重复样本' };
  }
  if (profiles.some((profile) => profile.expectedBurstCount < 1 || profile.consistency < 0.6)) {
    return { applicable: false, profiles, reason: '部分指令的肌电爆发次数不稳定' };
  }
  for (let leftIndex = 0; leftIndex < profiles.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < profiles.length; rightIndex++) {
      const left = profiles[leftIndex];
      const right = profiles[rightIndex];
      if (left.expectedBurstCount !== right.expectedBurstCount) continue;

      const leftDuration = left.meanBurstDurationSeconds;
      const rightDuration = right.meanBurstDurationSeconds;
      if (!isValidCaptureDuration(leftDuration) || !isValidCaptureDuration(rightDuration)) {
        return { applicable: false, profiles, reason: '同次数指令缺少可还原的物理动作时长' };
      }
      const [shorter, longer] = leftDuration <= rightDuration ? [left, right] : [right, left];
      const separated = isValidCaptureDuration(shorter.maxBurstDurationSeconds) &&
        isValidCaptureDuration(longer.minBurstDurationSeconds) &&
        longer.minBurstDurationSeconds - shorter.maxBurstDurationSeconds >= 0.08 &&
        longer.meanBurstDurationSeconds! / shorter.meanBurstDurationSeconds! >= 1.5;
      if (!separated) {
        return { applicable: false, profiles, reason: '同次数指令的物理动作时长没有可靠分离' };
      }
    }
  }

  return { applicable: true, profiles, reason: '训练集肌电爆发次数或物理动作时长可区分' };
}

const ratioDistance = (actual: number, expected: number, scale: number): number => {
  return Math.min(1, Math.abs(actual - expected) / Math.max(scale, expected, 0.03));
};

export function recognizeTemporalBurst(
  signal: number[],
  model: TemporalBurstModel,
  captureDurationSeconds?: number
): TemporalBurstRecognition | null {
  if (!model.applicable || model.profiles.length === 0) return null;

  const features = extractTemporalBurstFeatures(signal, captureDurationSeconds);
  const counts = model.profiles.map((profile) => profile.expectedBurstCount);
  const repeatedCounts = new Set(counts.filter((count, index) => counts.indexOf(count) !== index));
  if (repeatedCounts.size > 0 && !isValidCaptureDuration(features.meanBurstDurationSeconds)) {
    return null;
  }
  const scores = model.profiles.map((profile) => {
    const countPenalty = Math.abs(features.burstCount - profile.expectedBurstCount) * 35;
    const activePenalty = ratioDistance(features.activeRatio, profile.activeRatio, 0.12) * 10;
    const durationPenalty = ratioDistance(
      features.meanBurstDurationRatio,
      profile.meanBurstDurationRatio,
      0.08
    ) * 10;
    const gapPenalty = ratioDistance(features.meanGapRatio, profile.meanGapRatio, 0.08) * 5;
    const physicalDurationPenalty = repeatedCounts.has(profile.expectedBurstCount)
      ? Math.min(60, 60 * Math.abs(
          features.meanBurstDurationSeconds! - profile.meanBurstDurationSeconds!
        ) / Math.max(
          features.meanBurstDurationSeconds!, profile.meanBurstDurationSeconds!, 0.08
        ))
      : 0;
    return {
      command: profile.command,
      score: Math.max(0, 100 - countPenalty - activePenalty - durationPenalty - gapPenalty - physicalDurationPenalty),
      expectedBurstCount: profile.expectedBurstCount,
    };
  }).sort((a, b) => b.score - a.score);

  return {
    command: scores[0].command,
    score: scores[0].score,
    margin: scores[0].score - (scores[1]?.score || 0),
    features,
    scores,
  };
}

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
}

export interface TemporalBurstProfile extends TemporalBurstFeatures {
  command: string;
  expectedBurstCount: number;
  consistency: number;
  sampleCount: number;
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

interface Segment {
  start: number;
  end: number;
}

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
export function extractTemporalBurstFeatures(signal: number[]): TemporalBurstFeatures {
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
  const baselineLevel = percentile(analysisEnvelope, 0.30);
  const activeLevel = percentile(analysisEnvelope, 0.90);
  const threshold = Math.max(
    percentile(analysisEnvelope, 0.70),
    baselineLevel + (activeLevel - baselineLevel) * 0.35
  );
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
  };
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
  commands: Array<{ name: string; signals: number[][] }>
): TemporalBurstModel {
  const profiles = commands
    .filter((command) => command.signals.length >= 2)
    .map((command): TemporalBurstProfile => {
      const features = command.signals.map(extractTemporalBurstFeatures);
      const dominant = dominantInteger(features.map((feature) => feature.burstCount));
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
      };
    });

  if (profiles.length < 2) {
    return { applicable: false, profiles, reason: '至少需要两个具有重复样本的指令' };
  }
  if (profiles.some((profile) => profile.expectedBurstCount < 1 || profile.consistency < 0.6)) {
    return { applicable: false, profiles, reason: '部分指令的肌电爆发次数不稳定' };
  }
  const expectedCounts = new Set(profiles.map((profile) => profile.expectedBurstCount));
  if (expectedCounts.size !== profiles.length) {
    return { applicable: false, profiles, reason: '不同指令没有形成可区分的爆发次数模式' };
  }

  return { applicable: true, profiles, reason: '训练集具有稳定且互异的肌电爆发次数' };
}

const ratioDistance = (actual: number, expected: number, scale: number): number => {
  return Math.min(1, Math.abs(actual - expected) / Math.max(scale, expected, 0.03));
};

export function recognizeTemporalBurst(
  signal: number[],
  model: TemporalBurstModel
): TemporalBurstRecognition | null {
  if (!model.applicable || model.profiles.length === 0) return null;

  const features = extractTemporalBurstFeatures(signal);
  const scores = model.profiles.map((profile) => {
    const countPenalty = Math.abs(features.burstCount - profile.expectedBurstCount) * 35;
    const activePenalty = ratioDistance(features.activeRatio, profile.activeRatio, 0.12) * 10;
    const durationPenalty = ratioDistance(
      features.meanBurstDurationRatio,
      profile.meanBurstDurationRatio,
      0.08
    ) * 10;
    const gapPenalty = ratioDistance(features.meanGapRatio, profile.meanGapRatio, 0.08) * 5;
    return {
      command: profile.command,
      score: Math.max(0, 100 - countPenalty - activePenalty - durationPenalty - gapPenalty),
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

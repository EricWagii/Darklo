import {
  extractTemporalBurstFeatures,
  type TemporalBurstFeatures,
} from './temporal-burst-recognition';
import type { StartupArtifactMetadata } from './startup-artifact-suppression';

export interface ImprovedQualityScore {
  overallScore: number;
  rhythmConsistency: number;
  activityClarity: number;
  morphologyConsistency: number;
  artifactResistance: number;
  startupArtifactAmbiguous: boolean;
  detectedBurstCount: number;
  expectedBurstCount: number;
  profileConsistency: number;
  provisional: boolean;
  isOutlier: boolean;
  recommendation: string;
  // Compatibility aliases for older diagnostics and exports.
  energyConsistency: number;
  signalStrength: number;
  variability: number;
  details: {
    energyRange: { min: number; max: number };
    peakAmplitude: number;
    noiseLevel: number;
    activeRatio: number;
    meanBurstDurationRatio: number;
    meanGapRatio: number;
    startupArtifactRatio: number;
  };
}

type Waveform = {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  startupArtifactMeta?: StartupArtifactMetadata;
};

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const dominantBurstCount = (features: TemporalBurstFeatures[]) => {
  const counts = new Map<number, number>();
  for (const feature of features) {
    counts.set(feature.burstCount, (counts.get(feature.burstCount) || 0) + 1);
  }
  const [value, count] = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] - b[0];
  })[0] || [0, 0];
  return {
    value,
    consistency: features.length > 0 ? count / features.length : 0,
  };
};

const ratioSimilarity = (actual: number, expected: number, tolerance: number): number => {
  const distance = Math.abs(actual - expected) / Math.max(tolerance, Math.abs(expected), 0.02);
  return clamp((1 - distance) * 100);
};

const calculateMorphologyConsistency = (
  current: TemporalBurstFeatures,
  allFeatures: TemporalBurstFeatures[],
  expectedBurstCount: number
): number => {
  const peers = allFeatures.filter((feature) => feature.burstCount === expectedBurstCount);
  if (peers.length < 2 || current.burstCount !== expectedBurstCount) {
    return current.burstCount === expectedBurstCount ? 65 : 20;
  }

  const activeScore = ratioSimilarity(
    current.activeRatio,
    median(peers.map((feature) => feature.activeRatio)),
    0.12
  );
  const durationScore = ratioSimilarity(
    current.meanBurstDurationRatio,
    median(peers.map((feature) => feature.meanBurstDurationRatio)),
    0.08
  );
  const gapScore = expectedBurstCount > 1
    ? ratioSimilarity(
        current.meanGapRatio,
        median(peers.map((feature) => feature.meanGapRatio)),
        0.10
      )
    : 100;
  return clamp(activeScore * 0.4 + durationScore * 0.35 + gapScore * 0.25);
};

const calculateArtifactResistance = (
  features: TemporalBurstFeatures,
  metadata?: StartupArtifactMetadata
): number => {
  if (metadata?.ambiguous) return 0;
  if (metadata?.detected) return 90;
  if (metadata) return 100;
  if (features.startupArtifactRatio <= 1.5) return 100;
  if (features.startupArtifactRatio >= 5) return 0;
  return clamp(100 - ((features.startupArtifactRatio - 1.5) / 3.5) * 100);
};

const calculateEnergyRange = (signal: number[]): { min: number; max: number } => {
  if (signal.length === 0) return { min: 0, max: 0 };
  return {
    min: Math.abs(Math.min(...signal)),
    max: Math.abs(Math.max(...signal)),
  };
};

function buildRecommendation(score: Omit<ImprovedQualityScore, 'recommendation'>): string {
  if (score.startupArtifactAmbiguous) {
    return '启动伪迹与真实动作无法分离，当前样本不可用于训练，建议保持静息后重录';
  }
  if (score.detectedBurstCount === 0 || score.activityClarity < 20) {
    return '未检测到清晰肌电动作，建议检查电极接触并重录';
  }
  if (!score.provisional && score.detectedBurstCount !== score.expectedBurstCount) {
    return `检测到 ${score.detectedBurstCount} 次动作，本指令多数样本为 ${score.expectedBurstCount} 次，建议重录`;
  }
  if (score.artifactResistance < 50) {
    return '起始伪迹明显，动作前请保持静息并检查电极是否移动';
  }
  if (score.activityClarity < 55) {
    return '动作与静息分离度偏低，建议调整电极位置或重录';
  }
  if (score.morphologyConsistency < 55) {
    return '动作时长或间隔偏离同指令样本，建议重录';
  }
  if (score.provisional) {
    return '暂定评分：需要更多同指令样本后确认可用度';
  }
  return score.overallScore >= 80 ? '样本可用度高' : '样本基本可用';
}

export function evaluateAllCollectionsImproved(collections: Waveform[]): ImprovedQualityScore[] {
  if (collections.length === 0) return [];

  const features = collections.map((collection) =>
    extractTemporalBurstFeatures(collection.ch2 || [])
  );
  const dominant = dominantBurstCount(features);
  const provisional = collections.length < 3;

  return collections.map((collection, index) => {
    const current = features[index];
    const burstDifference = Math.abs(current.burstCount - dominant.value);
    const rhythmConsistency = burstDifference === 0
      ? clamp(70 + dominant.consistency * 30)
      : burstDifference === 1 ? 20 : 0;
    const activityClarity = clamp(current.activityContrast * 100);
    const morphologyConsistency = calculateMorphologyConsistency(
      current,
      features,
      dominant.value
    );
    const startupArtifactAmbiguous = collection.startupArtifactMeta?.ambiguous === true;
    const artifactResistance = calculateArtifactResistance(current, collection.startupArtifactMeta);

    let overallScore = Math.round(
      rhythmConsistency * 0.45 +
      activityClarity * 0.30 +
      morphologyConsistency * 0.15 +
      artifactResistance * 0.10
    );

    if (current.burstCount === 0) overallScore = Math.min(overallScore, 25);
    if (activityClarity < 20) overallScore = Math.min(overallScore, 35);
    if (!provisional && burstDifference > 0) overallScore = Math.min(overallScore, 45);
    if (provisional) overallScore = Math.min(overallScore, 75);
    if (startupArtifactAmbiguous) overallScore = Math.min(overallScore, 25);
    overallScore = Math.round(clamp(overallScore));

    const energyRange = calculateEnergyRange(collection.ch2 || []);
    const base = {
      overallScore,
      rhythmConsistency: Math.round(rhythmConsistency),
      activityClarity: Math.round(activityClarity),
      morphologyConsistency: Math.round(morphologyConsistency),
      artifactResistance: Math.round(artifactResistance),
      startupArtifactAmbiguous,
      detectedBurstCount: current.burstCount,
      expectedBurstCount: dominant.value,
      profileConsistency: Math.round(dominant.consistency * 100),
      provisional,
      isOutlier:
        overallScore < 55 ||
        startupArtifactAmbiguous ||
        current.burstCount === 0 ||
        (!provisional && burstDifference > 0),
      energyConsistency: Math.round(rhythmConsistency),
      signalStrength: Math.round(activityClarity),
      variability: Math.round(morphologyConsistency),
      details: {
        energyRange,
        peakAmplitude: energyRange.max,
        noiseLevel: Math.round(current.baselineLevel * 100) / 100,
        activeRatio: current.activeRatio,
        meanBurstDurationRatio: current.meanBurstDurationRatio,
        meanGapRatio: current.meanGapRatio,
        startupArtifactRatio: current.startupArtifactRatio,
      },
    };

    return {
      ...base,
      recommendation: buildRecommendation(base),
    };
  });
}

export function calculateImprovedQualityScore(
  signal: number[],
  allCollections: Waveform[],
  collectionIndex: number
): ImprovedQualityScore {
  const normalizedCollections = allCollections.map((collection, index) =>
    index === collectionIndex ? { ...collection, ch2: signal } : collection
  );
  return evaluateAllCollectionsImproved(normalizedCollections)[collectionIndex];
}

export function getQualityStatistics(scores: ImprovedQualityScore[]) {
  if (scores.length === 0) {
    return {
      avgScore: 0,
      minScore: 0,
      maxScore: 0,
      outlierCount: 0,
      goodCount: 0,
      fairCount: 0,
      poorCount: 0,
    };
  }
  return {
    avgScore: Math.round(scores.reduce((sum, score) => sum + score.overallScore, 0) / scores.length),
    minScore: Math.min(...scores.map((score) => score.overallScore)),
    maxScore: Math.max(...scores.map((score) => score.overallScore)),
    outlierCount: scores.filter((score) => score.isOutlier).length,
    goodCount: scores.filter((score) => score.overallScore >= 75).length,
    fairCount: scores.filter((score) => score.overallScore >= 55 && score.overallScore < 75).length,
    poorCount: scores.filter((score) => score.overallScore < 55).length,
  };
}

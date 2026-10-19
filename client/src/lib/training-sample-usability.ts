import { resampleSignal } from './adaptive-waveform-filtering';
import { isSupportedCaptureSampleRate } from './capture-frame-rate';
import { evaluateAllCollectionsImproved } from './quality-scoring-improved';
import type { StartupArtifactMetadata } from './startup-artifact-suppression';
import { extractTemporalBurstFeatures, type ActivityEvidence } from './temporal-burst-recognition';

const TRAINING_WAVEFORM_LENGTH = 512;
const MIN_MANUAL_TRIM_SAMPLES = 32;
const MIN_BURST_COUNT_CONSISTENCY = 0.6;
const MIN_TRIM_ACTION_ENERGY_RETENTION = 0.8;
export const TRAINING_PIPELINE_VERSION = 'resting-baseline-v3' as const;

export interface TrainingCollectionLike {
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] };
  preprocessingMeta?: {
    pipelineVersion?: string;
    requiresRestingBaseline?: boolean;
  };
  pipelineMetadata?: {
    croppedLength?: number;
    finalLength?: number;
    durationReliable?: boolean;
    samplingRate?: number;
    qualityScore?: number;
    activityEvidence?: ActivityEvidence;
    startupArtifact?: StartupArtifactMetadata;
    [key: string]: unknown;
  };
}

export interface TrainingSampleRejection {
  index: number;
  reasons: string[];
}

export interface TrainingCollectionsAssessment<T> {
  usableCollections: T[];
  rejected: TrainingSampleRejection[];
}

/** The same template eligibility rules must be used when saving and recognizing. */
export function assessTrainingCollections<T extends TrainingCollectionLike>(
  collections: readonly T[]
): TrainingCollectionsAssessment<T> {
  const usableCollections: T[] = [];
  const rejected: TrainingSampleRejection[] = [];
  const structurallyValid: Array<{ index: number; collection: T }> = [];
  const individuallyUsable: Array<{ index: number; collection: T; burstCount: number }> = [];

  collections.forEach((collection, index) => {
    const reasons: string[] = [];
    const { ch1, ch2, ch3 } = collection.waveform;

    if (collection.preprocessingMeta?.pipelineVersion !== TRAINING_PIPELINE_VERSION) {
      reasons.push(`预处理版本不兼容（需要 ${TRAINING_PIPELINE_VERSION}），请重新采集`);
    }
    if (collection.preprocessingMeta?.requiresRestingBaseline !== true) {
      reasons.push('缺少静息基线预处理标记');
    }
    const activityEvidence = collection.pipelineMetadata?.activityEvidence;
    if (activityEvidence?.reliable !== true || activityEvidence.usable !== true) {
      reasons.push('原始肌电与静息基线对比未证实有效动作，请检查电极接触并重新采集');
    }
    if (!isSupportedCaptureSampleRate(collection.pipelineMetadata?.samplingRate ?? Number.NaN)) {
      reasons.push('缺少可靠的实测采样率，请重新采集');
    }
    if (
      ch1.length !== TRAINING_WAVEFORM_LENGTH ||
      ch2.length !== TRAINING_WAVEFORM_LENGTH ||
      ch3.length !== TRAINING_WAVEFORM_LENGTH
    ) {
      reasons.push(`训练波形需三通道各 ${TRAINING_WAVEFORM_LENGTH} 点`);
    } else if (![...ch1, ...ch2, ...ch3].every(Number.isFinite)) {
      reasons.push('训练波形包含非有限数值');
    }

    if (reasons.length > 0) {
      rejected.push({ index, reasons });
    } else {
      structurallyValid.push({ index, collection });
    }
  });

  const usabilityScores = evaluateAllCollectionsImproved(
    structurallyValid.map(({ collection }) => ({
      ...collection.waveform,
      startupArtifactMeta: collection.pipelineMetadata?.startupArtifact,
    }))
  );

  structurallyValid.forEach(({ index, collection }, validIndex) => {
    const score = usabilityScores[validIndex];
    const reasons: string[] = [];
    if (!score || score.detectedBurstCount <= 0) {
      reasons.push('未检测到有效肌电动作');
    }
    if (!score || score.activityClarity < 20) {
      reasons.push(`动作清晰度不足（${score?.activityClarity ?? 0}/100，要求至少 20）`);
    }
    if (!score || score.artifactResistance < 30) {
      reasons.push('启动伪迹干扰过大');
    }
    if (collection.pipelineMetadata?.startupArtifact?.ambiguous === true) {
      reasons.push('启动伪迹与动作无法分离');
    }
    const processingQuality = collection.pipelineMetadata?.qualityScore;
    if (typeof processingQuality === 'number' && processingQuality < 40) {
      reasons.push(`处理质量不足（${processingQuality.toFixed(0)}/100，要求至少 40）`);
    }

    if (reasons.length > 0) {
      rejected.push({ index, reasons });
    } else {
      individuallyUsable.push({ index, collection, burstCount: score?.detectedBurstCount ?? 0 });
    }
  });

  // One capture can be provisional. Once there is a second usable capture,
  // a command must have a stable action count before its templates are saved.
  const burstCounts = new Map<number, number>();
  individuallyUsable.forEach(({ burstCount }) => {
    burstCounts.set(burstCount, (burstCounts.get(burstCount) || 0) + 1);
  });
  const [dominantBurstCount, dominantCount] = Array.from(burstCounts.entries())
    .sort((left, right) => right[1] - left[1])[0] || [0, 0];
  const hasStableMajority = individuallyUsable.length < 2 ||
    dominantCount / individuallyUsable.length >= MIN_BURST_COUNT_CONSISTENCY;

  individuallyUsable.forEach(({ index, collection, burstCount }) => {
    if (!hasStableMajority) {
      rejected.push({
        index,
        reasons: [
          `同一指令的动作次数无稳定多数（最多 ${dominantCount}/${individuallyUsable.length} 条一致）；请删除节律不同的样本或重录`,
        ],
      });
    } else if (burstCount !== dominantBurstCount) {
      rejected.push({
        index,
        reasons: [`动作次数与本指令多数样本不一致（本条 ${burstCount} 次，多数 ${dominantBurstCount} 次）；请删除或重录`],
      });
    } else {
      usableCollections.push(collection);
    }
  });

  rejected.sort((a, b) => a.index - b.index);
  return { usableCollections, rejected };
}

export function describeTrainingRejections(rejected: readonly TrainingSampleRejection[]): string {
  if (rejected.length === 0) return '';
  const shown = rejected.slice(0, 3).map(({ index, reasons }) =>
    `第 ${index + 1} 条：${reasons.join('、')}`
  );
  const more = rejected.length > 3 ? `；另有 ${rejected.length - 3} 条` : '';
  return `训练样本暂不可用于识别。${shown.join('；')}${more}。请删除或重录后保存`;
}

/** Preserve the physical duration estimate when trimming an already-resampled template. */
export function trimTrainingCollection<T extends TrainingCollectionLike>(
  collection: T,
  start: number,
  end: number
): { collection: T | null; error: string | null } {
  const { ch1, ch2, ch3 } = collection.waveform;
  const sourceLength = ch1.length;
  if (
    sourceLength === 0 || ch2.length !== sourceLength || ch3.length !== sourceLength ||
    !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > sourceLength || end <= start
  ) {
    return { collection: null, error: '裁剪区间无效，请重新选择' };
  }

  const trimmedLength = end - start;
  if (trimmedLength < MIN_MANUAL_TRIM_SAMPLES) {
    return { collection: null, error: '裁剪片段过短，至少保留 32 个原始波形点' };
  }

  const waveform = {
    ch1: resampleSignal(ch1.slice(start, end), TRAINING_WAVEFORM_LENGTH),
    ch2: resampleSignal(ch2.slice(start, end), TRAINING_WAVEFORM_LENGTH),
    ch3: resampleSignal(ch3.slice(start, end), TRAINING_WAVEFORM_LENGTH),
  };
  // Raw-vs-rest activity evidence belongs to the full capture. Without raw
  // samples it cannot be recomputed after a manual trim, so only allow trims
  // that preserve the detected rhythm and most of the original action energy.
  const originalBurstCount = extractTemporalBurstFeatures(ch2).burstCount;
  const trimmedBurstCount = extractTemporalBurstFeatures(waveform.ch2).burstCount;
  if (originalBurstCount !== trimmedBurstCount) {
    return { collection: null, error: '裁剪改变了原始动作次数；请保留完整动作或重新采集' };
  }
  const originalEnergy = ch2.reduce((sum, value) => sum + value * value, 0);
  const retainedEnergy = ch2.slice(start, end).reduce((sum, value) => sum + value * value, 0);
  if (originalEnergy > 0 && retainedEnergy / originalEnergy < MIN_TRIM_ACTION_ENERGY_RETENTION) {
    return { collection: null, error: '裁剪移除了过多原始动作能量；请保留完整动作或重新采集' };
  }
  const previousCroppedLength = collection.pipelineMetadata?.croppedLength;
  const durationReliable =
    Number.isFinite(previousCroppedLength) &&
    (previousCroppedLength ?? 0) > 0 &&
    collection.pipelineMetadata?.durationReliable !== false;
  const correctedCroppedLength = durationReliable
    ? Math.max(1, Math.round((previousCroppedLength as number) * trimmedLength / sourceLength))
    : undefined;
  const trimmed = {
    ...collection,
    waveform,
    pipelineMetadata: {
      ...collection.pipelineMetadata,
      croppedLength: correctedCroppedLength,
      finalLength: TRAINING_WAVEFORM_LENGTH,
      durationReliable,
    },
  } as T;
  const assessment = assessTrainingCollections([trimmed]);
  if (assessment.rejected.length > 0) {
    return { collection: null, error: describeTrainingRejections(assessment.rejected) };
  }
  return { collection: trimmed, error: null };
}

/** Apply a shared crop atomically: one unusable sample leaves the whole batch unchanged. */
export function trimTrainingCollections<T extends TrainingCollectionLike>(
  collections: readonly T[],
  start: number,
  end: number
): { collections: T[] | null; error: string | null } {
  const trimmed: T[] = [];
  const failures: string[] = [];

  collections.forEach((collection, index) => {
    const result = trimTrainingCollection(collection, start, end);
    if (result.collection) {
      trimmed.push(result.collection);
    } else {
      failures.push(`第 ${index + 1} 条：${result.error || '裁剪后不可用于识别'}`);
    }
  });

  if (failures.length > 0) {
    return { collections: null, error: `自动裁剪未应用。${failures.join('；')}` };
  }
  const assessment = assessTrainingCollections(trimmed);
  if (assessment.rejected.length > 0) {
    return {
      collections: null,
      error: `自动裁剪未应用。${describeTrainingRejections(assessment.rejected)}`,
    };
  }
  return { collections: trimmed, error: null };
}

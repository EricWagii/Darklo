import { assessCaptureBaselineCompatibility } from './capture-frame-rate';
import {
  assessTrainingCollections,
  type TrainingCollectionLike,
  type TrainingCollectionsAssessment,
} from './training-sample-usability';

/** Exclude old device-rate templates before the per-command rhythm model is assessed. */
export function assessRecognitionCollectionsForBaseline<T extends TrainingCollectionLike>(
  collections: readonly T[],
  baselineSampleRate: number | undefined
): TrainingCollectionsAssessment<T> {
  if (baselineSampleRate === undefined) {
    return assessTrainingCollections(collections);
  }

  const matching: Array<{ collection: T; index: number }> = [];
  const rejected: TrainingCollectionsAssessment<T>['rejected'] = [];
  collections.forEach((collection, index) => {
    const templateRate = collection.pipelineMetadata?.samplingRate;
    if (assessCaptureBaselineCompatibility(templateRate ?? null, baselineSampleRate).compatible) {
      matching.push({ collection, index });
    } else {
      rejected.push({
        index,
        reasons: [
          `训练样本约 ${Number.isFinite(templateRate) ? Math.round(templateRate!) : '未知'} Hz，与当前静息基线约 ${Math.round(baselineSampleRate)} Hz 不兼容；请按当前设备档位重录该条，或重录与样本匹配的静息基线`,
        ],
      });
    }
  });

  const assessedMatching = assessTrainingCollections(matching.map(({ collection }) => collection));
  rejected.push(...assessedMatching.rejected.map(({ index, reasons }) => ({
    index: matching[index].index,
    reasons,
  })));
  rejected.sort((left, right) => left.index - right.index);
  return { usableCollections: assessedMatching.usableCollections, rejected };
}

interface RecognitionTrainingState {
  savedCommandCount: number;
  usableCommandCount: number;
  temporalModelApplicable: boolean;
  temporalModelReason: string;
}

interface RecognitionTrainingStatus {
  canStart: boolean;
  message: string;
}

export function formatTrainingExclusions(commands: ReadonlyArray<{
  commandName: string;
  rejected: ReadonlyArray<{ index: number; reasons: readonly string[] }>;
}>): string {
  const items = commands.flatMap(({ commandName, rejected }) => rejected.map(({ index, reasons }) =>
    `${commandName} 第 ${index + 1} 条：${reasons.join('、')}`
  ));
  if (items.length === 0) return '';
  const shown = items.slice(0, 3).join('；');
  return items.length > 3 ? `${shown}；另有 ${items.length - 3} 条样本被排除` : shown;
}

export function summarizeRecognitionTraining(state: RecognitionTrainingState): RecognitionTrainingStatus {
  if (state.savedCommandCount === 0) {
    return { canStart: false, message: '请先完成采集训练' };
  }
  if (state.usableCommandCount === 0) {
    return {
      canStart: false,
      message: '已保存指令中没有可用于识别的训练样本，请在采集训练页检查信号并重录',
    };
  }
  if (state.usableCommandCount < 2) {
    return { canStart: false, message: '至少两个指令需要有可用的训练样本' };
  }
  if (state.usableCommandCount !== state.savedCommandCount) {
    return {
      canStart: false,
      message: `${state.savedCommandCount - state.usableCommandCount} 个指令没有可用训练样本，请检查并重录后测试`,
    };
  }
  if (!state.temporalModelApplicable) {
    return {
      canStart: false,
      message: `节律模型未就绪：${state.temporalModelReason}。请补充或重录各指令的动作样本后测试`,
    };
  }
  return { canStart: true, message: '节律模型已就绪' };
}

/**
 * 自适应置信度阈值模块
 * 
 * 问题6.3修复：置信度阈值0.5无理论依据
 * 改进：基于训练数据的统计阈值或ROC曲线最优阈值
 */

import { FeatureLibraryEntry } from './recognition-engine';
import { mahalanobisDistance } from './recognition-engine';

/**
 * 配置常量
 */
export const CONFIDENCE_THRESHOLD_CONFIG = {
  // 默认阈值（当无法计算统计阈值时使用）
  DEFAULT_THRESHOLD: 0.55,
  
  // 同类样本对的距离倍数（用于计算阈值）
  INTRA_CLASS_MULTIPLIER: 1.5,
  
  // 异类样本对的距离倍数（用于计算阈值）
  INTER_CLASS_MULTIPLIER: 0.5,
};

/**
 * 基于训练数据的统计阈值
 * 
 * 原理：
 * - 计算所有训练样本对的距离分布
 * - 同类样本对（同一指令）的距离应该较小
 * - 异类样本对（不同指令）的距离应该较大
 * - 阈值设置在两者之间
 * 
 * @param featureLibrary 特征库
 * @returns 计算得到的置信度阈值
 */
export function calculateStatisticalThreshold(
  featureLibrary: FeatureLibraryEntry[]
): number {
  if (featureLibrary.length === 0) {
    return CONFIDENCE_THRESHOLD_CONFIG.DEFAULT_THRESHOLD;
  }

  const intraClassDistances: number[] = [];  // 同类距离
  const interClassDistances: number[] = [];  // 异类距离

  // 计算同类距离（同一指令内的样本对）
  for (const entry of featureLibrary) {
    if (!entry.featureSamples || entry.featureSamples.length < 2) {
      continue;
    }

    for (let i = 0; i < entry.featureSamples.length; i++) {
      for (let j = i + 1; j < entry.featureSamples.length; j++) {
        const distance = mahalanobisDistance(
          entry.featureSamples[i],
          entry.featureSamples[j],
          entry.featureStd
        );
        intraClassDistances.push(distance);
      }
    }
  }

  // 计算异类距离（不同指令间的样本对）
  for (let i = 0; i < featureLibrary.length; i++) {
    for (let j = i + 1; j < featureLibrary.length; j++) {
      const entry1 = featureLibrary[i];
      const entry2 = featureLibrary[j];

      if (!entry1.featureSamples || !entry2.featureSamples) {
        continue;
      }

      // 只计算部分样本对以节省计算时间
      const step1 = Math.max(1, Math.floor(entry1.featureSamples.length / 3));
      const step2 = Math.max(1, Math.floor(entry2.featureSamples.length / 3));

      for (let si = 0; si < entry1.featureSamples.length; si += step1) {
        for (let sj = 0; sj < entry2.featureSamples.length; sj += step2) {
          const distance = mahalanobisDistance(
            entry1.featureSamples[si],
            entry2.featureSamples[sj],
            entry1.featureStd  // 使用第一个条目的标准差
          );
          interClassDistances.push(distance);
        }
      }
    }
  }

  // 如果没有足够的距离数据，使用默认阈值
  if (intraClassDistances.length === 0 || interClassDistances.length === 0) {
    return CONFIDENCE_THRESHOLD_CONFIG.DEFAULT_THRESHOLD;
  }

  // 计算中位数
  const sortedIntra = intraClassDistances.sort((a, b) => a - b);
  const sortedInter = interClassDistances.sort((a, b) => a - b);

  const medianIntra = sortedIntra[Math.floor(sortedIntra.length / 2)];
  const medianInter = sortedInter[Math.floor(sortedInter.length / 2)];

  // 计算阈值距离：在同类和异类距离之间
  const thresholdDistance =
    medianIntra * CONFIDENCE_THRESHOLD_CONFIG.INTRA_CLASS_MULTIPLIER +
    medianInter * CONFIDENCE_THRESHOLD_CONFIG.INTER_CLASS_MULTIPLIER;

  // 转换为置信度
  const thresholdConfidence = 1 / (1 + thresholdDistance);

  // 确保阈值在合理范围内
  return Math.min(0.9, Math.max(0.3, thresholdConfidence));
}

/**
 * 基于ROC曲线的最优阈值（简化版本）
 * 
 * 原理：
 * - 遍历所有可能的阈值
 * - 计算每个阈值的真正率(TPR)和假正率(FPR)
 * - 选择使得 TPR - FPR 最大的阈值
 * 
 * @param featureLibrary 特征库
 * @returns 最优置信度阈值
 */
export function calculateROCOptimalThreshold(
  featureLibrary: FeatureLibraryEntry[]
): number {
  if (featureLibrary.length === 0) {
    return CONFIDENCE_THRESHOLD_CONFIG.DEFAULT_THRESHOLD;
  }

  // 收集所有样本对及其标签
  const pairs: Array<{ distance: number; isSameClass: boolean }> = [];

  // 同类样本对
  for (const entry of featureLibrary) {
    if (!entry.featureSamples || entry.featureSamples.length < 2) {
      continue;
    }

    for (let i = 0; i < entry.featureSamples.length; i++) {
      for (let j = i + 1; j < entry.featureSamples.length; j++) {
        const distance = mahalanobisDistance(
          entry.featureSamples[i],
          entry.featureSamples[j],
          entry.featureStd
        );
        pairs.push({ distance, isSameClass: true });
      }
    }
  }

  // 异类样本对（采样以节省时间）
  for (let i = 0; i < featureLibrary.length; i++) {
    for (let j = i + 1; j < featureLibrary.length; j++) {
      const entry1 = featureLibrary[i];
      const entry2 = featureLibrary[j];

      if (!entry1.featureSamples || !entry2.featureSamples) {
        continue;
      }

      const step1 = Math.max(1, Math.floor(entry1.featureSamples.length / 2));
      const step2 = Math.max(1, Math.floor(entry2.featureSamples.length / 2));

      for (let si = 0; si < entry1.featureSamples.length; si += step1) {
        for (let sj = 0; sj < entry2.featureSamples.length; sj += step2) {
          const distance = mahalanobisDistance(
            entry1.featureSamples[si],
            entry2.featureSamples[sj],
            entry1.featureStd
          );
          pairs.push({ distance, isSameClass: false });
        }
      }
    }
  }

  if (pairs.length === 0) {
    return CONFIDENCE_THRESHOLD_CONFIG.DEFAULT_THRESHOLD;
  }

  // 尝试不同的距离阈值
  const distances = pairs.map((p) => p.distance).sort((a, b) => a - b);
  let bestThreshold = CONFIDENCE_THRESHOLD_CONFIG.DEFAULT_THRESHOLD;
  let bestScore = -Infinity;

  // 采样阈值以节省计算时间
  const step = Math.max(1, Math.floor(distances.length / 20));

  for (let i = 0; i < distances.length; i += step) {
    const distanceThreshold = distances[i];

    // 计算TPR和FPR
    let tp = 0,
      fp = 0,
      tn = 0,
      fn = 0;

    for (const pair of pairs) {
      const predicted = pair.distance <= distanceThreshold;
      const actual = pair.isSameClass;

      if (predicted && actual) tp++;
      else if (predicted && !actual) fp++;
      else if (!predicted && !actual) tn++;
      else fn++;
    }

    const tpr = tp / (tp + fn) || 0;
    const fpr = fp / (fp + tn) || 0;
    const score = tpr - fpr;

    if (score > bestScore) {
      bestScore = score;
      bestThreshold = 1 / (1 + distanceThreshold);
    }
  }

  // 确保阈值在合理范围内
  return Math.min(0.9, Math.max(0.3, bestThreshold));
}

/**
 * 获取推荐的置信度阈值
 * 
 * @param featureLibrary 特征库
 * @param method 计算方法：'statistical' 或 'roc'
 * @returns 推荐的置信度阈值
 */
export function getRecommendedThreshold(
  featureLibrary: FeatureLibraryEntry[],
  method: 'statistical' | 'roc' = 'statistical'
): number {
  if (method === 'roc') {
    return calculateROCOptimalThreshold(featureLibrary);
  }

  return calculateStatisticalThreshold(featureLibrary);
}

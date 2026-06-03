/**
 * KNN识别模块
 * 
 * 问题6.2修复：使用KNN而不是只和均值比对
 * 原因：双峰分布时，均值落在波谷，标准差虚高
 * 
 * 改进：保留原始特征向量，与所有样本比对取最小距离
 */

import { FeatureLibraryEntry, RecognitionPrediction } from './recognition-engine';
import { mahalanobisDistance } from './recognition-engine';

/**
 * 使用KNN进行识别
 * 
 * @param testFeature 测试特征向量
 * @param libraryEntry 特征库条目
 * @param k KNN中的k值（默认1，即找最近邻）
 * @returns 最小距离
 */
export function knnDistance(
  testFeature: number[],
  libraryEntry: FeatureLibraryEntry,
  k: number = 1
): number {
  if (!libraryEntry.featureSamples || libraryEntry.featureSamples.length === 0) {
    // 如果没有样本，降级到使用均值
    return mahalanobisDistance(testFeature, libraryEntry.featureMean, libraryEntry.featureStd);
  }

  // 计算与所有样本的距离
  const distances = libraryEntry.featureSamples.map((sample) =>
    mahalanobisDistance(testFeature, sample, libraryEntry.featureStd)
  );

  // ✅ 任务7：使用保守 top-k 策略
  // k = Math.max(1, Math.min(3, Math.ceil(sampleCount * 0.5)))
  // 不要用单个最高样本决定结果，也不要盲目使用过大的 top-k 比例
  const sampleCount = libraryEntry.featureSamples.length;
  const conservativeK = Math.max(1, Math.min(3, Math.ceil(sampleCount * 0.5)));
  
  const sortedDistances = distances.sort((a, b) => a - b);
  const kNearestDistances = sortedDistances.slice(0, Math.min(conservativeK, sortedDistances.length));
  
  // 返回k个最近邻的平均距离
  const avgDistance = kNearestDistances.reduce((a, b) => a + b, 0) / kNearestDistances.length;
  
  // ✅ 任务7：检查 NaN 并提供安全的 fallback
  if (!isFinite(avgDistance)) {
    console.warn(`[KNN] 距离计算为 NaN，使用 fallback 值`);
    return 1.0;  // 最大距离
  }
  
  return avgDistance;
}

/**
 * 使用KNN计算置信度
 * 
 * @param testFeature 测试特征向量
 * @param libraryEntry 特征库条目
 * @param k KNN中的k值
 * @returns 置信度（0-1）
 */
export function knnConfidence(
  testFeature: number[],
  libraryEntry: FeatureLibraryEntry,
  k: number = 1
): number {
  const distance = knnDistance(testFeature, libraryEntry, k);
  
  // 使用sigmoid函数将距离转换为置信度
  return 1 / (1 + distance);
}

/**
 * 使用KNN进行识别（替代原来的computeConfidence）
 * 
 * @param testFeature 测试特征向量
 * @param libraryEntries 特征库条目数组
 * @param k KNN中的k值
 * @param confidenceThreshold 置信度阈值
 * @returns 识别结果
 */
export function recognizeWithKNN(
  testFeature: number[],
  libraryEntries: FeatureLibraryEntry[],
  k: number = 1,
  confidenceThreshold: number = 0.55
): {
  topPrediction: RecognitionPrediction | null;
  allPredictions: RecognitionPrediction[];
  timestamp: number;
} {
  if (libraryEntries.length === 0) {
    return {
      topPrediction: null,
      allPredictions: [],
      timestamp: Date.now(),
    };
  }

  // 计算所有预测
  const predictions: RecognitionPrediction[] = libraryEntries.map((entry) => {
    const distance = knnDistance(testFeature, entry, k);
    const confidence = 1 / (1 + distance);

    return {
      commandId: entry.commandId,
      commandName: entry.commandName,
      confidence: Math.min(1, Math.max(0, confidence)),
      distance,
      details: {
        euclidean: distance,
        cosine: 0,  // 不计算
        mahalanobis: distance,
      },
    };
  });

  // 排序
  predictions.sort((a, b) => b.confidence - a.confidence);

  // 筛选有效预测
  const validPredictions = predictions.filter((p) => p.confidence >= confidenceThreshold);

  return {
    topPrediction: validPredictions.length > 0 ? validPredictions[0] : null,
    allPredictions: predictions,
    timestamp: Date.now(),
  };
}

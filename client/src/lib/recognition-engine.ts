/**
 * 识别引擎模块
 * 
 * 功能：
 * - 特征库管理
 * - 多距离度量计算
 * - 相似度融合
 * - 识别结果排序
 */

import * as ss from 'simple-statistics';

export interface FeatureLibraryEntry {
  commandId: string;
  commandName: string;
  featureMean: number[];      // 48 维均值
  featureStd: number[];       // 48 维标准差
  featureSamples: number[][];  // 问题6.2修复：保留原始特征向量，用于KNN识别
  sourceCount: number;        // 源采集数
  generatedAt: number;
}

export interface RecognitionPrediction {
  commandId: string;
  commandName: string;
  confidence: number;         // 0-1
  distance: number;
  details: {
    euclidean: number;
    cosine: number;
    mahalanobis: number;
  };
}

export interface RecognitionResult {
  topPrediction: RecognitionPrediction | null;
  allPredictions: RecognitionPrediction[];
  timestamp: number;
}

/**
 * 欧几里得距离
 */
export function euclideanDistance(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    sum += (v1[i] - v2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * 余弦相似度
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] ** 2;
    norm2 += v2[i] ** 2;
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * 计算简化的马氏距离（对角协方差矩阵）
 * 
 * 问题6.1修复：添加详细注释说明简化原因和局限性
 * 
 * 设计说明：
 * - 使用对角协方差矩阵（每个特征的方差独立）
 * - 假设特征间相关性较小
 * - 当特征高度相关（如 MAV 和 RMS）时，此方法可能高估区分能力
 * - 完整马氏距离需要计算完整协方差矩阵，计算成本高
 * 
 * 改进方向：
 * - 可考虑使用 PCA 降绶后再计算马氏距离
 * - 或使用 Mahalanobis 的完整实现（计算成本较高）
 */
export function mahalanobisDistance(
  v1: number[],
  v2: number[],
  std: number[]
): number {
  if (v1.length !== v2.length) return Infinity;

  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const sigma = std[i] || 1; // 避免除以 0
    if (sigma > 0) {
      sum += ((v1[i] - v2[i]) / sigma) ** 2;
    }
  }
  return Math.sqrt(sum);
}

/**
 * 计算综合置信度
 * 
 * 权重：
 * - 欧几里得距离：0.4
 * - 余弦相似度：0.3
 * - 马氏距离：0.3
 */
export function computeConfidence(
  testFeature: number[],
  libraryEntry: FeatureLibraryEntry,
  weights: { euclidean: number; cosine: number; mahalanobis: number } = {
    euclidean: 0.4,
    cosine: 0.3,
    mahalanobis: 0.3,
  }
): RecognitionPrediction {
  // 计算各种距离
  const euclidean = euclideanDistance(testFeature, libraryEntry.featureMean);
  const cosine = cosineSimilarity(testFeature, libraryEntry.featureMean);
  const mahalanobis = mahalanobisDistance(
    testFeature,
    libraryEntry.featureMean,
    libraryEntry.featureStd
  );

  // 归一化距离到 [0, 1]
  // 欧几里得距离：使用 sigmoid 函数
  const euclideanScore = 1 / (1 + euclidean);

  // 余弦相似度：已经在 [-1, 1]，转换到 [0, 1]
  const cosineScore = (cosine + 1) / 2;

  // 马氏距离：使用 sigmoid 函数
  const mahalanobisScore = 1 / (1 + mahalanobis);

  // 融合
  const confidence =
    weights.euclidean * euclideanScore +
    weights.cosine * cosineScore +
    weights.mahalanobis * mahalanobisScore;

  return {
    commandId: libraryEntry.commandId,
    commandName: libraryEntry.commandName,
    confidence: Math.min(1, Math.max(0, confidence)),
    distance: euclidean,
    details: {
      euclidean,
      cosine,
      mahalanobis,
    },
  };
}

/**
 * 执行识别
 */
export function recognize(
  testFeature: number[],
  featureLibrary: FeatureLibraryEntry[],
  confidenceThreshold: number = 0.55
): RecognitionResult {
  if (featureLibrary.length === 0) {
    return {
      topPrediction: null,
      allPredictions: [],
      timestamp: Date.now(),
    };
  }

  // 计算所有预测
  const predictions = featureLibrary
    .map((entry) => computeConfidence(testFeature, entry))
    .sort((a, b) => b.confidence - a.confidence);

  // 筛选有效预测
  const validPredictions = predictions.filter((p) => p.confidence >= confidenceThreshold);

  return {
    topPrediction: validPredictions.length > 0 ? validPredictions[0] : null,
    allPredictions: predictions,
    timestamp: Date.now(),
  };
}

/**
 * 生成特征库条目
 */
export function generateLibraryEntry(
  commandId: string,
  commandName: string,
  featureVectors: number[][]
): FeatureLibraryEntry {
  if (featureVectors.length === 0) {
    return {
      commandId,
      commandName,
      featureMean: Array(48).fill(0),
      featureStd: Array(48).fill(0),
      featureSamples: [],  // 问题6.2修复：保留原始特征向量
      sourceCount: 0,
      generatedAt: Date.now(),
    };
  }

  // 计算均值
  const featureMean: number[] = Array(48).fill(0);
  for (let i = 0; i < 48; i++) {
    const values = featureVectors.map((v) => v[i]);
    featureMean[i] = ss.mean(values);
  }

  // 计算标准差
  const featureStd: number[] = Array(48).fill(0);
  for (let i = 0; i < 48; i++) {
    const values = featureVectors.map((v) => v[i]);
    featureStd[i] = ss.standardDeviation(values);
  }

  return {
    commandId,
    commandName,
    featureMean,
    featureStd,
    featureSamples: featureVectors,  // 问题6.2修复：保留原始特征向量
    sourceCount: featureVectors.length,
    generatedAt: Date.now(),
  };
}

/**
 * 计算识别准确率（用于测试）
 */
export function calculateAccuracy(
  predictions: RecognitionPrediction[],
  groundTruth: string
): number {
  if (predictions.length === 0) return 0;

  const topPrediction = predictions[0];
  return topPrediction.commandName === groundTruth ? 1 : 0;
}

/**
 * 计算平均置信度
 */
export function calculateAverageConfidence(predictions: RecognitionPrediction[]): number {
  if (predictions.length === 0) return 0;
  return ss.mean(predictions.map((p) => p.confidence));
}

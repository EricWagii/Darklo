/**
 * 信号处理和特征提取模块
 * 
 * 功能：
 * - 时域特征提取（均值、方差、RMS）
 * - 相似度计算（欧几里得距离）
 * - 信号滤波（可选）
 */

import { HARDWARE_CONFIG, FeatureVector } from '@/../../shared/const';

/**
 * 提取时域特征
 * @param samples - 采样数据数组，每个元素是 [ch1, ch2, ch3]
 * @returns 特征向量
 */
export function extractTimeFeatures(samples: number[][]): FeatureVector {
  const channels = HARDWARE_CONFIG.NUM_CHANNELS;
  const mean = new Array(channels).fill(0);
  const variance = new Array(channels).fill(0);
  const rms = new Array(channels).fill(0);

  if (samples.length === 0) {
    return { mean, variance, rms };
  }

  // 计算均值
  for (let ch = 0; ch < channels; ch++) {
    let sum = 0;
    for (const sample of samples) {
      sum += sample[ch];
    }
    mean[ch] = sum / samples.length;
  }

  // 计算方差和 RMS
  for (let ch = 0; ch < channels; ch++) {
    let sumSquaredDiff = 0;
    let sumSquared = 0;

    for (const sample of samples) {
      const diff = sample[ch] - mean[ch];
      sumSquaredDiff += diff * diff;
      sumSquared += sample[ch] * sample[ch];
    }

    variance[ch] = sumSquaredDiff / samples.length;
    rms[ch] = Math.sqrt(sumSquared / samples.length);
  }

  return { mean, variance, rms };
}

/**
 * 计算两个特征向量之间的欧几里得距离
 * @param feature1 - 第一个特征向量
 * @param feature2 - 第二个特征向量
 * @returns 距离值
 */
export function calculateEuclideanDistance(
  feature1: FeatureVector,
  feature2: FeatureVector
): number {
  let distance = 0;

  // 计算均值的距离
  for (let i = 0; i < feature1.mean.length; i++) {
    const diff = feature1.mean[i] - feature2.mean[i];
    distance += diff * diff;
  }

  // 计算方差的距离
  for (let i = 0; i < feature1.variance.length; i++) {
    const diff = feature1.variance[i] - feature2.variance[i];
    distance += diff * diff;
  }

  // 计算 RMS 的距离
  for (let i = 0; i < feature1.rms.length; i++) {
    const diff = feature1.rms[i] - feature2.rms[i];
    distance += diff * diff;
  }

  return Math.sqrt(distance);
}

/**
 * 计算余弦相似度
 * @param feature1 - 第一个特征向量
 * @param feature2 - 第二个特征向量
 * @returns 相似度值 (0-1)
 */
export function calculateCosineSimilarity(
  feature1: FeatureVector,
  feature2: FeatureVector
): number {
  const vec1 = flattenFeature(feature1);
  const vec2 = flattenFeature(feature2);

  if (vec1.length === 0 || vec2.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * 将特征向量展平为一维数组
 */
function flattenFeature(feature: FeatureVector): number[] {
  return [...feature.mean, ...feature.variance, ...feature.rms];
}

/**
 * 计算置信度（基于距离）
 * @param distance - 欧几里得距离
 * @param maxDistance - 最大距离阈值
 * @returns 置信度 (0-1)
 */
export function calculateConfidence(
  distance: number,
  maxDistance: number = 100
): number {
  // 反向距离归一化
  const confidence = Math.max(0, 1 - distance / maxDistance);
  return Math.min(1, confidence);
}

/**
 * 简单的低通滤波器（可选）
 * @param samples - 采样数据
 * @param windowSize - 滑动窗口大小
 * @returns 滤波后的数据
 */
export function lowPassFilter(
  samples: number[][],
  windowSize: number = 3
): number[][] {
  if (samples.length < windowSize) {
    return samples;
  }

  const filtered: number[][] = [];
  const channels = HARDWARE_CONFIG.NUM_CHANNELS;

  for (let i = 0; i < samples.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(samples.length, i + Math.floor(windowSize / 2) + 1);

    const filtered_sample = new Array(channels).fill(0);

    for (let ch = 0; ch < channels; ch++) {
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += samples[j][ch];
      }
      filtered_sample[ch] = sum / (end - start);
    }

    filtered.push(filtered_sample);
  }

  return filtered;
}

/**
 * 规范化特征向量（零均值、单位方差）
 */
export function normalizeFeature(feature: FeatureVector): FeatureVector {
  const normalized: FeatureVector = {
    mean: [...feature.mean],
    variance: [...feature.variance],
    rms: [...feature.rms],
  };

  // 计算均值和标准差
  const allValues = flattenFeature(feature);
  const mean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const variance =
    allValues.reduce((a, b) => a + (b - mean) ** 2, 0) / allValues.length;
  const std = Math.sqrt(variance);

  if (std === 0) {
    return normalized;
  }

  // 规范化
  for (let i = 0; i < normalized.mean.length; i++) {
    normalized.mean[i] = (normalized.mean[i] - mean) / std;
  }

  for (let i = 0; i < normalized.variance.length; i++) {
    normalized.variance[i] = (normalized.variance[i] - mean) / std;
  }

  for (let i = 0; i < normalized.rms.length; i++) {
    normalized.rms[i] = (normalized.rms[i] - mean) / std;
  }

  return normalized;
}

/**
 * 计算特征向量的平均值
 */
export function averageFeatures(features: FeatureVector[]): FeatureVector {
  if (features.length === 0) {
    return { mean: [0, 0, 0], variance: [0, 0, 0], rms: [0, 0, 0] };
  }

  const channels = HARDWARE_CONFIG.NUM_CHANNELS;
  const average: FeatureVector = {
    mean: new Array(channels).fill(0),
    variance: new Array(channels).fill(0),
    rms: new Array(channels).fill(0),
  };

  for (const feature of features) {
    for (let i = 0; i < channels; i++) {
      average.mean[i] += feature.mean[i];
      average.variance[i] += feature.variance[i];
      average.rms[i] += feature.rms[i];
    }
  }

  for (let i = 0; i < channels; i++) {
    average.mean[i] /= features.length;
    average.variance[i] /= features.length;
    average.rms[i] /= features.length;
  }

  return average;
}

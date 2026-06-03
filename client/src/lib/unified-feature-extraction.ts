/**
 * 统一的特征提取模块
 * 确保采集时和测试时使用完全相同的特征提取方法
 * 
 * 关键原则：
 * 1. 采集时：处理波形 -> 提取特征 -> 保存特征向量
 * 2. 测试时：处理波形 -> 提取特征 -> 计算相似度
 * 3. 特征提取算法完全相同
 * 4. 参考波形不应重复处理
 */

import { extractFullFeatures, normalizeFeatures } from './dsp-processor';
import { calculateChannelWeights, fuseChannelFeatures, type ChannelWeights } from './multi-channel-fusion';
import { ProcessedWaveform } from './independent-cropping';

/**
 * 特征向量接口
 */

export interface FeatureVector {
  raw: number[]; // 原始特征向量
  normalized: number[]; // 归一化后的特征向量
  channelWeights: ChannelWeights; // 三通道权重
  timestamp: number; // 提取时间戳
  metadata: {
    method: string; // 特征提取方法
    dimension: number; // 特征维度
    normalized: boolean; // 是否已归一化
  };
}

/**
 * 从处理后的波形提取特征
 * 这个函数应该在采集时和测试时都使用
 * 
 * @param processedWaveform 已处理的波形（已滤波、裁剪、缩放）
 * @returns 特征向量
 */
export function extractFeatureVector(
  processedWaveform: ProcessedWaveform
): FeatureVector {
  // 提取原始特征（返回EMGFeatures对象）
  const emgFeatures = extractFullFeatures(
    processedWaveform.ch1,
    processedWaveform.ch2,
    processedWaveform.ch3
  );

  // 计算通道权重
  const channelWeights = calculateChannelWeights(
    processedWaveform.ch1,
    processedWaveform.ch2,
    processedWaveform.ch3
  );

  // 融合特征
  // 从EMGFeatures对象中提取通道特征
  const ch1Features = emgFeatures.timeDomain.ch1.concat(emgFeatures.frequencyDomain.ch1);
  const ch2Features = emgFeatures.timeDomain.ch2.concat(emgFeatures.frequencyDomain.ch2);
  const ch3Features = emgFeatures.timeDomain.ch3.concat(emgFeatures.frequencyDomain.ch3);
  
  const fusedFeatures = fuseChannelFeatures(
    ch1Features,
    ch2Features,
    ch3Features,
    channelWeights
  );

  // 归一化特征
  const normalizedFeatures = normalizeFeatures(fusedFeatures);

  return {
    raw: fusedFeatures,
    normalized: normalizedFeatures,
    channelWeights,
    timestamp: Date.now(),
    metadata: {
      method: 'unified-extraction',
      dimension: fusedFeatures.length,
      normalized: true,
    },
  };
}

/**
 * 从原始波形直接提取特征（包含处理）
 * 仅在需要重新处理波形时使用
 * 
 * @param waveform 原始波形
 * @param processedWaveform 已处理的波形（用于提取特征）
 * @returns 特征向量
 */
export function extractFeatureVectorFromProcessed(
  processedWaveform: ProcessedWaveform
): FeatureVector {
  return extractFeatureVector(processedWaveform);
}

/**
 * 计算两个特征向量的相似度
 * 使用归一化特征进行计算
 * 
 * @param feature1 第一个特征向量
 * @param feature2 第二个特征向量
 * @returns 相似度 (0-100)
 */
export function calculateFeatureSimilarityFromVectors(
  feature1: FeatureVector,
  feature2: FeatureVector
): number {
  if (feature1.normalized.length !== feature2.normalized.length) {
    console.warn('特征维度不匹配:', feature1.normalized.length, 'vs', feature2.normalized.length);
    return 0;
  }

  // 计算欧氏距离
  let sumSquaredDiff = 0;
  for (let i = 0; i < feature1.normalized.length; i++) {
    const diff = feature1.normalized[i] - feature2.normalized[i];
    sumSquaredDiff += diff * diff;
  }
  const euclideanDist = Math.sqrt(sumSquaredDiff);

  // 转换为相似度（0-100）
  // 假设最大距离为 10，超过 10 的距离相似度为 0
  return Math.max(0, 100 - (euclideanDist / 10) * 100);
}

/**
 * 验证特征向量的一致性
 * 用于调试和验证采集时和测试时的特征提取是否一致
 * 
 * @param feature1 第一个特征向量
 * @param feature2 第二个特征向量
 * @returns 一致性报告
 */
export function validateFeatureConsistency(
  feature1: FeatureVector,
  feature2: FeatureVector
): {
  consistent: boolean;
  dimensionMatch: boolean;
  weightMatch: boolean;
  methodMatch: boolean;
  report: string;
} {
  const dimensionMatch = feature1.metadata.dimension === feature2.metadata.dimension;
  const weightMatch = 
    Math.abs(feature1.channelWeights.ch1 - feature2.channelWeights.ch1) < 0.01 &&
    Math.abs(feature1.channelWeights.ch2 - feature2.channelWeights.ch2) < 0.01 &&
    Math.abs(feature1.channelWeights.ch3 - feature2.channelWeights.ch3) < 0.01;
  const methodMatch = feature1.metadata.method === feature2.metadata.method;

  const consistent = dimensionMatch && weightMatch && methodMatch;

  const report = `
特征一致性验证：
- 维度匹配: ${dimensionMatch ? '✓' : '✗'} (${feature1.metadata.dimension} vs ${feature2.metadata.dimension})
- 权重匹配: ${weightMatch ? '✓' : '✗'} (ch1: ${feature1.channelWeights.ch1.toFixed(3)} vs ${feature2.channelWeights.ch1.toFixed(3)}, ch2: ${feature1.channelWeights.ch2.toFixed(3)} vs ${feature2.channelWeights.ch2.toFixed(3)}, ch3: ${feature1.channelWeights.ch3.toFixed(3)} vs ${feature2.channelWeights.ch3.toFixed(3)})
- 方法匹配: ${methodMatch ? '✓' : '✗'} (${feature1.metadata.method} vs ${feature2.metadata.method})
- 总体一致: ${consistent ? '✓ 一致' : '✗ 不一致'}
  `.trim();

  return {
    consistent,
    dimensionMatch,
    weightMatch,
    methodMatch,
    report,
  };
}

/**
 * 特征提取配置
 */
export interface FeatureExtractionConfig {
  method: 'unified-extraction'; // 提取方法
  normalizeFeatures: boolean; // 是否归一化
  useChannelWeights: boolean; // 是否使用通道权重
  dimension: number; // 特征维度
}

/**
 * 获取默认的特征提取配置
 */
export function getDefaultFeatureExtractionConfig(): FeatureExtractionConfig {
  return {
    method: 'unified-extraction',
    normalizeFeatures: true,
    useChannelWeights: true,
    dimension: 48, // 根据实际特征维度调整
  };
}

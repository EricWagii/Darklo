/**
 * 采集质量评分系统
 * 用于评估采集数据的一致性、能量稳定性、信号质量
 * 基于质量评分对相似度进行加权
 */

import { extractFullFeatures } from './dsp-processor';
import { EMGFeatures } from "./dsp-processor";

/**
 * 计算两个特征向量的余弦相似度
 */
function calculateCosineSimilarity(features1: number[] | EMGFeatures, features2: number[] | EMGFeatures): number {
  // ✅ 修复问题5：处理 EMGFeatures 类型
  const f1 = Array.isArray(features1) ? features1 : features1.fullFeature;
  const f2 = Array.isArray(features2) ? features2 : features2.fullFeature;
  if (f1.length !== f2.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < f1.length; i++) {
    dotProduct += f1[i] * f2[i];
    normA += f1[i] * f1[i];
    normB += f2[i] * f2[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  const cosineSimilarity = dotProduct / (normA * normB);
  return Math.max(0, cosineSimilarity * 100);
}

export interface CollectionQualityMetrics {
  consistency: number; // 0-1，与其他采集的相似度
  energyStability: number; // 0-1，能量稳定性
  signalQuality: number; // 0-1，信号质量
  overallScore: number; // 0-1，综合评分
  qualityLevel: 'excellent' | 'good' | 'fair' | 'poor'; // 质量等级
  recommendations: string[]; // 改进建议
}

/**
 * 计算采集的一致性评分
 * 基于与其他采集的相似度
 * @param collection 当前采集
 * @param otherCollections 其他采集
 * @returns 一致性评分 (0-1)
 */
export function calculateConsistency(
  collection: any,
  otherCollections: any[]
): number {
  if (otherCollections.length === 0) {
    return 0.5; // 没有其他采集时，默认返回0.5
  }

  try {
    const features = extractFullFeatures((collection.waveform || collection).ch1 || [], (collection.waveform || collection).ch2 || [], (collection.waveform || collection).ch3 || []);
    const similarities: number[] = [];

    for (const other of otherCollections) {
      const otherFeatures = extractFullFeatures((other.waveform || other).ch1 || [], (other.waveform || other).ch2 || [], (other.waveform || other).ch3 || []);
      // 使用余弦相似度计算
      const similarity = calculateCosineSimilarity(features, otherFeatures);
      similarities.push(similarity);
    }

    // 计算平均相似度
    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    
    // 将相似度转换为0-1的一致性评分
    // 相似度>70时为好的一致性
    return Math.min(1, avgSimilarity / 100);
  } catch (error) {
    console.warn('计算一致性时出错:', error);
    return 0.5;
  }
}

/**
 * 计算能量稳定性评分
 * 基于能量的变异系数
 * @param collection 采集数据
 * @returns 能量稳定性评分 (0-1)
 */
export function calculateEnergyStability(collection: number[]): number {
  try {
    // 计算三通道的能量
    const channelSize = Math.floor(collection.length / 3);
    const energies: number[] = [];

    for (let ch = 0; ch < 3; ch++) {
      const start = ch * channelSize;
      const end = (ch + 1) * channelSize;
      const channel = collection.slice(start, end);

      let energy = 0;
      for (const sample of channel) {
        energy += sample * sample;
      }
      energies.push(Math.sqrt(energy / channel.length));
    }

    // 计算能量的变异系数
    const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
    const variance = energies.reduce((sum, e) => sum + (e - avgEnergy) ** 2, 0) / energies.length;
    const stdDev = Math.sqrt(variance);
    const cv = avgEnergy > 0 ? stdDev / avgEnergy : 0;

    // 将变异系数转换为稳定性评分
    // CV < 0.1 为优秀，CV > 0.5 为较差
    return Math.max(0, Math.min(1, 1 - cv));
  } catch (error) {
    console.warn('计算能量稳定性时出错:', error);
    return 0.5;
  }
}

/**
 * 计算信号质量评分
 * 基于信噪比和频谱特性
 * @param collection 采集数据
 * @returns 信号质量评分 (0-1)
 */
export function calculateSignalQuality(collection: number[]): number {
  try {
    const channelSize = Math.floor(collection.length / 3);
    let totalSNR = 0;

    for (let ch = 0; ch < 3; ch++) {
      const start = ch * channelSize;
      const end = (ch + 1) * channelSize;
      const channel = collection.slice(start, end);

      // 计算信号功率
      let signalPower = 0;
      for (const sample of channel) {
        signalPower += sample * sample;
      }
      signalPower /= channel.length;

      // 计算噪声功率（使用相邻样本差异）
      let noisePower = 0;
      for (let i = 1; i < channel.length; i++) {
        const diff = channel[i] - channel[i - 1];
        noisePower += diff * diff;
      }
      noisePower /= (channel.length - 1);

      // 计算SNR
      const snr = noisePower > 0 ? signalPower / noisePower : 1;
      totalSNR += snr;
    }

    const avgSNR = totalSNR / 3;
    
    // 将SNR转换为质量评分
    // SNR > 10 为优秀，SNR < 1 为较差
    return Math.max(0, Math.min(1, Math.log(avgSNR + 1) / Math.log(11)));
  } catch (error) {
    console.warn('计算信号质量时出错:', error);
    return 0.5;
  }
}

/**
 * 计算采集的综合质量评分
 * @param collection 采集数据
 * @param otherCollections 其他采集（用于计算一致性）
 * @returns 质量指标
 */
export function calculateCollectionQuality(
  collection: number[],
  otherCollections: number[][] = []
): CollectionQualityMetrics {
  const consistency = calculateConsistency(collection, otherCollections);
  const energyStability = calculateEnergyStability(collection);
  const signalQuality = calculateSignalQuality(collection);

  // 计算综合评分（加权平均）
  const overallScore = 
    consistency * 0.4 +      // 一致性权重40%
    energyStability * 0.3 +  // 能量稳定性权重30%
    signalQuality * 0.3;     // 信号质量权重30%

  // 确定质量等级
  let qualityLevel: 'excellent' | 'good' | 'fair' | 'poor';
  if (overallScore >= 0.8) {
    qualityLevel = 'excellent';
  } else if (overallScore >= 0.6) {
    qualityLevel = 'good';
  } else if (overallScore >= 0.4) {
    qualityLevel = 'fair';
  } else {
    qualityLevel = 'poor';
  }

  // 生成改进建议
  const recommendations: string[] = [];
  if (consistency < 0.5) {
    recommendations.push('采集与其他样本差异较大，建议重新采集');
  }
  if (energyStability < 0.5) {
    recommendations.push('能量波动较大，建议保持稳定的肌肉收缩强度');
  }
  if (signalQuality < 0.5) {
    recommendations.push('信号质量较低，建议检查硬件连接或调整采集位置');
  }

  return {
    consistency,
    energyStability,
    signalQuality,
    overallScore,
    qualityLevel,
    recommendations,
  };
}

/**
 * 基于质量评分对相似度进行加权
 * @param similarity 原始相似度 (0-100)
 * @param qualityScore 质量评分 (0-1)
 * @returns 加权后的相似度 (0-100)
 */
export function applyQualityWeighting(
  similarity: number,
  qualityScore: number
): number {
  // 质量越低，相似度的权重越低
  // 质量评分0.5时，相似度保持不变
  // 质量评分1.0时，相似度提升20%
  // 质量评分0.0时，相似度降低50%
  const weightFactor = 0.5 + qualityScore;
  return similarity * weightFactor;
}

/**
 * 计算采集的质量加权相似度
 * @param testCollection 测试采集
 * @param referenceCollection 参考采集
 * @param testQualityScore 测试采集的质量评分
 * @param referenceQualityScore 参考采集的质量评分
 * @returns 加权后的相似度 (0-100)
 */
export function calculateQualityWeightedSimilarity(
  testCollection: any,
  referenceCollection: any,
  testQualityScore: number = 0.7,
  referenceQualityScore: number = 0.7
): number {
  try {
    const testFeatures = extractFullFeatures((testCollection?.waveform || testCollection)?.ch1 || [], (testCollection?.waveform || testCollection)?.ch2 || [], (testCollection?.waveform || testCollection)?.ch3 || []);
    const referenceFeatures = extractFullFeatures((referenceCollection?.waveform || referenceCollection)?.ch1 || [], (referenceCollection?.waveform || referenceCollection)?.ch2 || [], (referenceCollection?.waveform || referenceCollection)?.ch3 || []);
    const baseSimilarity = calculateCosineSimilarity(testFeatures, referenceFeatures);

    // 使用两个采集的平均质量评分进行加权
    const avgQualityScore = (testQualityScore + referenceQualityScore) / 2;
    return applyQualityWeighting(baseSimilarity, avgQualityScore);
  } catch (error) {
    console.warn('计算质量加权相似度时出错:', error);
    return 0;
  }
}

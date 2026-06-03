/**
 * 异常检测集成层 - 按照Claude指南实现
 * 
 * 流程：
 * 1. 提取每条波形的8维特征向量
 * 2. 计算每条波形到均值向量的马氏距离
 * 3. 使用IQR方法（Tukey fence）判定异常
 * 4. 返回异常列表和原因
 */

import { ProcessedWaveform } from './independent-cropping';
import {
  extractFusedFeatures,
  FeatureVector,
  computeFeatureStats,
  FeatureStats
} from './feature-extraction-v2';

export interface AnomalyInfo {
  index: number;
  reason: string;
  confidence: number;
  mahalanobisDistance: number;
  featureVector: FeatureVector;
}

export interface AnomalyDetectionReport {
  totalWaveforms: number;
  anomalies: AnomalyInfo[];
  threshold: number;
  method: 'iqr_mahalanobis';
  stats: {
    q1: number;
    q3: number;
    iqr: number;
    upperFence: number;
  };
}

/**
 * 计算马氏距离
 * 
 * 简化版本：使用对角协方差矩阵（各特征独立标准化）
 */
function computeMahalanobisDistance(
  feature: FeatureVector,
  mean: FeatureVector,
  stdDev: FeatureVector
): number {
  const featureKeys: (keyof FeatureVector)[] = [
    'rmsEnergy',
    'peakValue',
    'zeroCrossingRate',
    'spectralCentroid',
    'spectralBandwidth',
    'waveformSymmetry',
    'energyDistribution',
    'peakPosition'
  ];

  let distanceSquared = 0;

  for (const key of featureKeys) {
    const diff = feature[key] - mean[key];
    const std = stdDev[key] || 1; // 防止除零
    distanceSquared += (diff / std) * (diff / std);
  }

  return Math.sqrt(distanceSquared);
}

/**
 * 计算IQR和Tukey fence
 */
function computeIQRThreshold(distances: number[]): {
  q1: number;
  q3: number;
  iqr: number;
  upperFence: number;
} {
  const sorted = [...distances].sort((a, b) => a - b);
  const n = sorted.length;

  const q1Idx = Math.floor(n * 0.25);
  const q3Idx = Math.floor(n * 0.75);

  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  const iqr = q3 - q1;

  // Tukey fence: Q3 + 1.5 * IQR
  const upperFence = q3 + 1.5 * iqr;

  return { q1, q3, iqr, upperFence };
}

/**
 * 根据特征距离获取异常原因
 */
function getAnomalyReason(
  feature: FeatureVector,
  mean: FeatureVector,
  distance: number
): string {
  const featureKeys: (keyof FeatureVector)[] = [
    'rmsEnergy',
    'peakValue',
    'zeroCrossingRate',
    'spectralCentroid',
    'spectralBandwidth',
    'waveformSymmetry',
    'energyDistribution',
    'peakPosition'
  ];

  // 找出偏差最大的特征
  let maxDeviation = 0;
  let maxDeviationKey: keyof FeatureVector = 'rmsEnergy';

  for (const key of featureKeys) {
    const deviation = Math.abs(feature[key] - mean[key]);
    if (deviation > maxDeviation) {
      maxDeviation = deviation;
      maxDeviationKey = key;
    }
  }

  // 生成原因描述
  const reasonMap: Record<string, string> = {
    rmsEnergy: '能量显著偏高或偏低',
    peakValue: '峰值幅度异常',
    zeroCrossingRate: '过零率异常',
    spectralCentroid: '频谱中心偏移',
    spectralBandwidth: '频谱带宽异常',
    waveformSymmetry: '波形对称性异常',
    energyDistribution: '能量分布不均匀',
    peakPosition: '峰值位置异常'
  };

  return reasonMap[maxDeviationKey] || '波形特征偏差较大';
}

/**
 * 执行异常检测
 * 
 * 按照Claude指南的流程：
 * 1. 提取特征向量
 * 2. 计算均值和标准差
 * 3. 计算马氏距离
 * 4. 使用IQR判定异常
 */
export function detectAnomaliesUsingMahalanobis(
  processedWaveforms: ProcessedWaveform[]
): AnomalyDetectionReport {
  // 需要至少3条波形才能进行异常检测
  if (processedWaveforms.length < 3) {
    return {
      totalWaveforms: processedWaveforms.length,
      anomalies: [],
      threshold: 0,
      method: 'iqr_mahalanobis',
      stats: {
        q1: 0,
        q3: 0,
        iqr: 0,
        upperFence: 0
      }
    };
  }

  // 第一步：提取所有波形的特征向量
  const features: FeatureVector[] = processedWaveforms.map(wf =>
    extractFusedFeatures(wf.ch1, wf.ch2, wf.ch3)
  );

  // 第二步：计算均值和标准差
  const stats = computeFeatureStats(features);

  // 第三步：计算每条波形的马氏距离
  const distances = features.map(feature =>
    computeMahalanobisDistance(feature, stats.mean, stats.stdDev)
  );

  // 第四步：使用IQR判定异常
  const iqrStats = computeIQRThreshold(distances);

  // 第五步：识别异常波形
  const anomalies: AnomalyInfo[] = [];

  for (let i = 0; i < processedWaveforms.length; i++) {
    if (distances[i] > iqrStats.upperFence) {
      anomalies.push({
        index: i,
        reason: getAnomalyReason(features[i], stats.mean, distances[i]),
        confidence: Math.min(1, distances[i] / (iqrStats.upperFence * 2)), // 归一化置信度
        mahalanobisDistance: distances[i],
        featureVector: features[i]
      });
    }
  }

  return {
    totalWaveforms: processedWaveforms.length,
    anomalies,
    threshold: iqrStats.upperFence,
    method: 'iqr_mahalanobis',
    stats: iqrStats
  };
}

/**
 * 生成异常检测报告的人类可读描述
 */
export function formatAnomalyReport(report: AnomalyDetectionReport): string {
  if (report.anomalies.length === 0) {
    return `✅ 所有${report.totalWaveforms}条波形都通过了异常检测`;
  }

  const lines = [
    `⚠️ 检测到${report.anomalies.length}条异常波形（共${report.totalWaveforms}条）`,
    `阈值: ${report.stats.upperFence.toFixed(2)}`
  ];

  for (const anomaly of report.anomalies) {
    lines.push(
      `  第${anomaly.index + 1}条: ${anomaly.reason} (距离: ${anomaly.mahalanobisDistance.toFixed(2)})`
    );
  }

  return lines.join('\n');
}

/**
 * 删除异常波形后返回新的列表
 */
export function removeAnomalousWaveforms(
  processedWaveforms: ProcessedWaveform[],
  anomalies: AnomalyInfo[]
): ProcessedWaveform[] {
  const anomalyIndices = new Set(anomalies.map(a => a.index));
  return processedWaveforms.filter((_, idx) => !anomalyIndices.has(idx));
}

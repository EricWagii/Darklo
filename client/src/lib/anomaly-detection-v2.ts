/**
 * 异常检测 V2 - 基于IQR和Mahalanobis距离
 * 
 * 用于在保存时检测异常波形
 */

import {
  extractFusedFeatures,
  computeFeatureDistance,
  computeFeatureStats,
  FeatureVector,
  FeatureStats
} from './feature-extraction-v2';

export interface AnomalyDetectionResult {
  index: number;
  isAnomaly: boolean;
  score: number;           // 异常评分（0-100）
  reason: string;          // 异常原因
  confidence: number;      // 置信度（0-1）
}

export interface AnomalyDetectionReport {
  totalWaveforms: number;
  anomalousCount: number;
  anomalies: AnomalyDetectionResult[];
  threshold: number;
  method: 'iqr' | 'mahalanobis' | 'combined';
}

/**
 * 计算IQR（四分位数范围）
 */
function computeIQR(values: number[]): { q1: number; q3: number; iqr: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  const q1Idx = Math.floor(n * 0.25);
  const q3Idx = Math.floor(n * 0.75);
  
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  const iqr = q3 - q1;
  
  return { q1, q3, iqr };
}

/**
 * 基于IQR的异常检测
 */
export function detectAnomaliesByIQR(
  features: FeatureVector[],
  multiplier: number = 1.5
): AnomalyDetectionResult[] {
  if (features.length < 4) {
    // 样本太少，无法进行IQR检测
    return [];
  }
  
  const results: AnomalyDetectionResult[] = [];
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
  
  // 为每个样本计算异常评分
  for (let i = 0; i < features.length; i++) {
    let anomalyScore = 0;
    let anomalyCount = 0;
    const anomalyReasons: string[] = [];
    
    for (const key of featureKeys) {
      const value = features[i][key];
      
      // 提取此特征的所有值
      const featureValues = features.map(f => f[key]);
      const { q1, q3, iqr } = computeIQR(featureValues);
      
      // 计算IQR上下界
      const lowerBound = q1 - multiplier * iqr;
      const upperBound = q3 + multiplier * iqr;
      
      // 检查是否超出边界
      if (value < lowerBound || value > upperBound) {
        anomalyScore += Math.abs((value - q3) / (iqr + 1e-6));
        anomalyCount++;
        anomalyReasons.push(`${key}: 值=${value.toFixed(2)}, 边界=[${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`);
      }
    }
    
    const isAnomaly = anomalyCount >= 2; // 至少–2个特征异常
    const confidence = Math.min(1, anomalyCount / featureKeys.length);
    
    results.push({
      index: i,
      isAnomaly,
      score: Math.min(100, anomalyScore * 10),
      reason: anomalyReasons.length > 0 ? anomalyReasons.join('; ') : '正常',
      confidence
    });
  }
  
  return results;
}

/**
 * 计算Mahalanobis距离
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
  
  let sumSquaredDiff = 0;
  
  for (const key of featureKeys) {
    const diff = feature[key] - mean[key];
    const variance = stdDev[key] * stdDev[key];
    
    if (variance > 0) {
      sumSquaredDiff += (diff * diff) / variance;
    }
  }
  
  return Math.sqrt(sumSquaredDiff);
}

/**
 * 基于Mahalanobis距离的异常检测
 */
export function detectAnomaliesByMahalanobis(
  features: FeatureVector[],
  threshold: number = 3.0
): AnomalyDetectionResult[] {
  if (features.length < 2) {
    return [];
  }
  
  const stats = computeFeatureStats(features);
  const results: AnomalyDetectionResult[] = [];
  
  for (let i = 0; i < features.length; i++) {
    const distance = computeMahalanobisDistance(features[i], stats.mean, stats.stdDev);
    const isAnomaly = distance > threshold;
    
    results.push({
      index: i,
      isAnomaly,
      score: Math.min(100, distance * 10),
      reason: isAnomaly ? `Mahalanobis距离过大: ${distance.toFixed(2)}` : '正常',
      confidence: Math.min(1, distance / threshold)
    });
  }
  
  return results;
}

/**
 * 组合异常检测（IQR + Mahalanobis）
 */
export function detectAnomalies(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  method: 'iqr' | 'mahalanobis' | 'combined' = 'combined'
): AnomalyDetectionReport {
  if (waveforms.length === 0) {
    return {
      totalWaveforms: 0,
      anomalousCount: 0,
      anomalies: [],
      threshold: 0,
      method
    };
  }
  
  // 提取所有波形的特征
  const features = waveforms.map(wf => extractFusedFeatures(wf.ch1, wf.ch2, wf.ch3));
  
  let anomalies: AnomalyDetectionResult[] = [];
  let threshold = 0;
  
  if (method === 'iqr') {
    anomalies = detectAnomaliesByIQR(features);
    threshold = 3; // z-score threshold
  } else if (method === 'mahalanobis') {
    anomalies = detectAnomaliesByMahalanobis(features);
    threshold = 3; // Mahalanobis distance threshold
  } else {
    // 组合方法：两种方法都检测到异常才认为是异常
    const iqrResults = detectAnomaliesByIQR(features);
    const mahResults = detectAnomaliesByMahalanobis(features);
    
    // 合并结果
    anomalies = iqrResults.map((iqr, idx) => {
      const mah = mahResults[idx];
      const isAnomaly = iqr.isAnomaly && mah.isAnomaly;
      
      return {
        index: idx,
        isAnomaly,
        score: (iqr.score + mah.score) / 2,
        reason: isAnomaly ? `${iqr.reason} | ${mah.reason}` : '正常',
        confidence: (iqr.confidence + mah.confidence) / 2
      };
    });
    
    threshold = 3;
  }
  
  const anomalousCount = anomalies.filter(a => a.isAnomaly).length;
  
  return {
    totalWaveforms: waveforms.length,
    anomalousCount,
    anomalies,
    threshold,
    method
  };
}

/**
 * 获取异常检测报告的摘要
 */
export function getAnomalyDetectionSummary(report: AnomalyDetectionReport): string {
  if (report.anomalousCount === 0) {
    return `✓ 检测完成：${report.totalWaveforms}条波形全部正常`;
  }
  
  return `⚠ 检测到${report.anomalousCount}条异常波形（共${report.totalWaveforms}条）`;
}

/**
 * 获取异常波形的详细描述
 */
export function getAnomalyDescription(result: AnomalyDetectionResult): string {
  const scoreLevel = result.score < 30 ? '轻微' : result.score < 60 ? '中等' : '严重';
  return `第${result.index + 1}条：${scoreLevel}异常（评分${result.score.toFixed(0)}/100）- ${result.reason}`;
}

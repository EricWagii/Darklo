/**
 * 电极状态检测模块
 * 
 * 功能：
 * - 采集电极基准信号
 * - 实时检测电极状态
 * - 与基准对比并评估
 */

import { computeFFT, SpectrumAnalysis } from './fft-analysis';

export interface ElectrodeSignalStats {
  ch1Mean: number;
  ch1Std: number;
  ch2Mean: number;
  ch2Std: number;
  ch3Mean: number;
  ch3Std: number;
}

export interface ElectrodeDetectionResult {
  status: 'good' | 'fair' | 'poor';
  score: number; // 0-100
  issues: string[];
  recommendations: string[];
  details: {
    ch1Similarity: number;
    ch2Similarity: number;
    ch3Similarity: number;
    frequencyMatch: number;
    snrMatch: number;
  };
}

/**
 * 计算信号的统计特征
 */
export function calculateSignalStats(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): ElectrodeSignalStats {
  const calculateStats = (values: number[]) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    return { mean, std };
  };

  const ch1Stats = calculateStats(ch1);
  const ch2Stats = calculateStats(ch2);
  const ch3Stats = calculateStats(ch3);

  return {
    ch1Mean: ch1Stats.mean,
    ch1Std: ch1Stats.std,
    ch2Mean: ch2Stats.mean,
    ch2Std: ch2Stats.std,
    ch3Mean: ch3Stats.mean,
    ch3Std: ch3Stats.std,
  };
}

/**
 * 计算两个统计特征的相似度（0-100）
 */
function calculateSimilarity(
  baseline: ElectrodeSignalStats,
  current: ElectrodeSignalStats
): { ch1: number; ch2: number; ch3: number } {
  const calculateChannelSimilarity = (
    baselineMean: number,
    baselineStd: number,
    currentMean: number,
    currentStd: number
  ): number => {
    // 均值差异（允许 ±20% 偏差）
    const meanDiff = Math.abs(currentMean - baselineMean) / (Math.abs(baselineMean) + 1);
    const meanScore = Math.max(0, 100 - meanDiff * 500); // 20% 差异 = 0 分

    // 标准差差异（允许 ±30% 偏差）
    const stdDiff = Math.abs(currentStd - baselineStd) / (Math.abs(baselineStd) + 1);
    const stdScore = Math.max(0, 100 - stdDiff * 333); // 30% 差异 = 0 分

    // 综合评分
    return (meanScore * 0.6 + stdScore * 0.4);
  };

  return {
    ch1: calculateChannelSimilarity(
      baseline.ch1Mean,
      baseline.ch1Std,
      current.ch1Mean,
      current.ch1Std
    ),
    ch2: calculateChannelSimilarity(
      baseline.ch2Mean,
      baseline.ch2Std,
      current.ch2Mean,
      current.ch2Std
    ),
    ch3: calculateChannelSimilarity(
      baseline.ch3Mean,
      baseline.ch3Std,
      current.ch3Mean,
      current.ch3Std
    ),
  };
}

/**
 * 检测电极状态
 */
export function detectElectrodeStatus(
  currentCh1: number[],
  currentCh2: number[],
  currentCh3: number[],
  baselineStats: ElectrodeSignalStats,
  baselineSpectrum?: SpectrumAnalysis
): ElectrodeDetectionResult {
  const currentStats = calculateSignalStats(currentCh1, currentCh2, currentCh3);
  const similarity = calculateSimilarity(baselineStats, currentStats);

  // 计算频谱相似度
  let frequencyMatch = 50; // 默认值
  let snrMatch = 50;

  if (baselineSpectrum && currentCh2.length >= 128) {
    try {
      const currentSpectrum = computeFFT(currentCh2, 250);

      // 主要频率匹配
      const freqDiff = Math.abs(
        currentSpectrum.dominantFrequency - baselineSpectrum.dominantFrequency
      );
      frequencyMatch = Math.max(0, 100 - (freqDiff / 50) * 100); // 50 Hz 差异 = 0 分

      // SNR 匹配
      const snrDiff = Math.abs(currentSpectrum.snr - baselineSpectrum.snr);
      snrMatch = Math.max(0, 100 - (snrDiff / 10) * 100); // 10 dB 差异 = 0 分
    } catch (err) {
      console.error('频谱计算失败:', err);
    }
  }

  // 综合评分
  const overallScore = (
    similarity.ch1 * 0.25 +
    similarity.ch2 * 0.4 + // CH2 权重最高（主信号）
    similarity.ch3 * 0.15 +
    frequencyMatch * 0.1 +
    snrMatch * 0.1
  );

  // 识别问题
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (similarity.ch1 < 60) {
    issues.push('CH1 信号异常（原始 ADC）');
    recommendations.push('检查电极接触是否良好');
  }

  if (similarity.ch2 < 60) {
    issues.push('CH2 信号异常（主肌电信号）');
    recommendations.push('调整电极位置，确保与肌肉充分接触');
  }

  if (similarity.ch3 < 60) {
    issues.push('CH3 信号异常（包络信号）');
    recommendations.push('检查电极是否松动或接触不良');
  }

  if (frequencyMatch < 60) {
    issues.push('主要频率偏离基准');
    recommendations.push('检查电极位置是否移动');
  }

  if (snrMatch < 60) {
    issues.push('信噪比下降');
    recommendations.push('清洁电极和皮肤接触面，确保接触质量');
  }

  // 判断电极状态
  let status: 'good' | 'fair' | 'poor' = 'good';
  if (overallScore < 70) {
    status = 'poor';
  } else if (overallScore < 85) {
    status = 'fair';
  }

  return {
    status,
    score: Math.round(overallScore),
    issues,
    recommendations,
    details: {
      ch1Similarity: Math.round(similarity.ch1),
      ch2Similarity: Math.round(similarity.ch2),
      ch3Similarity: Math.round(similarity.ch3),
      frequencyMatch: Math.round(frequencyMatch),
      snrMatch: Math.round(snrMatch),
    },
  };
}

/**
 * 评估电极状态是否可以开始采集或测试
 */
export function isElectrodeStatusAcceptable(
  result: ElectrodeDetectionResult,
  threshold: number = 75 // 默认阈值 75%
): boolean {
  return result.score >= threshold;
}

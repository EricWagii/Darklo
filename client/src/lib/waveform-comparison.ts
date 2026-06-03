/**
 * 波形对比分析模块
 * 
 * 功能：
 * - 计算两个波形的相似度
 * - 分析波形差异
 * - 生成对比报告
 */

export interface WaveformStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  rms: number;
  peakToPeak: number;
}

export interface ComparisonResult {
  similarity: number; // 0-100，相似度百分比
  correlation: number; // 相关系数
  rmsDifference: number; // 均方根差
  stats1: WaveformStats;
  stats2: WaveformStats;
  differences: {
    meanDiff: number;
    stdDiff: number;
    peakDiff: number;
  };
}

/**
 * 计算单个波形的统计特征
 */
export function calculateWaveformStats(waveform: number[]): WaveformStats {
  if (waveform.length === 0) {
    return {
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      rms: 0,
      peakToPeak: 0,
    };
  }

  // 均值
  const mean = waveform.reduce((a, b) => a + b, 0) / waveform.length;

  // 标准差
  const variance = waveform.reduce((a, b) => a + (b - mean) ** 2, 0) / waveform.length;
  const std = Math.sqrt(variance);

  // 最小值和最大值
  const min = Math.min(...waveform);
  const max = Math.max(...waveform);

  // 均方根
  const rms = Math.sqrt(waveform.reduce((a, b) => a + b ** 2, 0) / waveform.length);

  // 峰峰值
  const peakToPeak = max - min;

  return {
    mean,
    std,
    min,
    max,
    rms,
    peakToPeak,
  };
}

/**
 * 计算两个波形的相关系数
 */
function calculateCorrelation(waveform1: number[], waveform2: number[]): number {
  const minLen = Math.min(waveform1.length, waveform2.length);
  if (minLen === 0) return 0;

  const w1 = waveform1.slice(0, minLen);
  const w2 = waveform2.slice(0, minLen);

  const mean1 = w1.reduce((a, b) => a + b, 0) / minLen;
  const mean2 = w2.reduce((a, b) => a + b, 0) / minLen;

  let numerator = 0;
  let denominator1 = 0;
  let denominator2 = 0;

  for (let i = 0; i < minLen; i++) {
    const diff1 = w1[i] - mean1;
    const diff2 = w2[i] - mean2;
    numerator += diff1 * diff2;
    denominator1 += diff1 ** 2;
    denominator2 += diff2 ** 2;
  }

  const denominator = Math.sqrt(denominator1 * denominator2);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * 计算两个波形的均方根差
 */
function calculateRMSDifference(waveform1: number[], waveform2: number[]): number {
  const minLen = Math.min(waveform1.length, waveform2.length);
  if (minLen === 0) return 0;

  let sumSquaredDiff = 0;
  for (let i = 0; i < minLen; i++) {
    const diff = waveform1[i] - waveform2[i];
    sumSquaredDiff += diff ** 2;
  }

  return Math.sqrt(sumSquaredDiff / minLen);
}

/**
 * 对比两个波形
 */
export function compareWaveforms(waveform1: number[], waveform2: number[]): ComparisonResult {
  const stats1 = calculateWaveformStats(waveform1);
  const stats2 = calculateWaveformStats(waveform2);

  // 计算相关系数
  const correlation = calculateCorrelation(waveform1, waveform2);

  // 计算均方根差
  const rmsDifference = calculateRMSDifference(waveform1, waveform2);

  // 计算统计特征的差异
  const meanDiff = Math.abs(stats1.mean - stats2.mean);
  const stdDiff = Math.abs(stats1.std - stats2.std);
  const peakDiff = Math.abs(stats1.peakToPeak - stats2.peakToPeak);

  // 计算相似度（0-100）
  // 基于相关系数和标准化的差异
  const correlationScore = Math.max(0, (correlation + 1) / 2 * 100); // -1到1转换为0到100

  // 标准化差异评分
  const maxMeanDiff = Math.max(Math.abs(stats1.mean), Math.abs(stats2.mean), 1);
  const maxStdDiff = Math.max(stats1.std, stats2.std, 1);
  const maxPeakDiff = Math.max(stats1.peakToPeak, stats2.peakToPeak, 1);

  const meanDiffScore = Math.max(0, 100 - (meanDiff / maxMeanDiff) * 100);
  const stdDiffScore = Math.max(0, 100 - (stdDiff / maxStdDiff) * 100);
  const peakDiffScore = Math.max(0, 100 - (peakDiff / maxPeakDiff) * 100);

  // 综合相似度
  const similarity = (
    correlationScore * 0.5 +
    meanDiffScore * 0.2 +
    stdDiffScore * 0.15 +
    peakDiffScore * 0.15
  );

  return {
    similarity: Math.round(similarity),
    correlation: Math.round(correlation * 100) / 100,
    rmsDifference: Math.round(rmsDifference * 100) / 100,
    stats1,
    stats2,
    differences: {
      meanDiff: Math.round(meanDiff * 100) / 100,
      stdDiff: Math.round(stdDiff * 100) / 100,
      peakDiff: Math.round(peakDiff * 100) / 100,
    },
  };
}

/**
 * 对比多个波形，返回相似度矩阵
 */
export function compareMultipleWaveforms(
  waveforms: number[][]
): { similarities: number[][]; averageSimilarity: number } {
  const n = waveforms.length;
  const similarities: number[][] = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));

  let totalSimilarity = 0;
  let comparisons = 0;

  for (let i = 0; i < n; i++) {
    similarities[i][i] = 100; // 自己与自己的相似度为100
    for (let j = i + 1; j < n; j++) {
      const result = compareWaveforms(waveforms[i], waveforms[j]);
      similarities[i][j] = result.similarity;
      similarities[j][i] = result.similarity;
      totalSimilarity += result.similarity;
      comparisons++;
    }
  }

  const averageSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;

  return {
    similarities,
    averageSimilarity: Math.round(averageSimilarity),
  };
}

/**
 * 生成对比报告
 */
export function generateComparisonReport(
  name1: string,
  name2: string,
  result: ComparisonResult
): string {
  const lines = [
    `波形对比报告：${name1} vs ${name2}`,
    ``,
    `📊 相似度指标`,
    `相似度：${result.similarity}%`,
    `相关系数：${result.correlation}`,
    `均方根差：${result.rmsDifference}`,
    ``,
    `📈 波形 1 统计特征`,
    `均值：${Math.round(result.stats1.mean * 100) / 100}`,
    `标准差：${Math.round(result.stats1.std * 100) / 100}`,
    `最小值：${Math.round(result.stats1.min * 100) / 100}`,
    `最大值：${Math.round(result.stats1.max * 100) / 100}`,
    `均方根：${Math.round(result.stats1.rms * 100) / 100}`,
    `峰峰值：${Math.round(result.stats1.peakToPeak * 100) / 100}`,
    ``,
    `📈 波形 2 统计特征`,
    `均值：${Math.round(result.stats2.mean * 100) / 100}`,
    `标准差：${Math.round(result.stats2.std * 100) / 100}`,
    `最小值：${Math.round(result.stats2.min * 100) / 100}`,
    `最大值：${Math.round(result.stats2.max * 100) / 100}`,
    `均方根：${Math.round(result.stats2.rms * 100) / 100}`,
    `峰峰值：${Math.round(result.stats2.peakToPeak * 100) / 100}`,
    ``,
    `📊 差异分析`,
    `均值差异：${result.differences.meanDiff}`,
    `标准差差异：${result.differences.stdDiff}`,
    `峰峰值差异：${result.differences.peakDiff}`,
  ];

  return lines.join('\n');
}

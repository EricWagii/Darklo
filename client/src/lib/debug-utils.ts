/**
 * DEBUG页面的工具函数库
 */

/**
 * 计算能量分布
 * 使用滑动窗口方法计算每个样本的能量
 */
export function calculateEnergyDistribution(
  waveform: number[],
  windowSize: number = 10
): number[] {
  const energy: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < waveform.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(waveform.length, i + halfWindow);
    
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += waveform[j] * waveform[j];
    }
    
    energy.push(Math.sqrt(sum / (end - start)));
  }

  return energy;
}

/**
 * 计算时长（毫秒）
 */
export function calculateDuration(
  sampleCount: number,
  samplingRate: number = 500
): number {
  return (sampleCount / samplingRate) * 1000;
}

/**
 * 计算能量阈值（使用中位数 + 标准差）
 */
export function calculateEnergyThreshold(energy: number[]): {
  threshold: number;
  median: number;
  stdDev: number;
} {
  // 计算中位数
  const sorted = [...energy].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // 计算标准差
  const mean = energy.reduce((a, b) => a + b, 0) / energy.length;
  const variance = energy.reduce((a, b) => a + (b - mean) ** 2, 0) / energy.length;
  const stdDev = Math.sqrt(variance);

  // 阈值 = 中位数 + 0.5 * 标准差
  const threshold = median + 0.5 * stdDev;

  return { threshold, median, stdDev };
}

/**
 * 检测有效段（能量高于阈值的区间）
 */
export function detectValidSegment(
  energy: number[],
  threshold: number,
  minLength: number = 50
): { start: number; end: number; confidence: number } {
  let start = -1;
  let end = -1;

  // 找到第一个高于阈值的样本
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > threshold) {
      start = i;
      break;
    }
  }

  // 找到最后一个高于阈值的样本
  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > threshold) {
      end = i;
      break;
    }
  }

  // 如果找不到有效段或长度太短
  if (start === -1 || end === -1 || end - start < minLength) {
    return { start: 0, end: energy.length, confidence: 0 };
  }

  // 计算置信度（有效段内高于阈值的比例）
  let count = 0;
  for (let i = start; i <= end; i++) {
    if (energy[i] > threshold) {
      count++;
    }
  }
  const confidence = count / (end - start + 1);

  return { start, end, confidence };
}

/**
 * 检测峰值
 */
export function detectPeaks(
  energy: number[],
  threshold: number,
  minDistance: number = 50
): Array<{ index: number; value: number }> {
  const peaks: Array<{ index: number; value: number }> = [];

  for (let i = 1; i < energy.length - 1; i++) {
    // 检查是否是局部最大值且高于阈值
    if (energy[i] > energy[i - 1] && energy[i] > energy[i + 1] && energy[i] > threshold) {
      // 检查与前一个峰值的距离
      if (peaks.length === 0 || i - peaks[peaks.length - 1].index >= minDistance) {
        peaks.push({ index: i, value: energy[i] });
      }
    }
  }

  return peaks;
}

/**
 * 格式化时长显示
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 计算百分比变化
 */
export function calculatePercentageChange(original: number, changed: number): number {
  if (original === 0) return 0;
  return ((changed - original) / original) * 100;
}

/**
 * 规范化波形到指定长度
 */
export function normalizeWaveform(
  waveform: number[],
  targetLength: number
): number[] {
  if (waveform.length === targetLength) {
    return waveform;
  }

  const normalized: number[] = [];
  const ratio = waveform.length / targetLength;

  for (let i = 0; i < targetLength; i++) {
    const index = Math.floor(i * ratio);
    normalized.push(waveform[Math.min(index, waveform.length - 1)]);
  }

  return normalized;
}

/**
 * 计算两个波形的相关性
 */
export function calculateCorrelation(waveform1: number[], waveform2: number[]): number {
  if (waveform1.length === 0 || waveform2.length === 0) {
    return 0;
  }

  // 规范化到相同长度
  const length = Math.min(waveform1.length, waveform2.length);
  const w1 = waveform1.slice(0, length);
  const w2 = waveform2.slice(0, length);

  // 计算均值
  const mean1 = w1.reduce((a, b) => a + b, 0) / length;
  const mean2 = w2.reduce((a, b) => a + b, 0) / length;

  // 计算相关系数
  let numerator = 0;
  let sum1 = 0;
  let sum2 = 0;

  for (let i = 0; i < length; i++) {
    const diff1 = w1[i] - mean1;
    const diff2 = w2[i] - mean2;
    numerator += diff1 * diff2;
    sum1 += diff1 * diff1;
    sum2 += diff2 * diff2;
  }

  const denominator = Math.sqrt(sum1 * sum2);
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

/**
 * 计算质量评分
 */
export function calculateQualityScore(
  energy: number[],
  validSegmentLength: number,
  peakCount: number,
  confidence: number
): { score: number; reason: string } {
  let score = 100;
  const reasons: string[] = [];

  // 检查有效长度
  if (validSegmentLength < 100) {
    score -= 30;
    reasons.push('信号过短');
  } else if (validSegmentLength < 200) {
    score -= 15;
    reasons.push('信号较短');
  }

  // 检查置信度
  if (confidence < 0.3) {
    score -= 25;
    reasons.push('置信度低');
  } else if (confidence < 0.5) {
    score -= 10;
    reasons.push('置信度一般');
  }

  // 检查峰值数
  if (peakCount === 0) {
    score -= 20;
    reasons.push('未检测到峰值');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(', ') : '质量良好',
  };
}

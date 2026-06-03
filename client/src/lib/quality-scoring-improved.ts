/**
 * 改进的质量评分算法
 * 
 * 设计原则：
 * - 采集是为了获取特征相似的数据，用于后续测试比对
 * - 评分标准应该严格，有明显的区分度
 * - 重点关注能量一致性（与其他采集的相似度）
 * - 关注信号强度和波形变化性
 */

export interface ImprovedQualityScore {
  overallScore: number; // 0-100
  energyConsistency: number; // 与其他采集的能量一致性（0-100）
  signalStrength: number; // 信号强度（0-100）
  variability: number; // 波形变化性（0-100）
  isOutlier: boolean; // 是否为异常采集
  recommendation: string; // 建议
  details: {
    energyRange: { min: number; max: number };
    peakAmplitude: number;
    noiseLevel: number;
  };
}

/**
 * 计算信号强度（基于 RMS）
 */
function calculateSignalStrength(signal: number[]): number {
  if (signal.length === 0) return 0;
  const rms = Math.sqrt(
    signal.reduce((sum, val) => sum + val * val, 0) / signal.length
  );
  return rms;
}

/**
 * 计算信号变化性（基于梯度）
 */
function calculateVariability(signal: number[]): number {
  if (signal.length < 2) return 0;
  
  let totalDiff = 0;
  for (let i = 1; i < signal.length; i++) {
    totalDiff += Math.abs(signal[i] - signal[i - 1]);
  }
  
  const avgDiff = totalDiff / (signal.length - 1);
  return avgDiff;
}

/**
 * 计算信号的能量范围
 */
function calculateEnergyRange(signal: number[]): { min: number; max: number } {
  if (signal.length === 0) return { min: 0, max: 0 };
  
  let min = signal[0];
  let max = signal[0];
  
  for (let i = 1; i < signal.length; i++) {
    if (signal[i] < min) min = signal[i];
    if (signal[i] > max) max = signal[i];
  }
  
  return { min: Math.abs(min), max: Math.abs(max) };
}

/**
 * 计算噪声水平（使用高频分量估计）
 */
function estimateNoiseLevel(signal: number[]): number {
  if (signal.length < 3) return 0;
  
  // 计算相邻差分的标准差作为噪声估计
  const diffs: number[] = [];
  for (let i = 1; i < signal.length; i++) {
    diffs.push(signal[i] - signal[i - 1]);
  }
  
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((sum, val) => sum + (val - mean) ** 2, 0) / diffs.length;
  
  return Math.sqrt(variance);
}

/**
 * 改进的质量评分计算
 * 
 * 评分标准（修复版本 - 提高区分度）：
 * - 能量一致性（50%权重）：与其他采集的相似度，允许 ±20% 偏差
 * - 信号强度（25%权重）：信号是否足够强，需达到最大强度的 50% 以上
 * - 波形变化性（25%权重）：是否有足够的波形变化，需达到最大变化性的 40% 以上
 */
export function calculateImprovedQualityScore(
  signal: number[],
  allCollections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  collectionIndex: number
): ImprovedQualityScore {
  // 计算当前采集的特征
  const strength = calculateSignalStrength(signal);
  const variability = calculateVariability(signal);
  const energyRange = calculateEnergyRange(signal);
  const noiseLevel = estimateNoiseLevel(signal);

  // 计算所有采集的平均强度和变化性
  const allStrengths = allCollections.map((col) =>
    calculateSignalStrength(col.ch2)
  );
  const avgStrength = allStrengths.reduce((a, b) => a + b, 0) / allStrengths.length;
  const maxStrength = Math.max(...allStrengths);

  const allVariabilities = allCollections.map((col) =>
    calculateVariability(col.ch2)
  );
  const avgVariability = allVariabilities.reduce((a, b) => a + b, 0) / allVariabilities.length;
  const maxVariability = Math.max(...allVariabilities);

  // 1. 能量一致性评分（与其他采集的相似度）
  // 计算当前采集与平均采集的相似度
  const strengthRatio = avgStrength > 0 ? strength / avgStrength : 1;
  const variabilityRatio = avgVariability > 0 ? variability / avgVariability : 1;

  // 修复：严格的一致性检查
  // 允许 ±20% 的偏差，超出此范围则降低评分
  let energyConsistency = 100;
  
  // 信号强度一致性（权重 60%）
  if (strengthRatio < 0.8 || strengthRatio > 1.2) {
    energyConsistency -= Math.abs(strengthRatio - 1) * 100 * 0.6;  // 更严格的惩罚
  }
  
  // 波形变化性一致性（权重 40%）
  if (variabilityRatio < 0.8 || variabilityRatio > 1.2) {
    energyConsistency -= Math.abs(variabilityRatio - 1) * 100 * 0.4;  // 更严格的惩罚
  }
  
  energyConsistency = Math.max(0, Math.min(100, energyConsistency));

  // 2. 信号强度评分
  // 修复：更严格的强度评分
  let signalStrengthScore = 100;
  if (maxStrength > 0) {
    const strengthPercentage = (strength / maxStrength) * 100;
    
    // 严格的评分标准：
    // 90-100%: 100 分
    // 70-90%: 80-100 分
    // 50-70%: 60-80 分
    // 30-50%: 40-60 分
    // 10-30%: 20-40 分
    // <10%: <20 分
    if (strengthPercentage >= 90) {
      signalStrengthScore = 100;
    } else if (strengthPercentage >= 70) {
      signalStrengthScore = 80 + (strengthPercentage - 70) / 20 * 20;  // 80-100
    } else if (strengthPercentage >= 50) {
      signalStrengthScore = 60 + (strengthPercentage - 50) / 20 * 20;  // 60-80
    } else if (strengthPercentage >= 30) {
      signalStrengthScore = 40 + (strengthPercentage - 30) / 20 * 20;  // 40-60
    } else if (strengthPercentage >= 10) {
      signalStrengthScore = 20 + (strengthPercentage - 10) / 20 * 20;  // 20-40
    } else {
      signalStrengthScore = strengthPercentage * 2;  // 0-20
    }
  }

  // 3. 波形变化性评分
  // 修复：更严格的变化性评分
  let variabilityScore = 100;
  if (maxVariability > 0) {
    const variabilityPercentage = (variability / maxVariability) * 100;
    
    // 严格的评分标准：
    // 80-100%: 100 分
    // 60-80%: 80-100 分
    // 40-60%: 60-80 分
    // 20-40%: 40-60 分
    // 10-20%: 20-40 分
    // <10%: <20 分
    if (variabilityPercentage >= 80) {
      variabilityScore = 100;
    } else if (variabilityPercentage >= 60) {
      variabilityScore = 80 + (variabilityPercentage - 60) / 20 * 20;  // 80-100
    } else if (variabilityPercentage >= 40) {
      variabilityScore = 60 + (variabilityPercentage - 40) / 20 * 20;  // 60-80
    } else if (variabilityPercentage >= 20) {
      variabilityScore = 40 + (variabilityPercentage - 20) / 20 * 20;  // 40-60
    } else if (variabilityPercentage >= 10) {
      variabilityScore = 20 + (variabilityPercentage - 10) / 10 * 20;  // 20-40
    } else {
      variabilityScore = variabilityPercentage * 2;  // 0-20
    }
  }

  // 4. 检测异常采集
  // 修复：更严格的异常检测标准
  let isOutlier = false;
  let recommendation = '✓ 质量良好';

  // 综合评分
  const overallScoreTmp = Math.round(
    energyConsistency * 0.5 + signalStrengthScore * 0.25 + variabilityScore * 0.25
  );

  if (overallScoreTmp < 40) {
    isOutlier = true;
    recommendation = '⚠ 质量不佳，强烈建议重录';
  } else if (overallScoreTmp < 60) {
    isOutlier = true;
    recommendation = '⚠ 质量较差，建议重录';
  } else if (overallScoreTmp < 75) {
    recommendation = '△ 质量一般，可考虑重录';
  } else if (overallScoreTmp < 85) {
    recommendation = '✓ 质量良好';
  } else {
    recommendation = '✓ 质量优秀';
  }

  // 5. 综合评分
  // 权重：能量一致性 50%，信号强度 25%，波形变化性 25%
  const overallScore = Math.round(
    energyConsistency * 0.5 + signalStrengthScore * 0.25 + variabilityScore * 0.25
  );
  
  // 调试信息：输出各个子评分
  console.log(`[质量评分] 能量一致性: ${Math.round(energyConsistency)}, 信号强度: ${Math.round(signalStrengthScore)}, 波形变化: ${Math.round(variabilityScore)}, 综合: ${overallScore}`);

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    energyConsistency: Math.round(energyConsistency),
    signalStrength: Math.round(signalStrengthScore),
    variability: Math.round(variabilityScore),
    isOutlier,
    recommendation,
    details: {
      energyRange,
      peakAmplitude: energyRange.max,
      noiseLevel: Math.round(noiseLevel * 100) / 100,
    },
  };
}

/**
 * 批量评估所有采集
 */
export function evaluateAllCollectionsImproved(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): ImprovedQualityScore[] {
  return collections.map((col, idx) =>
    calculateImprovedQualityScore(col.ch2, collections, idx)
  );
}

/**
 * 获取评分统计信息
 */
export function getQualityStatistics(scores: ImprovedQualityScore[]) {
  if (scores.length === 0) {
    return {
      avgScore: 0,
      minScore: 0,
      maxScore: 0,
      outlierCount: 0,
      goodCount: 0,
      fairCount: 0,
      poorCount: 0,
    };
  }

  const avgScore = Math.round(
    scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
  );
  const minScore = Math.min(...scores.map((s) => s.overallScore));
  const maxScore = Math.max(...scores.map((s) => s.overallScore));
  const outlierCount = scores.filter((s) => s.isOutlier).length;

  const goodCount = scores.filter((s) => s.overallScore >= 75).length;
  const fairCount = scores.filter(
    (s) => s.overallScore >= 60 && s.overallScore < 75
  ).length;
  const poorCount = scores.filter((s) => s.overallScore < 60).length;

  return {
    avgScore,
    minScore,
    maxScore,
    outlierCount,
    goodCount,
    fairCount,
    poorCount,
  };
}

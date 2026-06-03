/**
 * 统一的质量评分系统
 * 
 * 用于采集过程和保存时的异常检测
 * 确保两个阶段使用相同的评分标准
 */

export interface UnifiedQualityScore {
  overallScore: number;           // 0-100，相对评分
  energyConsistency: number;      // 与其他采集的能量一致性
  signalStrength: number;         // 信号强度
  variability: number;            // 波形变化性
  isAnomalous: boolean;           // 是否为异常采集
  anomalyReasons: string[];       // 异常原因
  recommendations: string[];      // 建议
  collectionIndex?: number;       // 采集索引
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
 * 计算单个采集的相对评分
 * 
 * 评分标准（相对于同指令的其他采集）：
 * - 能量一致性（50%权重）：与其他采集的相似度
 * - 信号强度（25%权重）：相对于最强采集
 * - 波形变化性（25%权重）：相对于最大变化性
 */
export function calculateUnifiedQualityScore(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  allWaveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  collectionIndex: number
): UnifiedQualityScore {
  // 计算当前采集的特征（使用ch2通道）
  const strength = calculateSignalStrength(waveform.ch2);
  const variability = calculateVariability(waveform.ch2);

  // 计算所有采集的平均和最大值
  const allStrengths = allWaveforms.map((w) => calculateSignalStrength(w.ch2));
  const avgStrength = allStrengths.reduce((a, b) => a + b, 0) / allStrengths.length;
  const maxStrength = Math.max(...allStrengths);

  const allVariabilities = allWaveforms.map((w) => calculateVariability(w.ch2));
  const avgVariability = allVariabilities.reduce((a, b) => a + b, 0) / allVariabilities.length;
  const maxVariability = Math.max(...allVariabilities);

  // 1. 能量一致性评分（与其他采集的相似度）
  const strengthRatio = avgStrength > 0 ? strength / avgStrength : 1;
  const variabilityRatio = avgVariability > 0 ? variability / avgVariability : 1;

  let energyConsistency = 100;
  
  // 信号强度一致性（权重 60%）
  if (strengthRatio < 0.8 || strengthRatio > 1.2) {
    energyConsistency -= Math.abs(strengthRatio - 1) * 100 * 0.6;
  }
  
  // 波形变化性一致性（权重 40%）
  if (variabilityRatio < 0.8 || variabilityRatio > 1.2) {
    energyConsistency -= Math.abs(variabilityRatio - 1) * 100 * 0.4;
  }
  
  energyConsistency = Math.max(0, Math.min(100, energyConsistency));

  // 2. 信号强度评分（相对于最强采集）
  let signalStrengthScore = 100;
  if (maxStrength > 0) {
    const strengthPercentage = (strength / maxStrength) * 100;
    
    if (strengthPercentage >= 90) {
      signalStrengthScore = 100;
    } else if (strengthPercentage >= 70) {
      signalStrengthScore = 80 + (strengthPercentage - 70) / 20 * 20;
    } else if (strengthPercentage >= 50) {
      signalStrengthScore = 60 + (strengthPercentage - 50) / 20 * 20;
    } else if (strengthPercentage >= 30) {
      signalStrengthScore = 40 + (strengthPercentage - 30) / 20 * 20;
    } else if (strengthPercentage >= 10) {
      signalStrengthScore = 20 + (strengthPercentage - 10) / 20 * 20;
    } else {
      signalStrengthScore = strengthPercentage * 2;
    }
  }

  // 3. 波形变化性评分（相对于最大变化性）
  let variabilityScore = 100;
  if (maxVariability > 0) {
    const variabilityPercentage = (variability / maxVariability) * 100;
    
    if (variabilityPercentage >= 80) {
      variabilityScore = 100;
    } else if (variabilityPercentage >= 60) {
      variabilityScore = 80 + (variabilityPercentage - 60) / 20 * 20;
    } else if (variabilityPercentage >= 40) {
      variabilityScore = 60 + (variabilityPercentage - 40) / 20 * 20;
    } else if (variabilityPercentage >= 20) {
      variabilityScore = 40 + (variabilityPercentage - 20) / 20 * 20;
    } else if (variabilityPercentage >= 10) {
      variabilityScore = 20 + (variabilityPercentage - 10) / 10 * 20;
    } else {
      variabilityScore = variabilityPercentage * 2;
    }
  }

  // 4. 综合评分
  const overallScore = Math.round(
    energyConsistency * 0.5 + signalStrengthScore * 0.25 + variabilityScore * 0.25
  );

  // 5. 异常检测（使用相对标准，不使用绝对阈值）
  const isAnomalous = false; // 在detectAnomalies中进行异常检测
  const anomalyReasons: string[] = [];
  const recommendations: string[] = [];

  if (overallScore < 60) {
    recommendations.push('质量一般，可考虑重录');
  } else if (overallScore < 75) {
    recommendations.push('质量良好');
  } else {
    recommendations.push('质量优秀');
  }

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    energyConsistency: Math.round(energyConsistency),
    signalStrength: Math.round(signalStrengthScore),
    variability: Math.round(variabilityScore),
    isAnomalous,
    anomalyReasons,
    recommendations,
    collectionIndex,
  };
}

/**
 * 批量计算所有采集的质量评分
 */
export function calculateAllUnifiedQualityScores(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): UnifiedQualityScore[] {
  return waveforms.map((wf, idx) =>
    calculateUnifiedQualityScore(wf, waveforms, idx)
  );
}

/**
 * 检测异常采集（使用相对评分和3σ标准）
 * 
 * 异常检测标准：
 * 1. 计算所有采集的平均评分和标准差
 * 2. 标记偏差超过3σ的采集为异常
 * 3. 不使用绝对阈值
 */
export function detectAnomaliesUnified(
  scores: UnifiedQualityScore[]
): UnifiedQualityScore[] {
  if (scores.length < 2) {
    return [];
  }

  // 计算平均评分和标准差
  const avgScore = scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s.overallScore - avgScore, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  // 标记异常波形（偏差超过3σ）
  const anomalies: UnifiedQualityScore[] = [];
  
  for (const score of scores) {
    const reasons: string[] = [];
    const recommendations: string[] = [];

    // 检查与平均值的偏差（3σ标准）
    if (stdDev > 0) {
      const deviation = Math.abs(score.overallScore - avgScore) / stdDev;
      
      if (deviation > 3) {
        reasons.push(`评分与平均值偏差过大 (${deviation.toFixed(1)}σ)`);
        recommendations.push('检查采集质量');
        score.isAnomalous = true;
      }
    }

    // 检查能量一致性
    if (score.energyConsistency < 40) {
      reasons.push('能量一致性过低');
      recommendations.push('保持稳定的肌肉收缩');
      score.isAnomalous = true;
    }

    // 检查信号强度
    if (score.signalStrength < 30) {
      reasons.push('信号强度不足');
      recommendations.push('增加肌肉收缩强度');
      score.isAnomalous = true;
    }

    // 检查波形变化性
    if (score.variability < 20) {
      reasons.push('波形变化性过低');
      recommendations.push('确保有足够的波形变化');
      score.isAnomalous = true;
    }

    if (reasons.length > 0) {
      score.anomalyReasons = reasons;
      score.recommendations = recommendations;
      anomalies.push(score);
    }
  }

  return anomalies;
}

/**
 * 获取异常检测统计信息
 */
export function getAnomalyStatistics(scores: UnifiedQualityScore[]) {
  const anomalies = detectAnomaliesUnified(scores);
  const avgScore = scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s.overallScore - avgScore, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return {
    totalCollections: scores.length,
    anomalousCount: anomalies.length,
    anomalyRate: (anomalies.length / scores.length) * 100,
    averageScore: avgScore,
    stdDev,
    anomalies,
  };
}

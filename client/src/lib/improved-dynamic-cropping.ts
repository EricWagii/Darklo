/**
 * 改进的动态裁剪算法
 * 
 * 核心改进：
 * 1. 基于能量差异的动态阈值（而不是固定系数）
 * 2. 区分前后空白和中间低能量区域
 * 3. 保留中间的低能量区域（有效信号的一部分）
 * 4. 详细的诊断日志便于调试
 */

import { logger } from './logger';

export interface DynamicCroppingResult {
  startIdx: number;           // 裁剪后的起始索引
  endIdx: number;             // 裁剪后的结束索引
  length: number;             // 裁剪后的长度
  confidence: number;         // 置信度 (0-1)
  isQualityAcceptable: boolean; // 质量是否可接受
  qualityReason?: string;     // 质量不可接受的原因
  
  // 诊断信息
  diagnostics: {
    energyStats: {
      min: number;
      max: number;
      mean: number;
      stdDev: number;
      median: number;
    };
    threshold: number;         // 使用的阈值
    thresholdReason: string;   // 阈值计算的原因
    frontBlankLength: number;  // 前空白长度
    rearBlankLength: number;   // 后空白长度
    validSegmentLength: number; // 有效段长度
    midLowEnergyRegions: Array<{startIdx: number; endIdx: number; reason: string}>; // 中间低能量区域
  };
}

/**
 * 计算信号的能量统计信息
 */
function calculateEnergyStats(energy: number[]): {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  median: number;
} {
  if (energy.length === 0) {
    return { min: 0, max: 0, mean: 0, stdDev: 0, median: 0 };
  }

  const sorted = [...energy].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = energy.reduce((a, b) => a + b, 0) / energy.length;
  const variance = energy.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / energy.length;
  const stdDev = Math.sqrt(variance);
  const median = sorted[Math.floor(sorted.length / 2)];

  return { min, max, mean, stdDev, median };
}

/**
 * 计算动态阈值
 * 
 * 策略：
 * - 如果能量分布明显（stdDev > mean * 0.3），使用基于stdDev的阈值
 * - 如果能量分布不明显（stdDev <= mean * 0.3），使用基于能量范围的阈值
 * - 确保阈值在合理范围内
 */
function calculateDynamicThreshold(stats: {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  median: number;
}): { threshold: number; reason: string } {
  const { min, max, mean, stdDev, median } = stats;
  const energyRange = max - min;

  // 如果能量范围太小，说明信号很弱
  if (energyRange < 0.01) {
    const threshold = min + energyRange * 0.3;
    return {
      threshold,
      reason: '信号很弱，使用低敏感度阈值',
    };
  }

  // 计算变异系数（标准差 / 均值）
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

  if (coefficientOfVariation > 0.3) {
    // 能量分布明显，使用基于stdDev的阈值
    // 这样可以更好地适应不同特征的波形
    const threshold = mean - stdDev * 0.5;
    return {
      threshold: Math.max(threshold, min + energyRange * 0.1),
      reason: '能量分布明显，使用stdDev阈值',
    };
  } else {
    // 能量分布不明显，使用基于能量范围的阈值
    const threshold = min + energyRange * 0.2;
    return {
      threshold,
      reason: '能量分布不明显，使用范围阈值',
    };
  }
}

/**
 * 识别前后空白
 * 
 * 从头和尾分别查找第一个和最后一个超过阈值的点
 */
function identifyFrontAndRearBlanks(
  energy: number[],
  threshold: number,
  windowSize: number = 20
): { frontEnd: number; rearStart: number } {
  let frontEnd = 0;
  let rearStart = energy.length;

  // 从头找到第一个超过阈值的点
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > threshold) {
      frontEnd = i;
      break;
    }
  }

  // 从尾找到最后一个超过阈值的点
  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > threshold) {
      rearStart = i + 1;
      break;
    }
  }

  // 转换为样本索引
  return {
    frontEnd: frontEnd * windowSize,
    rearStart: rearStart * windowSize,
  };
}

/**
 * 识别中间低能量区域
 * 
 * 在有效段内，找到能量明显低于平均值的区域
 * 这些区域不应该被裁剪，因为它们是有效信号的一部分
 */
function identifyMidLowEnergyRegions(
  energy: number[],
  frontEnd: number,
  rearStart: number,
  threshold: number,
  windowSize: number = 20
): Array<{ startIdx: number; endIdx: number; reason: string }> {
  const regions: Array<{ startIdx: number; endIdx: number; reason: string }> = [];

  const frontEndWindow = Math.floor(frontEnd / windowSize);
  const rearStartWindow = Math.ceil(rearStart / windowSize);

  if (frontEndWindow >= rearStartWindow) {
    return regions;
  }

  // 计算有效段内的能量统计
  const validEnergy = energy.slice(frontEndWindow, rearStartWindow);
  if (validEnergy.length === 0) {
    return regions;
  }

  const validStats = calculateEnergyStats(validEnergy);
  const lowEnergyThreshold = validStats.mean * 0.5; // 低于平均值的50%

  let inLowRegion = false;
  let regionStart = 0;

  for (let i = frontEndWindow; i < rearStartWindow; i++) {
    if (energy[i] < lowEnergyThreshold && energy[i] > threshold * 0.5) {
      if (!inLowRegion) {
        inLowRegion = true;
        regionStart = i;
      }
    } else {
      if (inLowRegion) {
        inLowRegion = false;
        const regionLength = (i - regionStart) * windowSize;
        if (regionLength > windowSize * 2) { // 至少2个窗口
          regions.push({
            startIdx: regionStart * windowSize,
            endIdx: i * windowSize,
            reason: '中间低能量区域，保留为有效信号的一部分',
          });
        }
      }
    }
  }

  if (inLowRegion) {
    const regionLength = (rearStartWindow - regionStart) * windowSize;
    if (regionLength > windowSize * 2) {
      regions.push({
        startIdx: regionStart * windowSize,
        endIdx: rearStartWindow * windowSize,
        reason: '中间低能量区域，保留为有效信号的一部分',
      });
    }
  }

  return regions;
}

/**
 * 执行改进的动态裁剪
 */
export function performDynamicCropping(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): DynamicCroppingResult {
  const length = Math.min(ch1.length, ch2.length, ch3.length);

  if (length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: true,
      qualityReason: '输入信号为空',
      diagnostics: {
        energyStats: { min: 0, max: 0, mean: 0, stdDev: 0, median: 0 },
        threshold: 0,
        thresholdReason: '输入为空',
        frontBlankLength: 0,
        rearBlankLength: 0,
        validSegmentLength: 0,
        midLowEnergyRegions: [],
      },
    };
  }

  // 1. 计算三通道的能量
  const energy: number[] = [];
  for (let i = 0; i <= length - windowSize; i++) {
    const window1 = ch1.slice(i, i + windowSize);
    const window2 = ch2.slice(i, i + windowSize);
    const window3 = ch3.slice(i, i + windowSize);

    const rms1 = Math.sqrt(window1.reduce((sum, x) => sum + x * x, 0) / windowSize);
    const rms2 = Math.sqrt(window2.reduce((sum, x) => sum + x * x, 0) / windowSize);
    const rms3 = Math.sqrt(window3.reduce((sum, x) => sum + x * x, 0) / windowSize);

    // 三通道加权平均
    const avgRMS = (rms1 + rms2 + rms3) / 3;
    energy.push(avgRMS);
  }

  // 2. 计算能量统计
  const energyStats = calculateEnergyStats(energy);

  // 3. 计算动态阈值
  const { threshold, reason: thresholdReason } = calculateDynamicThreshold(energyStats);

  // 4. 识别前后空白
  const { frontEnd, rearStart } = identifyFrontAndRearBlanks(energy, threshold, windowSize);

  // 5. 识别中间低能量区域
  const midLowEnergyRegions = identifyMidLowEnergyRegions(
    energy,
    frontEnd,
    rearStart,
    threshold,
    windowSize
  );

  // 6. 计算最终的裁剪范围
  const startIdx = Math.max(0, frontEnd);
  const endIdx = Math.min(length, rearStart);

  // 7. 计算置信度（有效段占比）
  const validSegmentLength = endIdx - startIdx;
  const confidence = length > 0 ? validSegmentLength / length : 0;

  // 8. 质量检查
  const MIN_VALID_LENGTH = 100; // 最少100个样本
  const MIN_CONFIDENCE = 0.2;  // 最少20%的有效段
  const isQualityAcceptable = validSegmentLength >= MIN_VALID_LENGTH && confidence >= MIN_CONFIDENCE;

  let qualityReason = '';
  if (!isQualityAcceptable) {
    if (validSegmentLength < MIN_VALID_LENGTH) {
      qualityReason = `有效段过短：${validSegmentLength} < ${MIN_VALID_LENGTH}`;
    } else if (confidence < MIN_CONFIDENCE) {
      qualityReason = `置信度过低：${(confidence * 100).toFixed(1)}% < ${MIN_CONFIDENCE * 100}%`;
    }
  }

  // 9. 记录诊断信息
  logger.debug(
    `[动态裁剪] 能量统计: min=${energyStats.min.toFixed(3)}, max=${energyStats.max.toFixed(3)}, ` +
    `mean=${energyStats.mean.toFixed(3)}, stdDev=${energyStats.stdDev.toFixed(3)}`
  );
  logger.debug(
    `[动态裁剪] 阈值=${threshold.toFixed(3)} (${thresholdReason})`
  );
  logger.debug(
    `[动态裁剪] 前空白=${frontEnd}, 后空白=${length - rearStart}, 有效段=${validSegmentLength}`
  );
  if (midLowEnergyRegions.length > 0) {
    logger.debug(
      `[动态裁剪] 中间低能量区域: ${midLowEnergyRegions.length} 个`
    );
  }

  return {
    startIdx,
    endIdx,
    length: validSegmentLength,
    confidence,
    isQualityAcceptable,
    qualityReason: qualityReason || undefined,
    diagnostics: {
      energyStats,
      threshold,
      thresholdReason,
      frontBlankLength: frontEnd,
      rearBlankLength: length - rearStart,
      validSegmentLength,
      midLowEnergyRegions,
    },
  };
}

/**
 * 应用裁剪到波形集合
 */
export function applyCroppingToWaveforms(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  croppingResult: DynamicCroppingResult
): Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> {
  if (croppingResult.startIdx >= croppingResult.endIdx) {
    logger.warn('无效的裁剪参数，返回原始数据');
    return waveforms;
  }

  return waveforms.map(wf => ({
    ch1: wf.ch1.slice(croppingResult.startIdx, croppingResult.endIdx),
    ch2: wf.ch2.slice(croppingResult.startIdx, croppingResult.endIdx),
    ch3: wf.ch3.slice(croppingResult.startIdx, croppingResult.endIdx),
  }));
}

/**
 * 批量裁剪多个波形集合
 * 返回所有波形的共同裁剪参数
 */
export function batchDynamicCropping(
  collections: Array<Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>>,
  onProgress?: (current: number, total: number) => void
): DynamicCroppingResult {
  if (collections.length === 0) {
    return {
      startIdx: 0,
       endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: true,
      qualityReason: '信号过短',
      diagnostics: {
        energyStats: { min: 0, max: 0, mean: 0, stdDev: 0, median: 0 },
        threshold: 0,
        thresholdReason: '没有数据',
        frontBlankLength: 0,
        rearBlankLength: 0,
        validSegmentLength: 0,
        midLowEnergyRegions: [],
      },
    };
  }

  // 对每个波形集合进行裁剪
  const croppingResults: DynamicCroppingResult[] = [];

  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    if (collection.length === 0) continue;

    // 合并该集合中的所有波形
    const allCh1 = collection.map(w => w.ch1).flat();
    const allCh2 = collection.map(w => w.ch2).flat();
    const allCh3 = collection.map(w => w.ch3).flat();

    const result = performDynamicCropping(allCh1, allCh2, allCh3);
    croppingResults.push(result);

    if (onProgress) {
      onProgress(i + 1, collections.length);
    }
  }

  if (croppingResults.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: true,
      qualityReason: '没有有效能量数据',
      diagnostics: {
        energyStats: { min: 0, max: 0, mean: 0, stdDev: 0, median: 0 },
        threshold: 0,
        thresholdReason: '所有采集失败',
        frontBlankLength: 0,
        rearBlankLength: 0,
        validSegmentLength: 0,
        midLowEnergyRegions: [],
      },
    };
  }

  // 使用中位数作为共同的裁剪参数
  const startIndices = croppingResults.map(r => r.startIdx).sort((a, b) => a - b);
  const endIndices = croppingResults.map(r => r.endIdx).sort((a, b) => a - b);

  const medianStartIdx = startIndices[Math.floor(startIndices.length / 2)];
  const medianEndIdx = endIndices[Math.floor(endIndices.length / 2)];

  const avgConfidence = croppingResults.reduce((sum, r) => sum + r.confidence, 0) / croppingResults.length;

  const validSegmentLength = medianEndIdx - medianStartIdx;
  const isQualityAcceptable = validSegmentLength >= 100 && avgConfidence >= 0.2;

  return {
    startIdx: medianStartIdx,
    endIdx: medianEndIdx,
    length: validSegmentLength,
    confidence: avgConfidence,
    isQualityAcceptable,
    qualityReason: !isQualityAcceptable ? '批量裁剪质量不达标' : undefined,
    diagnostics: {
      energyStats: calculateEnergyStats(croppingResults.map(r => r.diagnostics.energyStats.mean)),
      threshold: croppingResults[0].diagnostics.threshold,
      thresholdReason: `批量裁剪，使用${croppingResults.length}个波形的中位数`,
      frontBlankLength: medianStartIdx,
      rearBlankLength: 0,
      validSegmentLength,
      midLowEnergyRegions: [],
    },
  };
}

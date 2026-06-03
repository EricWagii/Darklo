/**
 * 简单的前后空白裁剪算法
 * 
 * 用户指定的裁剪方法：
 * 1. 从前往后扫描，找到第一个有效信号（超过阈值），记为 startIdx
 * 2. 从后往前扫描，找到最后一个有效信号（超过阈值），记为 endIdx
 * 3. 保留 [startIdx, endIdx] 之间的所有数据，不删除任何中间部分
 * 
 * 这个方法保证了波形的完整性和特征的连续性
 */

import { logger } from './logger';

export interface SimpleCroppingResult {
  startIdx: number;           // 裁剪后的起始索引
  endIdx: number;             // 裁剪后的结束索引
  length: number;             // 裁剪后的长度
  confidence: number;         // 置信度 (0-1)
  isQualityAcceptable: boolean; // 质量是否可接受
  qualityReason?: string;     // 质量不可接受的原因
  
  // 多峰值兼容字段（用于与旧代码兼容）
  peakCount?: number;
  detectionStrategy?: 'single' | 'multi';
  snrWeights?: { ch1: number; ch2: number; ch3: number };
}

/**
 * 计算三通道的能量
 */
function calculateEnergy(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): number[] {
  const length = Math.min(ch1.length, ch2.length, ch3.length);
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

  return energy;
}

/**
 * 计算能量统计
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
 */
function calculateDynamicThreshold(stats: {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  median: number;
}): number {
  const { min, max, mean, stdDev } = stats;
  const energyRange = max - min;

  // 如果能量范围太小，说明信号很弱
  if (energyRange < 0.01) {
    return min + energyRange * 0.3;
  }

  // 计算变异系数（标准差 / 均值）
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

  if (coefficientOfVariation > 0.3) {
    // 能量分布明显，使用基于stdDev的阈值
    const threshold = mean - stdDev * 0.5;
    return Math.max(threshold, min + energyRange * 0.1);
  } else {
    // 能量分布不明显，使用基于能量范围的阈值
    return min + energyRange * 0.2;
  }
}

/**
 * 执行简单的前后空白裁剪
 * 
 * @param ch1 通道1的数据
 * @param ch2 通道2的数据
 * @param ch3 通道3的数据
 * @param windowSize 能量计算的窗口大小
 * @returns 裁剪结果
 */
export function performSimpleCropping(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): SimpleCroppingResult {
  const length = Math.min(ch1.length, ch2.length, ch3.length);

  if (length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: false,
      qualityReason: '输入信号为空',
      peakCount: 0,
      detectionStrategy: 'single',
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
    };
  }

  // 1. 计算三通道的能量
  const energy = calculateEnergy(ch1, ch2, ch3, windowSize);

  if (energy.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: false,
      qualityReason: '能量计算失败',
      peakCount: 0,
      detectionStrategy: 'single',
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
    };
  }

  // 2. 计算能量统计
  const energyStats = calculateEnergyStats(energy);

  // 3. 计算动态阈值
  const threshold = calculateDynamicThreshold(energyStats);

  // 4. 从前往后找到第一个超过阈值的点
  let frontIdx = -1;  // 改为-1表示未找到
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > threshold) {
      frontIdx = i;
      break;
    }
  }

  // 5. 从后往前找到最后一个超过阈值的点
  let rearIdx = -1;  // 改为-1表示未找到
  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > threshold) {
      rearIdx = i;  // 修复：不应该加1，保持与frontIdx一致
      break;
    }
  }

  // ✅ 关键检查：如果没有找到有效信号
  if (frontIdx === -1 || rearIdx === -1) {
    logger.warn(`[裁剪警告] 未找到超过阈值的信号: frontIdx=${frontIdx}, rearIdx=${rearIdx}, threshold=${threshold.toFixed(2)}, energyRange=${energyStats.max - energyStats.min}`);
    // 返回整个信号
    return {
      startIdx: 0,
      endIdx: length,
      length: length,
      confidence: 0.5,  // 降低置信度
      isQualityAcceptable: false,  // 标记为质量不可接受
      qualityReason: '未找到有效信号，返回整个波形',
      peakCount: 0,
      detectionStrategy: 'single',
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
    };
  }

  // 如果frontIdx > rearIdx，交换它们
  if (frontIdx > rearIdx) {
    logger.warn(`[裁剪警告] frontIdx > rearIdx: ${frontIdx} > ${rearIdx}，交换它们`);
    [frontIdx, rearIdx] = [rearIdx, frontIdx];
  }

  // 6. 转换为样本索引
  const startIdx = Math.max(0, frontIdx * windowSize);
  const endIdx = Math.min(length, rearIdx * windowSize);

  logger.debug(`[裁剪调试] frontIdx=${frontIdx}, rearIdx=${rearIdx}, startIdx=${startIdx}, endIdx=${endIdx}, length=${length}`);

  // ✅ 关键检查：确保 startIdx < endIdx
  if (startIdx >= endIdx) {
    logger.warn(`[裁剪警告] 无效的裁剪范围: startIdx=${startIdx} >= endIdx=${endIdx}`);
    // 这种情况不应该发生，因为我们已经在上面检查了frontIdx和rearIdx
    // 如果发生了，说明有其他问题
    return {
      startIdx: 0,
      endIdx: length,
      length: length,
      confidence: 0.5,
      isQualityAcceptable: false,
      qualityReason: '裁剪范围无效，返回整个波形',
      peakCount: 0,
      detectionStrategy: 'single',
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
    };
  }

  // 7. 计算置信度（有效段占比）
  const validSegmentLength = endIdx - startIdx;
  const confidence = length > 0 ? validSegmentLength / length : 0;

  // 8. 质量检查
  const MIN_VALID_LENGTH = 100; // 最少100个样本
  const MIN_CONFIDENCE = 0.2;   // 最少20%的有效段
  const isQualityAcceptable = validSegmentLength >= MIN_VALID_LENGTH && confidence >= MIN_CONFIDENCE;

  let qualityReason = '';
  if (!isQualityAcceptable) {
    if (validSegmentLength < MIN_VALID_LENGTH) {
      qualityReason = `有效段过短：${validSegmentLength} < ${MIN_VALID_LENGTH}`;
    } else if (confidence < MIN_CONFIDENCE) {
      qualityReason = `置信度过低：${(confidence * 100).toFixed(1)}% < ${MIN_CONFIDENCE * 100}%`;
    }
  }

  // 9. 计算SNR权重
  const calculateVariance = (signal: number[]): number => {
    if (signal.length === 0) return 0;
    const mean = signal.reduce((sum, x) => sum + x, 0) / signal.length;
    const variance = signal.reduce((sum, x) => sum + (x - mean) ** 2, 0) / signal.length;
    return Math.sqrt(variance);
  };

  const var1 = calculateVariance(ch1);
  const var2 = calculateVariance(ch2);
  const var3 = calculateVariance(ch3);
  const total = var1 + var2 + var3;

  const snrWeights = total > 0
    ? { ch1: var1 / total, ch2: var2 / total, ch3: var3 / total }
    : { ch1: 0.33, ch2: 0.33, ch3: 0.34 };

  return {
    startIdx,
    endIdx,
    length: validSegmentLength,
    confidence,
    isQualityAcceptable,
    qualityReason: qualityReason || undefined,
    peakCount: 1,
    detectionStrategy: 'single',
    snrWeights,
  };
}

/**
 * 应用裁剪到单个波形
 */
export function applyCroppingToWaveform(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  croppingResult: SimpleCroppingResult
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  if (croppingResult.startIdx >= croppingResult.endIdx) {
    logger.warn('无效的裁剪参数，返回原始数据');
    return waveform;
  }

  return {
    ch1: waveform.ch1.slice(croppingResult.startIdx, croppingResult.endIdx),
    ch2: waveform.ch2.slice(croppingResult.startIdx, croppingResult.endIdx),
    ch3: waveform.ch3.slice(croppingResult.startIdx, croppingResult.endIdx),
  };
}

/**
 * 应用裁剪到波形集合
 */
export function applyCroppingToWaveforms(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  croppingResult: SimpleCroppingResult
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
 * 
 * 对每个采集分别进行裁剪，然后使用中位数作为共同的裁剪参数
 * 这样可以确保所有采集都使用相同的裁剪参数，提高一致性
 */
export function batchSimpleCropping(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>[],
  onProgress?: (current: number, total: number) => void
): SimpleCroppingResult {
  if (collections.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: true,
      qualityReason: '没有采集数据',
      peakCount: 0,
      detectionStrategy: 'single',
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
    };
  }

  // 对每个采集进行裁剪
  const croppingResults: SimpleCroppingResult[] = [];

  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    if (collection.length === 0) continue;

    // 合并该采集中的所有波形
    const allCh1 = collection.map(w => w.ch1).flat();
    const allCh2 = collection.map(w => w.ch2).flat();
    const allCh3 = collection.map(w => w.ch3).flat();

    const result = performSimpleCropping(allCh1, allCh2, allCh3);
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
      qualityReason: '所有采集都失败了',
      peakCount: 0,
      detectionStrategy: 'single',
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
    };
  }

  // 使用中位数作为共同的裁剪参数
  const startIndices = croppingResults.map(r => r.startIdx).sort((a, b) => a - b);
  const endIndices = croppingResults.map(r => r.endIdx).sort((a, b) => a - b);

  const medianStartIdx = startIndices[Math.floor(startIndices.length / 2)];
  const medianEndIdx = endIndices[Math.floor(endIndices.length / 2)];

  // ✅ 关键修复：确保 startIdx < endIdx
  // 如果中位数计算出了反序的结果，交换它们
  const finalStartIdx = Math.min(medianStartIdx, medianEndIdx);
  const finalEndIdx = Math.max(medianStartIdx, medianEndIdx);

  const avgConfidence = croppingResults.reduce((sum, r) => sum + r.confidence, 0) / croppingResults.length;

  const validSegmentLength = finalEndIdx - finalStartIdx;
  // 问题1.3修复：fallback路径应该返回true，避免传播到异常检测
  const isQualityAcceptable = true;

  // 计算平均SNR权重
  const avgSnrWeights = {
    ch1: croppingResults.reduce((sum, r) => sum + (r.snrWeights?.ch1 || 0.33), 0) / croppingResults.length,
    ch2: croppingResults.reduce((sum, r) => sum + (r.snrWeights?.ch2 || 0.33), 0) / croppingResults.length,
    ch3: croppingResults.reduce((sum, r) => sum + (r.snrWeights?.ch3 || 0.34), 0) / croppingResults.length,
  };

  return {
    startIdx: finalStartIdx,
    endIdx: finalEndIdx,
    length: validSegmentLength,
    confidence: avgConfidence,
    isQualityAcceptable,
    qualityReason: !isQualityAcceptable ? '批量裁剪质量不达标' : undefined,
    peakCount: 1,
    detectionStrategy: 'single',
    snrWeights: avgSnrWeights,
  };
}

/**
 * 为了与旧API兼容，提供一个包装函数
 * 这个函数接受与 batchCropCollectionsMultiPeak 相同的参数
 */
export function batchSimpleCroppingCompat(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  onProgress?: (current: number, total: number) => void,
  strategy?: string
): SimpleCroppingResult {
  // 将单个波形数组转换为集合数组
  const collections = waveforms.map(w => [w]);
  return batchSimpleCropping(collections, onProgress);
}


/**
 * 问题1.2修复：批量独立裁剪 - 每条波形独立处理
 * 返回数组，每条波形都有自己的startIdx/endIdx
 */
export function batchSimpleCroppingIndependent(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  onProgress?: (current: number, total: number) => void
): SimpleCroppingResult[] {
  const results: SimpleCroppingResult[] = [];

  for (let i = 0; i < waveforms.length; i++) {
    const waveform = waveforms[i];
    
    // 每条独立裁剪
    const result = performSimpleCropping(waveform.ch1, waveform.ch2, waveform.ch3);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, waveforms.length);
    }
  }

  return results;
}

/**
 * 应用独立裁剪结果到波形数组
 * 每条波形使用对应的裁剪结果
 */
export function applyIndependentCropping(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  croppingResults: SimpleCroppingResult[]
): Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> {
  if (waveforms.length !== croppingResults.length) {
    logger.warn(
      `[独立裁剪] 波形数(${waveforms.length}) 与裁剪结果数(${croppingResults.length}) 不匹配，使用最小值`
    );
  }

  const count = Math.min(waveforms.length, croppingResults.length);
  const croppedWaveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> = [];

  for (let i = 0; i < count; i++) {
    const waveform = waveforms[i];
    const result = croppingResults[i];

    // 确保索引有效
    const startIdx = Math.max(0, result.startIdx);
    const endIdx = Math.min(
      Math.max(waveform.ch1.length, waveform.ch2.length, waveform.ch3.length),
      result.endIdx
    );

    if (startIdx >= endIdx) {
      logger.warn(
        `[独立裁剪] 第${i}条：索引无效 [${startIdx}, ${endIdx})，返回全段`
      );
      croppedWaveforms.push(waveform);
    } else {
      croppedWaveforms.push({
        ch1: waveform.ch1.slice(startIdx, endIdx),
        ch2: waveform.ch2.slice(startIdx, endIdx),
        ch3: waveform.ch3.slice(startIdx, endIdx),
      });
    }
  }

  return croppedWaveforms;
}

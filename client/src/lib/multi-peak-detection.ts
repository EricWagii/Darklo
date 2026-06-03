/**
 * 多峰值能量检测模块
 * 
 * 用于处理复杂指令（如"yeah"）的多峰值肌电信号
 * 支持识别、合并和选择多个活跃峰值
 */

import { logger } from './logger';

export interface PeakInfo {
  startIdx: number;      // 峰值起始索引
  endIdx: number;        // 峰值结束索引
  peakEnergy: number;    // 峰值的最大能量
  peakIdx: number;       // 最大能量的位置（相对于 startIdx）
  duration: number;      // 峰值持续时间（样本数）
}

export interface MultiPeakCroppingResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  snrWeights: { ch1: number; ch2: number; ch3: number };
  isQualityAcceptable: boolean;
  qualityReason?: string;
  
  // 多峰值特定字段
  peaks: PeakInfo[];                    // 所有识别到的峰值
  peakCount: number;                    // 峰值数量
  detectionStrategy: 'single' | 'multi'; // 使用的检测策略
  mergedGaps?: number[];                // 被合并的间隔
}

/**
 * 计算方差
 */
function calculateVariance(signal: number[]): number {
  if (signal.length === 0) return 0;

  const mean = signal.reduce((sum, x) => sum + x, 0) / signal.length;
  const variance = signal.reduce((sum, x) => sum + (x - mean) ** 2, 0) / signal.length;

  return Math.sqrt(variance); // 返回标准差
}

/**
 * 快速计算三通道 SNR 权重
 */
function calculateChannelWeightsFast(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): { ch1: number; ch2: number; ch3: number } {
  const var1 = calculateVariance(ch1);
  const var2 = calculateVariance(ch2);
  const var3 = calculateVariance(ch3);

  const total = var1 + var2 + var3;
  if (total === 0) {
    return { ch1: 0.33, ch2: 0.33, ch3: 0.33 };
  }

  return {
    ch1: var1 / total,
    ch2: var2 / total,
    ch3: var3 / total,
  };
}

/**
 * 识别所有活跃峰值
 * 
 * @param energy 能量数组
 * @param threshold 能量阈值
 * @param windowSize 窗口大小（用于索引转换）
 * @returns 峰值列表
 */
export function detectPeaks(
  energy: number[],
  threshold: number,
  windowSize: number = 20
): PeakInfo[] {
  const peaks: PeakInfo[] = [];
  const isActive = energy.map(e => e > threshold);

  let inPeak = false;
  let peakStart = 0;
  let maxEnergy = 0;
  let maxEnergyIdx = 0;

  for (let i = 0; i < isActive.length; i++) {
    if (isActive[i]) {
      if (!inPeak) {
        // 开始新峰值
        inPeak = true;
        peakStart = i;
        maxEnergy = energy[i];
        maxEnergyIdx = i;
      } else {
        // 继续当前峰值
        if (energy[i] > maxEnergy) {
          maxEnergy = energy[i];
          maxEnergyIdx = i;
        }
      }
    } else {
      if (inPeak) {
        // 结束当前峰值
        inPeak = false;
        peaks.push({
          startIdx: peakStart * windowSize,
          endIdx: i * windowSize,
          peakEnergy: maxEnergy,
          peakIdx: (maxEnergyIdx - peakStart) * windowSize,
          duration: (i - peakStart) * windowSize,
        });
      }
    }
  }

  // 处理最后一个峰值（如果在末尾）
  if (inPeak) {
    peaks.push({
      startIdx: peakStart * windowSize,
      endIdx: isActive.length * windowSize,
      peakEnergy: maxEnergy,
      peakIdx: (maxEnergyIdx - peakStart) * windowSize,
      duration: (isActive.length - peakStart) * windowSize,
    });
  }

  logger.debug(`[峰值检测] 识别到 ${peaks.length} 个峰值`);
  peaks.forEach((peak, idx) => {
    logger.debug(
      `  峰值 ${idx + 1}: [${peak.startIdx}, ${peak.endIdx}], ` +
      `能量=${peak.peakEnergy.toFixed(3)}, 持续=${peak.duration}`
    );
  });

  return peaks;
}

/**
 * 合并相邻峰值
 * 
 * @param peaks 原始峰值列表
 * @param minGap 最小间隔（样本数）
 * @returns 合并后的峰值列表
 */
export function mergePeaks(peaks: PeakInfo[], minGap: number = 50): PeakInfo[] {
  if (peaks.length <= 1) {
    return peaks;
  }

  const merged: PeakInfo[] = [];
  const mergedGaps: number[] = [];
  let currentPeak = { ...peaks[0] };

  for (let i = 1; i < peaks.length; i++) {
    const gap = peaks[i].startIdx - currentPeak.endIdx;

    if (gap < minGap) {
      // 合并峰值
      mergedGaps.push(gap);
      currentPeak.endIdx = peaks[i].endIdx;
      currentPeak.duration = currentPeak.endIdx - currentPeak.startIdx;
      
      // 更新最大能量和位置
      if (peaks[i].peakEnergy > currentPeak.peakEnergy) {
        currentPeak.peakEnergy = peaks[i].peakEnergy;
        currentPeak.peakIdx = peaks[i].startIdx - currentPeak.startIdx + peaks[i].peakIdx;
      }
    } else {
      // 保存当前峰值，开始新峰值
      merged.push(currentPeak);
      currentPeak = { ...peaks[i] };
    }
  }

  // 保存最后一个峰值
  merged.push(currentPeak);

  if (mergedGaps.length > 0) {
    logger.debug(
      `[峰值合并] 合并了 ${mergedGaps.length} 个间隔 (minGap=${minGap}), ` +
      `峰值数量: ${peaks.length} → ${merged.length}`
    );
  }

  return merged;
}

/**
 * 选择最终的有效区间
 * 
 * @param peaks 合并后的峰值列表
 * @param strategy 选择策略
 * @returns 最终的 [startIdx, endIdx]
 */
export function selectFinalInterval(
  peaks: PeakInfo[],
  strategy: 'single' | 'multi' | 'auto',
  totalLength: number = 0
): { startIdx: number; endIdx: number; strategy: 'single' | 'multi' } {
  if (peaks.length === 0) {
    // 当没有检测到峰值时，返回整个信号范围而不是[0,0]
    return { startIdx: 0, endIdx: totalLength > 0 ? totalLength : 1, strategy: 'single' };
  }

  // 确定实际使用的策略
  const actualStrategy: 'single' | 'multi' = (strategy === 'auto' ? (peaks.length === 1 ? 'single' : 'multi') : strategy) as 'single' | 'multi';

  if (actualStrategy === 'single') {
    // 选择能量最强的单个峰值
    let maxIdx = 0;
    let maxEnergy = peaks[0].peakEnergy;

    for (let i = 1; i < peaks.length; i++) {
      if (peaks[i].peakEnergy > maxEnergy) {
        maxEnergy = peaks[i].peakEnergy;
        maxIdx = i;
      }
    }

    logger.debug(
      `[区间选择] 单峰值策略：选择峰值 ${maxIdx + 1} ` +
      `(能量=${maxEnergy.toFixed(3)}, [${peaks[maxIdx].startIdx}, ${peaks[maxIdx].endIdx}])`
    );

    return {
      startIdx: peaks[maxIdx].startIdx,
      endIdx: peaks[maxIdx].endIdx,
      strategy: 'single',
    };
  } else {
    // 选择所有峰值的并集
    const startIdx = Math.min(...peaks.map(p => p.startIdx));
    const endIdx = Math.max(...peaks.map(p => p.endIdx));

    logger.debug(
      `[区间选择] 多峰值策略：并集 [${startIdx}, ${endIdx}], ` +
      `包含 ${peaks.length} 个峰值`
    );

    return { startIdx, endIdx, strategy: 'multi' };
  }
}

/**
 * 增强的能量检测 - 支持多峰值
 */
export function detectValidSegmentMultiPeak(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20,
  strategy: 'single' | 'multi' | 'auto' = 'auto',
  minGapBetweenPeaks: number = 50
): MultiPeakCroppingResult {
  // 1. 计算 SNR 权重
  const snrWeights = calculateChannelWeightsFast(ch1, ch2, ch3);

  // 2. 融合三通道
  const fusedSignal = new Array(Math.min(ch1.length, ch2.length, ch3.length));
  for (let i = 0; i < fusedSignal.length; i++) {
    fusedSignal[i] =
      ch1[i] * snrWeights.ch1 +
      ch2[i] * snrWeights.ch2 +
      ch3[i] * snrWeights.ch3;
  }

  // 3. 计算局部能量
  const energy: number[] = [];
  for (let i = 0; i <= fusedSignal.length - windowSize; i++) {
    let rms = 0;
    for (let j = i; j < i + windowSize; j++) {
      rms += fusedSignal[j] * fusedSignal[j];
    }
    energy.push(Math.sqrt(rms / windowSize));
  }

  if (energy.length === 0) {
    return {
      startIdx: 0,
      endIdx: ch1.length,
      confidence: 0,
      snrWeights,
      isQualityAcceptable: true,
      qualityReason: '无有效能量数据',
      peaks: [],
      peakCount: 0,
      detectionStrategy: 'single',
    };
  }

  // 4. 计算能量阈值
  const sortedEnergy = [...energy].sort((a, b) => a - b);
  const minEnergy = sortedEnergy[0];
  const maxEnergy = sortedEnergy[sortedEnergy.length - 1];
  const medianEnergy = sortedEnergy[Math.floor(energy.length * 0.5)];

  const mean = energy.reduce((a, b) => a + b, 0) / energy.length;
  const variance = energy.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / energy.length;
  const stdDev = Math.sqrt(variance);

  // 改进的阈值计算：基于最小能量和动态范围
  // 而不是基于中位数，这样可以检测到真实的峰值
  let threshold = minEnergy + (maxEnergy - minEnergy) * 0.15;
  
  // 如果标准差较大，使用更灵敏的阈值
  if (stdDev > 0.05) {
    threshold = minEnergy + stdDev * 0.3;
  }
  // 如果标准差很小，说明信号很弱，降低阈值
  else if (stdDev < 0.01) {
    threshold = minEnergy + (maxEnergy - minEnergy) * 0.08;
  }

  logger.debug(
    `[多峰值检测] min=${minEnergy.toFixed(3)}, max=${maxEnergy.toFixed(3)}, ` +
    `median=${medianEnergy.toFixed(3)}, stdDev=${stdDev.toFixed(3)}, threshold=${threshold.toFixed(3)}`
  );

  // 5. 识别所有峰值
  const peaks = detectPeaks(energy, threshold, windowSize);

  // 6. 合并相邻峰值
  const mergedPeaks = mergePeaks(peaks, minGapBetweenPeaks);

  // 7. 选择最终区间
  const finalStrategy = strategy === 'auto' ? (mergedPeaks.length === 1 ? 'single' : 'multi') : strategy;
  const { startIdx, endIdx, strategy: usedStrategy } = selectFinalInterval(
    mergedPeaks,
    finalStrategy as 'single' | 'multi',
    fusedSignal.length
  );

  // 8. 计算置信度
  const isActive = energy.map(e => e > threshold);
  const activeCount = isActive.filter(a => a).length;
  const confidence = activeCount / isActive.length;

  // 9. 质量检查
  const validSegmentLength = endIdx - startIdx;
  const MIN_VALID_LENGTH = 100;
  const MIN_CONFIDENCE = 0.2;
  const peakEnergy = Math.max(...energy);
  const MIN_PEAK_ENERGY = 0.1;

  let isQualityAcceptable = true;
  let qualityReason = '';

  if (validSegmentLength < MIN_VALID_LENGTH) {
    isQualityAcceptable = false;
    qualityReason = '信号过短，请检查电极佩戴';
  } else if (confidence < MIN_CONFIDENCE) {
    isQualityAcceptable = false;
    qualityReason = '信号质量不达标，请重新采集';
  } else if (peakEnergy < MIN_PEAK_ENERGY) {
    isQualityAcceptable = false;
    qualityReason = '信号过弱，请检查电极接触';
  }

  return {
    startIdx: Math.max(0, startIdx),
    endIdx: Math.min(fusedSignal.length, endIdx),
    confidence: Math.min(1, confidence),
    snrWeights,
    isQualityAcceptable,
    qualityReason,
    peaks: mergedPeaks,
    peakCount: mergedPeaks.length,
    detectionStrategy: usedStrategy as 'single' | 'multi',
    mergedGaps: peaks.length > mergedPeaks.length ? [] : undefined,
  };
}

/**
 * 应用裁切到波形数据
 */
export function applyCropping(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  result: MultiPeakCroppingResult
): Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> {
  if (result.startIdx >= result.endIdx) {
    logger.warn('无效的裁切参数，返回原始数据');
    return collections;
  }

  return collections.map(col => ({
    ch1: col.ch1.slice(result.startIdx, result.endIdx),
    ch2: col.ch2.slice(result.startIdx, result.endIdx),
    ch3: col.ch3.slice(result.startIdx, result.endIdx),
  }));
}

/**
 * 批量多峰值快速裁切
 */
export async function batchCropCollectionsMultiPeak(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  onProgress?: (current: number, total: number) => void,
  strategy: 'single' | 'multi' | 'auto' = 'auto'
): Promise<MultiPeakCroppingResult> {
  if (collections.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      confidence: 0,
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.33 },
      isQualityAcceptable: true,
      qualityReason: '没有采集数据',
      peaks: [],
      peakCount: 0,
      detectionStrategy: 'single',
    };
  }

  const startTime = performance.now();
  logger.log(`开始多峰值快速裁切：${collections.length} 条波形`);

  // 1. 对每条波形进行多峰值检测
  const segmentations: MultiPeakCroppingResult[] = [];

  for (let i = 0; i < collections.length; i++) {
    const col = collections[i];
    const result = detectValidSegmentMultiPeak(col.ch1, col.ch2, col.ch3, 20, strategy);
    segmentations.push(result);

    if (onProgress) {
      onProgress(i + 1, collections.length);
    }

    if (i % 2 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // 2. 计算对齐参数（使用中位数）
  const allStartIndices = segmentations.map(seg => seg.startIdx);
  const allEndIndices = segmentations.map(seg => seg.endIdx);

  const sortedStarts = [...allStartIndices].sort((a, b) => a - b);
  const sortedEnds = [...allEndIndices].sort((a, b) => a - b);

  const alignedStartIdx = sortedStarts[Math.floor(sortedStarts.length / 2)];
  const alignedEndIdx = sortedEnds[Math.floor(sortedEnds.length / 2)];

  // 3. 计算平均置信度和 SNR 权重
  const avgConfidence =
    segmentations.reduce((sum, seg) => sum + seg.confidence, 0) /
    segmentations.length;

  const avgSnrWeights = {
    ch1:
      segmentations.reduce((sum, seg) => sum + seg.snrWeights.ch1, 0) /
      segmentations.length,
    ch2:
      segmentations.reduce((sum, seg) => sum + seg.snrWeights.ch2, 0) /
      segmentations.length,
    ch3:
      segmentations.reduce((sum, seg) => sum + seg.snrWeights.ch3, 0) /
      segmentations.length,
  };

  // 4. 统计峰值数量
  const totalPeakCount = segmentations.reduce((sum, seg) => sum + seg.peakCount, 0);
  const avgPeakCount = totalPeakCount / segmentations.length;
  const strategies = segmentations.map(seg => seg.detectionStrategy);
  const multiPeakCount = strategies.filter(s => s === 'multi').length;

  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(0);

  logger.log(
    `多峰值快速裁切完成：[${alignedStartIdx}, ${alignedEndIdx}], ` +
    `置信度: ${(avgConfidence * 100).toFixed(1)}%, ` +
    `平均峰值数: ${avgPeakCount.toFixed(1)}, ` +
    `多峰值采集: ${multiPeakCount}/${segmentations.length}, ` +
    `耗时: ${duration}ms`
  );

  // 5. 检查整体质量
  const alignedLength = alignedEndIdx - alignedStartIdx;
  // 注意：采集时要求 >= 100，但测试时放宽为 >= 50（实时信号可能较短）
  const isQualityAcceptable = alignedLength >= 50 && avgConfidence >= 0.15;
  const qualityReason = !isQualityAcceptable
    ? alignedLength < 50
      ? '信号过短'
      : '信号质量不达标'
    : '';

  return {
    startIdx: alignedStartIdx,
    endIdx: alignedEndIdx,
    confidence: avgConfidence,
    snrWeights: avgSnrWeights,
    isQualityAcceptable,
    qualityReason,
    peaks: [],
    peakCount: Math.round(avgPeakCount),
    detectionStrategy: multiPeakCount > segmentations.length / 2 ? 'multi' : 'single',
  };
}

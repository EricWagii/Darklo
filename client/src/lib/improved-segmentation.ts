/**
 * 改进的有效片段检测算法
 * 
 * 功能：
 * - 使用动态阈值检测有效波形
 * - 自动识别静态波形（前后等待）
 * - 保留波动幅度大的部分
 * - 更准确的有效片段识别
 */

export interface ImprovedSegmentationResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  energyProfile: number[];
  staticRegions: Array<{ start: number; end: number }>;
  activeRegions: Array<{ start: number; end: number }>;
}

/**
 * 计算局部能量（使用滑动窗口）
 */
function calculateLocalEnergy(signal: number[], windowSize: number = 20): number[] {
  const energy: number[] = [];
  
  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    // 计算均方根（RMS）
    const rms = Math.sqrt(
      window.reduce((sum, val) => sum + val * val, 0) / windowSize
    );
    energy.push(rms);
  }
  
  return energy;
}

/**
 * 计算局部变化率（检测波形变化）
 */
function calculateLocalVariation(signal: number[], windowSize: number = 20): number[] {
  const variation: number[] = [];
  
  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    // 计算相邻样本的差分
    let totalDiff = 0;
    for (let j = 1; j < window.length; j++) {
      totalDiff += Math.abs(window[j] - window[j - 1]);
    }
    const avgDiff = totalDiff / (windowSize - 1);
    variation.push(avgDiff);
  }
  
  return variation;
}

/**
 * 使用自适应阈值检测有效片段
 * 
 * 算法：
 * 1. 计算能量和变化率
 * 2. 使用自适应阈值（基于统计特性）
 * 3. 识别静态区域（低能量且低变化）
 * 4. 识别活跃区域（高能量或高变化）
 * 5. 返回第一个活跃区域到最后一个活跃区域
 */
export function detectValidSegmentImproved(
  signal: number[],
  options: {
    windowSize?: number;
    energyPercentile?: number; // 能量百分位数（0-100）
    variationPercentile?: number; // 变化率百分位数（0-100）
    minActiveLength?: number; // 最小活跃长度
  } = {}
): ImprovedSegmentationResult {
  const {
    windowSize = 20,
    energyPercentile = 25, // 使用 25% 百分位数作为阈值
    variationPercentile = 25,
    minActiveLength = 50, // 最少 50 个样本的活跃区域
  } = options;

  // 计算能量和变化率
  const energy = calculateLocalEnergy(signal, windowSize);
  const variation = calculateLocalVariation(signal, windowSize);

  if (energy.length === 0 || variation.length === 0) {
    return {
      startIdx: 0,
      endIdx: signal.length,
      confidence: 0,
      energyProfile: energy,
      staticRegions: [],
      activeRegions: [],
    };
  }

  // 计算百分位数阈值
  const sortedEnergy = [...energy].sort((a, b) => a - b);
  const sortedVariation = [...variation].sort((a, b) => a - b);

  const energyThreshold = sortedEnergy[Math.floor(energy.length * (energyPercentile / 100))];
  const variationThreshold = sortedVariation[Math.floor(variation.length * (variationPercentile / 100))];

  // 识别活跃点（高能量或高变化）
  const isActive = energy.map((e, i) => {
    return e > energyThreshold || variation[i] > variationThreshold;
  });

  // 识别活跃区域和静态区域
  const activeRegions: Array<{ start: number; end: number }> = [];
  const staticRegions: Array<{ start: number; end: number }> = [];

  let inActiveRegion = false;
  let regionStart = 0;

  for (let i = 0; i < isActive.length; i++) {
    if (isActive[i] && !inActiveRegion) {
      // 开始活跃区域
      inActiveRegion = true;
      regionStart = i * windowSize;
    } else if (!isActive[i] && inActiveRegion) {
      // 结束活跃区域
      inActiveRegion = false;
      const regionEnd = (i + 1) * windowSize;
      
      // 只记录足够长的活跃区域
      if (regionEnd - regionStart >= minActiveLength) {
        activeRegions.push({ start: regionStart, end: regionEnd });
      }
    }
  }

  // 处理最后一个活跃区域
  if (inActiveRegion) {
    const regionEnd = isActive.length * windowSize;
    if (regionEnd - regionStart >= minActiveLength) {
      activeRegions.push({ start: regionStart, end: regionEnd });
    }
  }

  // 识别静态区域（活跃区域之间的部分）
  if (activeRegions.length > 0) {
    // 前面的静态区域
    if (activeRegions[0].start > 0) {
      staticRegions.push({ start: 0, end: activeRegions[0].start });
    }

    // 中间的静态区域
    for (let i = 0; i < activeRegions.length - 1; i++) {
      if (activeRegions[i + 1].start > activeRegions[i].end) {
        staticRegions.push({
          start: activeRegions[i].end,
          end: activeRegions[i + 1].start,
        });
      }
    }

    // 后面的静态区域
    const lastActiveEnd = activeRegions[activeRegions.length - 1].end;
    if (lastActiveEnd < signal.length) {
      staticRegions.push({ start: lastActiveEnd, end: signal.length });
    }
  }

  // 确定最终的有效片段
  let startIdx = 0;
  let endIdx = signal.length;
  let confidence = 0;

  if (activeRegions.length > 0) {
    // 从第一个活跃区域开始到最后一个活跃区域结束
    startIdx = activeRegions[0].start;
    endIdx = activeRegions[activeRegions.length - 1].end;

    // 计算置信度（活跃区域总长度 / 总长度）
    const totalActiveLength = activeRegions.reduce((sum, r) => sum + (r.end - r.start), 0);
    confidence = totalActiveLength / signal.length;
  }

  return {
    startIdx: Math.max(0, startIdx),
    endIdx: Math.min(signal.length, endIdx),
    confidence: Math.min(1, confidence),
    energyProfile: energy,
    staticRegions,
    activeRegions,
  };
}

/**
 * 多次采集对齐 - 使用改进的算法
 */
export function alignMultipleCollectionsImproved(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): ImprovedSegmentationResult {
  if (collections.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      confidence: 0,
      energyProfile: [],
      staticRegions: [],
      activeRegions: [],
    };
  }

  // 对每个采集进行有效片段检测
  const segmentations = collections.map((col) =>
    detectValidSegmentImproved(col.ch2) // 使用 CH2（主信号）
  );

  // 找到所有采集的共同区间
  const minLength = Math.min(...collections.map((col) => col.ch2.length));

  // 计算每个采集的活跃比例
  const activeRatios = segmentations.map((seg) => {
    const activeLength = seg.endIdx - seg.startIdx;
    return activeLength / minLength;
  });

  // 使用中位数作为目标活跃比例
  const sortedRatios = [...activeRatios].sort((a, b) => a - b);
  const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];

  // 找到最接近中位数的采集作为参考
  let referenceIdx = 0;
  let minDiff = Math.abs(activeRatios[0] - medianRatio);
  for (let i = 1; i < activeRatios.length; i++) {
    const diff = Math.abs(activeRatios[i] - medianRatio);
    if (diff < minDiff) {
      minDiff = diff;
      referenceIdx = i;
    }
  }

  // 使用参考采集的有效片段作为基准
  const reference = segmentations[referenceIdx];

  // 计算所有采集与参考采集的对齐
  let alignedStartIdx = reference.startIdx;
  let alignedEndIdx = reference.endIdx;

  // 微调：考虑其他采集的有效片段
  const allStartIndices = segmentations.map((seg) => seg.startIdx);
  const allEndIndices = segmentations.map((seg) => seg.endIdx);

  // 使用中位数来获得鲁棒的对齐边界
  const sortedStarts = [...allStartIndices].sort((a, b) => a - b);
  const sortedEnds = [...allEndIndices].sort((a, b) => a - b);

  alignedStartIdx = sortedStarts[Math.floor(sortedStarts.length / 2)];
  alignedEndIdx = sortedEnds[Math.floor(sortedEnds.length / 2)];

  // 计算置信度
  const confidence = medianRatio;

  return {
    startIdx: Math.max(0, alignedStartIdx),
    endIdx: Math.min(minLength, alignedEndIdx),
    confidence: Math.min(1, confidence),
    energyProfile: reference.energyProfile,
    staticRegions: reference.staticRegions,
    activeRegions: reference.activeRegions,
  };
}

/**
 * 批量裁剪多个采集
 */
export function batchCropCollections(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): Array<{
  ch1: number[];
  ch2: number[];
  ch3: number[];
  trimStart: number;
  trimEnd: number;
}> {
  if (collections.length === 0) return [];

  // 使用改进的对齐算法
  const alignment = alignMultipleCollectionsImproved(collections);

  // 对每个采集进行裁剪
  return collections.map((col) => ({
    ch1: col.ch1.slice(alignment.startIdx, alignment.endIdx),
    ch2: col.ch2.slice(alignment.startIdx, alignment.endIdx),
    ch3: col.ch3.slice(alignment.startIdx, alignment.endIdx),
    trimStart: alignment.startIdx,
    trimEnd: alignment.endIdx,
  }));
}

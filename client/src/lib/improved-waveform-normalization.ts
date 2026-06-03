/**
 * 改进的波形裁剪和缩放算法
 * 
 * 目标：保留真正有效的EMG信号部分，避免过度裁剪或缩放导致的波形差异
 * 
 * 问题：
 * - 当前算法对不同幅度的信号进行独立缩放，导致同一指令的多次采集波形差异巨大
 * - 需要使用参考基准来统一缩放，保留相对幅度关系
 */

/**
 * 计算信号的有效部分（去除前后空白）
 * 使用能量阈值和斜率检测
 */
export function detectActiveSegment(
  signal: number[],
  energyThreshold: number = 0.1,
  minDuration: number = 10
): { start: number; end: number; confidence: number } {
  if (signal.length === 0) {
    return { start: 0, end: 0, confidence: 0 };
  }

  // 计算每个点的能量（平方）
  const energy = signal.map(x => x * x);
  const maxEnergy = Math.max(...energy);
  const threshold = maxEnergy * energyThreshold;

  // 寻找第一个超过阈值的点
  let start = 0;
  for (let i = 0; i < signal.length; i++) {
    if (energy[i] > threshold) {
      start = i;
      break;
    }
  }

  // 寻找最后一个超过阈值的点
  let end = signal.length - 1;
  for (let i = signal.length - 1; i >= 0; i--) {
    if (energy[i] > threshold) {
      end = i;
      break;
    }
  }

  // 检查有效段长度
  const duration = end - start;
  if (duration < minDuration) {
    return { start: 0, end: signal.length - 1, confidence: 0.3 };
  }

  // 计算置信度（基于有效段的能量占比）
  const activeEnergy = energy.slice(start, end + 1).reduce((a, b) => a + b, 0);
  const totalEnergy = energy.reduce((a, b) => a + b, 0);
  const confidence = totalEnergy > 0 ? activeEnergy / totalEnergy : 0.5;

  return { start, end, confidence };
}

/**
 * 基于参考基准的归一化缩放
 * 保留相对幅度关系，避免过度缩放
 */
export function normalizeWithReference(
  signal: number[],
  referenceAmplitude: number = 2000,
  preserveRange: boolean = true
): number[] {
  if (signal.length === 0) return [];

  const maxAbs = Math.max(...signal.map(Math.abs));
  if (maxAbs === 0) return signal;

  // 计算缩放因子
  const scaleFactor = referenceAmplitude / maxAbs;

  // 如果缩放因子太极端，限制范围
  const limitedScaleFactor = preserveRange
    ? Math.max(0.5, Math.min(2.0, scaleFactor))
    : scaleFactor;

  return signal.map(x => x * limitedScaleFactor);
}

/**
 * 改进的裁剪算法
 * 保留有效部分，同时避免过度裁剪
 */
export function improvedCropping(
  signal: number[],
  options?: {
    energyThreshold?: number;
    minDuration?: number;
    preserveMargin?: number;
  }
): {
  cropped: number[];
  start: number;
  end: number;
  confidence: number;
} {
  const {
    energyThreshold = 0.1,
    minDuration = 10,
    preserveMargin = 5,
  } = options || {};

  const segment = detectActiveSegment(signal, energyThreshold, minDuration);
  
  // 添加保留边距
  const start = Math.max(0, segment.start - preserveMargin);
  const end = Math.min(signal.length - 1, segment.end + preserveMargin);

  const cropped = signal.slice(start, end + 1);

  return {
    cropped,
    start,
    end,
    confidence: segment.confidence,
  };
}

/**
 * 改进的缩放算法
 * 使用全局参考基准而非局部最大值
 */
export function improvedScaling(
  signal: number[],
  globalMax?: number,
  options?: {
    targetAmplitude?: number;
    preserveRange?: boolean;
    usePercentile?: boolean;
    percentile?: number;
  }
): {
  scaled: number[];
  scaleFactor: number;
  originalMax: number;
} {
  const {
    targetAmplitude = 2000,
    preserveRange = true,
    usePercentile = false,
    percentile = 95,
  } = options || {};

  if (signal.length === 0) {
    return { scaled: [], scaleFactor: 1, originalMax: 0 };
  }

  let maxValue: number;

  if (usePercentile) {
    // 使用百分位数而非最大值，避免异常值影响
    const sorted = [...signal].map(Math.abs).sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    maxValue = sorted[index];
  } else if (globalMax !== undefined) {
    // 使用全局参考基准
    maxValue = globalMax;
  } else {
    // 使用局部最大值
    maxValue = Math.max(...signal.map(Math.abs));
  }

  if (maxValue === 0) {
    return { scaled: signal, scaleFactor: 1, originalMax: 0 };
  }

  const scaleFactor = targetAmplitude / maxValue;
  const limitedScaleFactor = preserveRange
    ? Math.max(0.5, Math.min(2.0, scaleFactor))
    : scaleFactor;

  const scaled = signal.map(x => x * limitedScaleFactor);

  return {
    scaled,
    scaleFactor: limitedScaleFactor,
    originalMax: maxValue,
  };
}

/**
 * 多通道协调裁剪
 * 确保三个通道使用相同的裁剪范围
 */
export function coordinatedCropping(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  options?: {
    energyThreshold?: number;
    minDuration?: number;
    preserveMargin?: number;
  }
): {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  start: number;
  end: number;
  confidence: number;
} {
  // 检测三个通道的活跃段
  const seg1 = detectActiveSegment(ch1, options?.energyThreshold);
  const seg2 = detectActiveSegment(ch2, options?.energyThreshold);
  const seg3 = detectActiveSegment(ch3, options?.energyThreshold);

  // 取并集（最早开始，最晚结束）
  const start = Math.min(seg1.start, seg2.start, seg3.start);
  const end = Math.max(seg1.end, seg2.end, seg3.end);

  // 添加保留边距
  const margin = options?.preserveMargin || 5;
  const finalStart = Math.max(0, start - margin);
  const finalEnd = Math.min(
    Math.max(ch1.length, ch2.length, ch3.length) - 1,
    end + margin
  );

  // 裁剪所有通道
  const cropped1 = ch1.slice(finalStart, finalEnd + 1);
  const cropped2 = ch2.slice(finalStart, finalEnd + 1);
  const cropped3 = ch3.slice(finalStart, finalEnd + 1);

  // 计算平均置信度
  const confidence = (seg1.confidence + seg2.confidence + seg3.confidence) / 3;

  return {
    ch1: cropped1,
    ch2: cropped2,
    ch3: cropped3,
    start: finalStart,
    end: finalEnd,
    confidence,
  };
}

/**
 * 多通道协调缩放
 * 使用相同的缩放因子确保通道间的相对关系
 */
export function coordinatedScaling(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  options?: {
    targetAmplitude?: number;
    preserveRange?: boolean;
    useGlobalMax?: boolean;
    usePercentile?: boolean;
    percentile?: number;
  }
): {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  scaleFactor: number;
  globalMax: number;
} {
  const {
    targetAmplitude = 2000,
    preserveRange = true,
    useGlobalMax = true,
    usePercentile = false,
    percentile = 95,
  } = options || {};

  let globalMax: number;

  if (usePercentile) {
    // 使用百分位数
    const allValues = [...ch1, ...ch2, ...ch3].map(Math.abs).sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * allValues.length);
    globalMax = allValues[index];
  } else if (useGlobalMax) {
    // 使用三个通道的最大值
    globalMax = Math.max(
      Math.max(...ch1.map(Math.abs)),
      Math.max(...ch2.map(Math.abs)),
      Math.max(...ch3.map(Math.abs))
    );
  } else {
    // 使用平均最大值
    const max1 = Math.max(...ch1.map(Math.abs));
    const max2 = Math.max(...ch2.map(Math.abs));
    const max3 = Math.max(...ch3.map(Math.abs));
    globalMax = (max1 + max2 + max3) / 3;
  }

  if (globalMax === 0) {
    return {
      ch1,
      ch2,
      ch3,
      scaleFactor: 1,
      globalMax: 0,
    };
  }

  const scaleFactor = targetAmplitude / globalMax;
  const limitedScaleFactor = preserveRange
    ? Math.max(0.5, Math.min(2.0, scaleFactor))
    : scaleFactor;

  return {
    ch1: ch1.map(x => x * limitedScaleFactor),
    ch2: ch2.map(x => x * limitedScaleFactor),
    ch3: ch3.map(x => x * limitedScaleFactor),
    scaleFactor: limitedScaleFactor,
    globalMax,
  };
}

/**
 * 综合处理流程
 * 结合裁剪和缩放，保留有效部分
 */
export function comprehensiveNormalization(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  referenceAmplitude?: number,
  options?: {
    energyThreshold?: number;
    minDuration?: number;
    preserveMargin?: number;
    targetAmplitude?: number;
    preserveRange?: boolean;
    usePercentile?: boolean;
    percentile?: number;
  }
): {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  croppingStart: number;
  croppingEnd: number;
  croppingConfidence: number;
  scaleFactor: number;
  globalMax: number;
} {
  // 第一步：协调裁剪
  const cropped = coordinatedCropping(ch1, ch2, ch3, {
    energyThreshold: options?.energyThreshold,
    minDuration: options?.minDuration,
    preserveMargin: options?.preserveMargin,
  });

  // 第二步：协调缩放
  const scaled = coordinatedScaling(
    cropped.ch1,
    cropped.ch2,
    cropped.ch3,
    {
      targetAmplitude: options?.targetAmplitude || referenceAmplitude || 2000,
      preserveRange: options?.preserveRange !== false,
      useGlobalMax: true,
      usePercentile: options?.usePercentile,
      percentile: options?.percentile,
    }
  );

  return {
    ch1: scaled.ch1,
    ch2: scaled.ch2,
    ch3: scaled.ch3,
    croppingStart: cropped.start,
    croppingEnd: cropped.end,
    croppingConfidence: cropped.confidence,
    scaleFactor: scaled.scaleFactor,
    globalMax: scaled.globalMax,
  };
}

/**
 * 计算参考幅度（用于多次采集的统一缩放）
 * 基于所有采集样本的统计
 */
export function calculateReferenceAmplitude(
  collections: Array<{
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>,
  method: 'mean' | 'median' | 'percentile' = 'median',
  percentile: number = 75
): number {
  if (collections.length === 0) return 2000;

  const maxValues = collections.map(col => {
    const max1 = Math.max(...col.ch1.map(Math.abs));
    const max2 = Math.max(...col.ch2.map(Math.abs));
    const max3 = Math.max(...col.ch3.map(Math.abs));
    return Math.max(max1, max2, max3);
  });

  switch (method) {
    case 'mean':
      return maxValues.reduce((a, b) => a + b, 0) / maxValues.length;
    case 'percentile':
      const sorted = [...maxValues].sort((a, b) => a - b);
      const index = Math.floor((percentile / 100) * sorted.length);
      return sorted[index];
    case 'median':
    default:
      const sorted2 = [...maxValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted2.length / 2);
      return sorted2.length % 2 === 0
        ? (sorted2[mid - 1] + sorted2[mid]) / 2
        : sorted2[mid];
  }
}

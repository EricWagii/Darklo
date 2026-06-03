/**
 * 自适应裁剪算法
 * 
 * 解决问题：
 * 1. 用户采集行为不规律（开始等待，结束立即停止）导致前后静息段不均
 * 2. 固定8%的静息基线假设不适用
 * 3. 需要动态检测有效波形的真实边界
 */

/**
 * 计算信号的能量包络
 * 使用滑动窗口计算局部能量
 */
export function computeEnergyEnvelope(
  signal: number[],
  windowSize: number = 50
): number[] {
  const envelope: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length, i + halfWindow);
    
    let energy = 0;
    for (let j = start; j < end; j++) {
      energy += signal[j] * signal[j];
    }
    
    envelope.push(Math.sqrt(energy / (end - start)));
  }

  return envelope;
}

/**
 * 计算信号的百分位数
 */
export function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((percentile / 100) * sorted.length);
  
  return sorted[Math.min(index, sorted.length - 1)];
}

/**
 * 自适应检测有效波形的起始点
 * 从左往右扫描，找到能量明显上升的点
 * 
 * 修复：改用全局分位数法而不是前N%参考
 * 原因：当信号全程都是噪声时，前N%和后N%能量相同，导致阈值失效
 */
export function detectOnsetPoint(
  envelope: number[],
  options: {
    noisePercentile?: number;  // 噪声能量百分位数（默认10%）
    peakPercentile?: number;   // 峰值能量百分位数（默认90%）
    thresholdRatio?: number;   // 阈值 = p10 + (p90-p10) × ratio（默认0.15）
    thresholdMultiplier?: number;  // 兼容旧参数名
    minDuration?: number;      // 最小持续样本数（默认30）
    minOnsetLength?: number;   // 兼容旧参数名
  } = {}
): number {
  const {
    noisePercentile = 10,
    peakPercentile = 90,
    thresholdRatio = options.thresholdRatio ?? ((options.thresholdMultiplier ?? 2.0) * 0.075),
    minDuration = options.minDuration ?? options.minOnsetLength ?? 30,
  } = options;

  if (envelope.length === 0) return 0;

  // 全局分位数法：不依赖头部静息
  const sorted = [...envelope].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * (noisePercentile / 100))];
  const p90 = sorted[Math.floor(sorted.length * (peakPercentile / 100))];
  
  // 阈值 = 噪声基线 + (峰值 - 噪声基线) × 0.15
  const threshold = p10 + (p90 - p10) * thresholdRatio;

  // 前向扫描：找到第一个能量超过阈值且持续超过minDuration样本的位置
  for (let i = 0; i < envelope.length - minDuration; i++) {
    if (envelope[i] > threshold) {
      // 验证持续性（防止误触发）
      const sustained = envelope.slice(i, i + minDuration).filter(e => e > threshold).length;
      if (sustained > minDuration * 0.6) {
        return Math.max(0, i - 5);  // 向前预留5个样本
      }
    }
  }
  
  return 0;  // fallback
}

/**
 * 自适应检测有效波形的结束点
 * 从右往左扫描，找到能量明显下降的点
 * 
 * 修复：改用全局分位数法而不是后N%参考
 */
export function detectOffsetPoint(
  envelope: number[],
  options: {
    noisePercentile?: number;  // 噪声能量百分位数（默认10%）
    peakPercentile?: number;   // 峰值能量百分位数（默认90%）
    thresholdRatio?: number;   // 阈值 = p10 + (p90-p10) × ratio（默认0.15）
    thresholdMultiplier?: number;  // 兼容旧参数名
    minDuration?: number;      // 最小持续样本数（默认30）
    minOffsetLength?: number;  // 兼容旧参数名
  } = {}
): number {
  const {
    noisePercentile = 10,
    peakPercentile = 90,
    thresholdRatio = options.thresholdRatio ?? ((options.thresholdMultiplier ?? 2.0) * 0.075),
    minDuration = options.minDuration ?? options.minOffsetLength ?? 30,
  } = options;

  if (envelope.length === 0) return envelope.length - 1;

  // 全局分位数法：不依赖尾部静息
  const sorted = [...envelope].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * (noisePercentile / 100))];
  const p90 = sorted[Math.floor(sorted.length * (peakPercentile / 100))];
  
  // 阈值 = 噪声基线 + (峰值 - 噪声基线) × 0.15
  const threshold = p10 + (p90 - p10) * thresholdRatio;

  // 后向扫描：找到最后一个能量超过阈值且持续超过minDuration样本的位置
  for (let i = envelope.length - 1; i >= minDuration; i--) {
    if (envelope[i] > threshold) {
      // 验证持续性（防止误触发）
      const sustained = envelope.slice(Math.max(0, i - minDuration), i).filter(e => e > threshold).length;
      if (sustained > minDuration * 0.6) {
        return Math.min(envelope.length - 1, i + 5);  // 向后预留5个样本
      }
    }
  }
  
  return envelope.length - 1;  // fallback
}

/**
 * 自适应裁剪算法 - 主函数
 * 动态检测有效波形边界，处理不均匀的静息段
 */
export function adaptiveCrop(
  signal: number[],
  options: {
    windowSize?: number;  // 能量计算窗口大小
    noisePercentile?: number;  // 噪声百分位数
    thresholdMultiplier?: number;  // 阈值倍数
    minSegmentLength?: number;  // 最小有效段长度
    preserveMargin?: number;  // 保留边际（样本数）
  } = {}
): {
  croppedSignal: number[];
  startIdx: number;
  endIdx: number;
  confidence: number;
} {
  const {
    windowSize = 50,
    noisePercentile = 25,
    thresholdMultiplier = 2.0,
    minSegmentLength = 100,
    preserveMargin = 20,  // 保留前后20个样本作为缓冲
  } = options;

  if (signal.length === 0) {
    return {
      croppedSignal: [],
      startIdx: 0,
      endIdx: 0,
      confidence: 0,
    };
  }

  // 1. 计算能量包络
  const envelope = computeEnergyEnvelope(signal, windowSize);

  // 2. 检测起始点和结束点
  const onsetIdx = detectOnsetPoint(envelope, {
    noisePercentile,
    thresholdMultiplier,
    minOnsetLength: minSegmentLength,
  });

  const offsetIdx = detectOffsetPoint(envelope, {
    noisePercentile,
    thresholdMultiplier,
    minOffsetLength: minSegmentLength,
  });

  // 3. 应用保留边际
  let startIdx = Math.max(0, onsetIdx - preserveMargin);
  let endIdx = Math.min(signal.length - 1, offsetIdx + preserveMargin);

  // 4. 确保最小长度
  if (endIdx - startIdx < minSegmentLength) {
    const center = (startIdx + endIdx) / 2;
    startIdx = Math.max(0, Math.floor(center - minSegmentLength / 2));
    endIdx = Math.min(signal.length - 1, Math.floor(center + minSegmentLength / 2));
  }

  // 5. 提取裁剪后的信号
  const croppedSignal = signal.slice(startIdx, endIdx + 1);

  // 6. 计算置信度（基于有效段长度占比）
  const validSegmentLength = endIdx - startIdx + 1;
  const totalLength = signal.length;
  const confidence = Math.max(0, Math.min(1.0, validSegmentLength / (totalLength * 0.8))); // 期望有效段占80%

  return {
    croppedSignal,
    startIdx,
    endIdx,
    confidence,
  };
}

/**
 * 多通道自适应裁剪
 * 对三个通道分别进行裁剪，然后取并集以保留最多的有效信息
 */
export function adaptiveCropMultiChannel(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  options: any = {}
): {
  croppedCh1: number[];
  croppedCh2: number[];
  croppedCh3: number[];
  startIdx: number;
  endIdx: number;
  confidence: number;
} {
  // 对每个通道进行裁剪
  const result1 = adaptiveCrop(ch1, options);
  const result2 = adaptiveCrop(ch2, options);
  const result3 = adaptiveCrop(ch3, options);

  // 取并集（最左边的起点，最右边的终点）
  const startIdx = Math.min(result1.startIdx, result2.startIdx, result3.startIdx);
  const endIdx = Math.max(result1.endIdx, result2.endIdx, result3.endIdx);

  // 使用并集范围重新裁剪所有通道
  const croppedCh1 = ch1.slice(startIdx, endIdx + 1);
  const croppedCh2 = ch2.slice(startIdx, endIdx + 1);
  const croppedCh3 = ch3.slice(startIdx, endIdx + 1);

  // 平均置信度（确保在0-1之间）
  const confidence = Math.max(0, Math.min(1.0, (result1.confidence + result2.confidence + result3.confidence) / 3));

  return {
    croppedCh1,
    croppedCh2,
    croppedCh3,
    startIdx,
    endIdx,
    confidence,
  };
}

/**
 * 分析裁剪结果的质量
 */
export function analyzeCroppingQuality(
  originalLength: number,
  croppedLength: number,
  confidence: number
): {
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  score: number;
  details: string;
} {
  const retentionRatio = croppedLength / originalLength;
  
  // 计算质量评分
  let score = confidence * 100;
  
  // 如果保留比例过高（>90%），说明裁剪不足
  if (retentionRatio > 0.9) {
    score *= 0.8;
  }
  
  // 如果保留比例过低（<30%），说明裁剪过度
  if (retentionRatio < 0.3) {
    score *= 0.7;
  }

  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 85) {
    quality = 'excellent';
  } else if (score >= 70) {
    quality = 'good';
  } else if (score >= 50) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }

  const details = `保留比例: ${(retentionRatio * 100).toFixed(1)}%, 置信度: ${(confidence * 100).toFixed(1)}%`;

  return { quality, score, details };
}

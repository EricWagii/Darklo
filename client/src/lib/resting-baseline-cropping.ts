/**
 * 双端静息估计法 - 独立裁剪算法
 * 
 * 原理：EMG采集通常开头和结尾一定有静息段（按下按钮前/松开后）。
 * 利用波形头部和尾部各取一小段来估计基线噪声，用这个噪声水平的倍数作为阈值。
 * 
 * 优势：
 * - 完全独立于其他波形，错乱数据零影响
 * - 阈值锚定在真实噪声水平，而不是统计参数
 * - 弱信号和强信号都能正确处理
 */

/**
 * 计算RMS能量
 */
function computeRMSEnergy(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): number[] {
  const energy: number[] = [];
  const n = Math.min(ch1.length, ch2.length, ch3.length);

  for (let i = 0; i <= n - windowSize; i += windowSize) {
    let sum1 = 0, sum2 = 0, sum3 = 0;

    for (let j = 0; j < windowSize; j++) {
      sum1 += ch1[i + j] * ch1[i + j];
      sum2 += ch2[i + j] * ch2[i + j];
      sum3 += ch3[i + j] * ch3[i + j];
    }

    const rms1 = Math.sqrt(sum1 / windowSize);
    const rms2 = Math.sqrt(sum2 / windowSize);
    const rms3 = Math.sqrt(sum3 / windowSize);

    // 三通道融合：取平均
    energy.push((rms1 + rms2 + rms3) / 3);
  }

  return energy;
}

/**
 * 计算均值
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * 计算标准差
 */
function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, val) => sum + (val - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export interface CroppingResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  method: 'resting-baseline' | 'degraded';
  reason?: string;
}

/**
 * 双端静息估计法裁剪
 * 
 * @param ch1 通道1的采样数据
 * @param ch2 通道2的采样数据
 * @param ch3 通道3的采样数据
 * @param windowSize 能量计算的窗口大小（默认20）
 * @param restSampleRatio 取头尾各多少比例的段估基线（默认0.08=8%）
 * @param snrMultiplier 阈值倍数（默认3.5，弱信号可降低到2.5）
 * @returns 裁剪结果
 */
export function cropByRestingBaseline(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20,
  restSampleRatio: number = 0.08,
  snrMultiplier: number = 3.5
): CroppingResult {
  // 计算能量序列
  const energy = computeRMSEnergy(ch1, ch2, ch3, windowSize);
  const n = energy.length;

  if (n < 10) {
    // 数据太短，返回全段
    return {
      startIdx: 0,
      endIdx: ch1.length,
      confidence: 0.1,
      method: 'degraded',
      reason: '数据长度过短'
    };
  }

  // 取头尾各一小段估计基线
  const restLen = Math.max(5, Math.floor(n * restSampleRatio));
  const restSamples = [
    ...energy.slice(0, restLen),
    ...energy.slice(n - restLen)
  ];

  const restMean = mean(restSamples);
  const restStd = stdDev(restSamples);

  // 阈值 = 静息均值 + N倍标准差（只基于纯噪声段）
  const threshold = restMean + snrMultiplier * restStd;

  // 前向扫描找起点
  let start = 0;
  for (let i = 0; i < n; i++) {
    if (energy[i] > threshold) {
      start = i;
      break;
    }
  }

  // 后向扫描找终点
  let end = n;
  for (let i = n - 1; i >= 0; i--) {
    if (energy[i] > threshold) {
      end = i + 1;
      break;
    }
  }

  // 检查是否找到有效段
  if (start >= end) {
    // 没有找到超过阈值的点，返回全段
    return {
      startIdx: 0,
      endIdx: ch1.length,
      confidence: 0.15,
      method: 'degraded',
      reason: '未找到超过阈值的信号'
    };
  }

  // 置信度：基线与有效段能量的对比度
  const activeMean = mean(energy.slice(start, end));
  const contrast = (activeMean - restMean) / (restMean + 1e-9);
  const confidence = Math.max(0, Math.min(1, contrast / 5)); // 对比度5倍时置信度满

  // 转换回样本索引
  let startSampleIdx = start * windowSize;
  let endSampleIdx = Math.min(end * windowSize, ch1.length);

  // 反序防护：如果反序则交换
  if (startSampleIdx > endSampleIdx) {
    [startSampleIdx, endSampleIdx] = [endSampleIdx, startSampleIdx];
    console.warn(
      `[双端静息估计] 检测到反序索引，已自动交换: ` +
      `原始[${start * windowSize}, ${end * windowSize}] → ` +
      `修正[${startSampleIdx}, ${endSampleIdx}]`
    );
  }

  // 长度检查：确保有效段长度 > 0
  if (startSampleIdx >= endSampleIdx) {
    console.warn(
      `[双端静息估计] 有效段长度无效 (${endSampleIdx - startSampleIdx}), ` +
      `返回全段`
    );
    return {
      startIdx: 0,
      endIdx: ch1.length,
      confidence: 0.2,
      method: 'degraded',
      reason: `有效段长度无效，返回全段`
    };
  }

  return {
    startIdx: startSampleIdx,
    endIdx: endSampleIdx,
    confidence,
    method: 'resting-baseline',
    reason: `对比度=${contrast.toFixed(2)}, 阈值=${threshold.toFixed(2)}`
  };
}

/**
 * 批量裁剪多条波形（独立处理）
 */
/**
 * 批量裁剪多条波形（独立处理）
 * 关键：每条波形独立裁剪，互不影响
 */
export function batchCroppingByRestingBaseline(
  collections: Array<{
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>
): CroppingResult[] {
  return collections.map((col, index) => {
    const result = cropByRestingBaseline(col.ch1, col.ch2, col.ch3);
    
    // 验证结果有效性
    if (result.startIdx >= result.endIdx) {
      console.error(
        `[批量裁剪] 第${index}条波形裁剪结果无效: ` +
        `startIdx=${result.startIdx}, endIdx=${result.endIdx}`
      );
    }
    
    return result;
  });
}

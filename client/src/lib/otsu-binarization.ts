/**
 * Otsu二值化 - 医学EMG信号处理的标准方法
 * 
 * 原理：Otsu是图像二值化的经典算法，可以直接用在一维能量序列上。
 * 它会自动在能量直方图中找到将"静息"和"激活"分开的最优阈值，完全自适应。
 * 
 * 优势：
 * - 对信号强度完全自适应
 * - 弱指令和强指令都能正确切割
 * - 无需预设任何参数
 * 
 * 缺点：当静息和激活能量差异不大（SNR很低）时可能失效
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
 * Otsu阈值计算
 * 
 * 算法步骤：
 * 1. 构建能量直方图（256个bin）
 * 2. 遍历所有可能的阈值
 * 3. 对每个阈值计算类间方差
 * 4. 选择使类间方差最大的阈值
 */
export function otsuThreshold(energy: number[]): number {
  if (energy.length === 0) return 0;

  // 量化到256级
  const min = Math.min(...energy);
  const max = Math.max(...energy);
  const bins = 256;
  const hist = new Array(bins).fill(0);

  // 构建直方图
  for (const v of energy) {
    const bin = Math.min(
      bins - 1,
      Math.floor(((v - min) / (max - min + 1e-9)) * (bins - 1))
    );
    hist[bin]++;
  }

  const total = energy.length;
  let sumAll = 0;

  // 计算加权和
  for (let i = 0; i < bins; i++) {
    sumAll += i * hist[i];
  }

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let bestT = 0;

  // 遍历所有可能的阈值
  for (let t = 0; t < bins; t++) {
    wB += hist[t];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;

    // 类间方差
    const variance = wB * wF * (mB - mF) ** 2;

    if (variance > maxVar) {
      maxVar = variance;
      bestT = t;
    }
  }

  // 反量化回原始能量值
  return min + (bestT / (bins - 1)) * (max - min);
}

export interface OtsuCroppingResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  method: 'otsu';
  activeRatio: number; // 有效段占比
  reason?: string;
}

/**
 * 使用Otsu阈值进行裁剪
 */
export function cropByOtsu(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): OtsuCroppingResult {
  // 计算能量序列
  const energy = computeRMSEnergy(ch1, ch2, ch3, windowSize);
  const n = energy.length;

  if (n < 10) {
    return {
      startIdx: 0,
      endIdx: ch1.length,
      confidence: 0.1,
      method: 'otsu',
      activeRatio: 1.0,
      reason: '数据长度过短'
    };
  }

  // 计算Otsu阈值
  const threshold = otsuThreshold(energy);

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
    return {
      startIdx: 0,
      endIdx: ch1.length,
      confidence: 0.15,
      method: 'otsu',
      activeRatio: 1.0,
      reason: '未找到超过Otsu阈值的信号'
    };
  }

  // 计算有效段占比
  const activeRatio = (end - start) / n;

  // 置信度：有效段占比越接近50%，置信度越高
  // 太小（<10%）或太大（>90%）都表示SNR很低
  const confidence =
    activeRatio >= 0.1 && activeRatio <= 0.9
      ? Math.min(activeRatio, 1 - activeRatio) * 2 // 最高1.0
      : 0.3;

  return {
    startIdx: start * windowSize,
    endIdx: end * windowSize,
    confidence,
    method: 'otsu',
    activeRatio,
    reason: `Otsu阈值=${threshold.toFixed(2)}, 有效段占比=${(activeRatio * 100).toFixed(1)}%`
  };
}

/**
 * 批量裁剪多条波形（独立处理）
 */
export function batchCroppingByOtsu(
  collections: Array<{
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>
): OtsuCroppingResult[] {
  return collections.map((col) => cropByOtsu(col.ch1, col.ch2, col.ch3));
}

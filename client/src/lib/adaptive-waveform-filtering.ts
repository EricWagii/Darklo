/**
 * 自适应波形滤波模块
 * 
 * 使用静息基线作为噪声参考，进行自适应降噪
 * 支持多种滤波方法：高通滤波、自适应滤波、谱减法等
 */

/**
 * 计算信号的直流偏移（DC offset）
 * @param signal 信号数组
 * @returns DC偏移值
 */
export function calculateDCOffset(signal: number[]): number {
  if (signal.length === 0) return 0;
  const sum = signal.reduce((a, b) => a + b, 0);
  return sum / signal.length;
}

/**
 * 计算信号的标准差
 * @param signal 信号数组
 * @returns 标准差
 */
export function calculateStandardDeviation(signal: number[]): number {
  if (signal.length === 0) return 0;
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length;
  return Math.sqrt(variance);
}

/**
 * 计算信噪比（SNR）
 * @param signal 信号
 * @param noise 噪声
 * @returns SNR (dB)
 */
export function calculateSNR(signal: number[], noise: number[]): number {
  const signalPower = signal.reduce((sum, val) => sum + val * val, 0) / signal.length;
  const noisePower = noise.reduce((sum, val) => sum + val * val, 0) / signal.length;
  
  if (noisePower === 0) return 100; // 避免除以0
  
  const snr = 10 * Math.log10(signalPower / noisePower);
  return Math.max(0, snr); // 确保SNR非负
}

/**
 * 一阶高通滤波器
 * 用于去除低频漂移
 * @param signal 输入信号
 * @param cutoffFreq 截止频率 (Hz)
 * @param samplingRate 采样率 (Hz)
 * @returns 滤波后的信号
 */
export function highPassFilter(
  signal: number[],
  cutoffFreq: number = 20,
  samplingRate: number = 500
): number[] {
  if (signal.length === 0) return [];

  // 计算滤波系数
  const rc = 1 / (2 * Math.PI * cutoffFreq);
  const dt = 1 / samplingRate;
  // ✅ 修复10：正确的高通滤波器系数计算
  // 标准一阶高通：alpha = rc / (rc + dt)
  const alpha = rc / (rc + dt);

  const filtered: number[] = [];
  let prevOutput = 0;

  for (let i = 0; i < signal.length; i++) {
    if (i === 0) {
      filtered.push(0);
      prevOutput = signal[i];
    } else {
      // 高通滤波：y[n] = alpha * (y[n-1] + x[n] - x[n-1])
      const output = alpha * (prevOutput + signal[i] - signal[i - 1]);
      filtered.push(output);
      prevOutput = output;
    }
  }

  return filtered;
}

/**
 * 自适应滤波：使用静息基线进行降噪
 * @param signal 输入信号
 * @param restingBaseline 静息基线信号
 * @param adaptationRate 自适应速率 (0-1)
 * @returns 滤波后的信号
 */
export function adaptiveNoiseFiltering(
  signal: number[],
  restingBaseline: number[],
  adaptationRate: number = 0.1
): number[] {
  if (signal.length === 0) return [];
  if (restingBaseline.length === 0) return signal;

  // 确保基线长度与信号相同
  const baseline = restingBaseline.length === signal.length
    ? restingBaseline
    : resampleSignal(restingBaseline, signal.length);

  const filtered: number[] = [];
  let estimatedNoise = baseline[0];

  for (let i = 0; i < signal.length; i++) {
    // 更新噪声估计
    estimatedNoise = (1 - adaptationRate) * estimatedNoise + adaptationRate * baseline[i];
    
    // 从信号中减去估计的噪声
    filtered.push(signal[i] - estimatedNoise);
  }

  return filtered;
}

/**
 * 谱减法降噪
 * 在频域中减去噪声谱
 * @param signal 输入信号
 * @param restingBaseline 静息基线
 * @param noiseReductionFactor 噪声减少因子 (0-1)
 * @returns 滤波后的信号
 */
export function spectralSubtractionFiltering(
  signal: number[],
  restingBaseline: number[],
  noiseReductionFactor: number = 0.8
): number[] {
  if (signal.length === 0) return [];
  if (restingBaseline.length === 0) return signal;

  // 简化版本：在时域中进行谱减法近似
  const baseline = restingBaseline.length === signal.length
    ? restingBaseline
    : resampleSignal(restingBaseline, signal.length);

  const filtered: number[] = [];
  const windowSize = 20; // 窗口大小

  for (let i = 0; i < signal.length; i++) {
    // 计算局部能量
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(signal.length, i + Math.ceil(windowSize / 2));
    
    let signalEnergy = 0;
    let noiseEnergy = 0;

    for (let j = start; j < end; j++) {
      signalEnergy += signal[j] * signal[j];
      noiseEnergy += baseline[j] * baseline[j];
    }

    // 应用谱减法
    const reducedEnergy = Math.max(0, signalEnergy - noiseReductionFactor * noiseEnergy);
    const scaleFactor = reducedEnergy > 0 ? Math.sqrt(reducedEnergy / signalEnergy) : 0;

    filtered.push(signal[i] * scaleFactor);
  }

  return filtered;
}

/**
 * 中值滤波器（用于去除脉冲噪声）
 * @param signal 输入信号
 * @param windowSize 窗口大小（必须为奇数）
 * @returns 滤波后的信号
 */
export function medianFilter(
  signal: number[],
  windowSize: number = 5
): number[] {
  if (signal.length === 0) return [];
  if (windowSize < 1) windowSize = 1;
  if (windowSize % 2 === 0) windowSize++; // 确保为奇数

  const filtered: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length, i + halfWindow + 1);
    
    const window = signal.slice(start, end).sort((a, b) => a - b);
    const median = window[Math.floor(window.length / 2)];
    
    filtered.push(median);
  }

  return filtered;
}

/**
 * 信号重采样（改变采样率）
 * @param signal 输入信号
 * @param targetLength 目标长度
 * @returns 重采样后的信号
 */
export function resampleSignal(
  signal: number[],
  targetLength: number
): number[] {
  if (signal.length === 0) return [];
  if (signal.length === targetLength) return signal;

  const resampled: number[] = [];
  const ratio = (signal.length - 1) / (targetLength - 1);

  for (let i = 0; i < targetLength; i++) {
    const index = i * ratio;
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    const fraction = index - lowerIndex;

    if (lowerIndex === upperIndex) {
      resampled.push(signal[lowerIndex]);
    } else {
      // 线性插值
      const interpolated = signal[lowerIndex] * (1 - fraction) + signal[upperIndex] * fraction;
      resampled.push(interpolated);
    }
  }

  return resampled;
}

/**
 * 多通道自适应滤波
 * @param ch1 通道1
 * @param ch2 通道2
 * @param ch3 通道3
 * @param restingBaseline 静息基线 { ch1, ch2, ch3 }
 * @returns 滤波后的三通道信号
 */
export function adaptiveFilterMultiChannel(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  restingBaseline?: { ch1: number[]; ch2: number[]; ch3: number[] }
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  // 如果没有提供基线，使用高通滤波
  if (!restingBaseline) {
    return {
      ch1: highPassFilter(ch1),
      ch2: highPassFilter(ch2),
      ch3: highPassFilter(ch3),
    };
  }

  // 使用自适应滤波
  return {
    ch1: adaptiveNoiseFiltering(ch1, restingBaseline.ch1),
    ch2: adaptiveNoiseFiltering(ch2, restingBaseline.ch2),
    ch3: adaptiveNoiseFiltering(ch3, restingBaseline.ch3),
  };
}

/**
 * 综合滤波流程
 * 结合多种滤波方法
 * @param ch1 通道1
 * @param ch2 通道2
 * @param ch3 通道3
 * @param restingBaseline 静息基线
 * @param samplingRate 采样率
 * @returns 滤波后的三通道信号
 */
/**
 * 陷波滤波器（去除工频干扰 50Hz）
 * 使用二阶 IIR 陷波滤波器
 * Q值越高，陷波越窄越深
 */
export function notchFilter(
  signal: number[],
  notchFreq: number = 50,
  samplingRate: number = 500,
  Q: number = 35
): number[] {
  const w0 = (2 * Math.PI * notchFreq) / samplingRate;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = 1;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  const b0_norm = b0 / a0;
  const b1_norm = b1 / a0;
  const b2_norm = b2 / a0;
  const a1_norm = a1 / a0;
  const a2_norm = a2 / a0;

  const filtered: number[] = [];
  let y1 = 0, y2 = 0;
  let x1 = 0, x2 = 0;

  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = b0_norm * x0 + b1_norm * x1 + b2_norm * x2 - a1_norm * y1 - a2_norm * y2;
    filtered.push(y0);
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return filtered;
}

export function comprehensiveFiltering(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  restingBaseline?: { ch1: number[]; ch2: number[]; ch3: number[] },
  samplingRate: number = 500
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  // 第1步：高通滤波去除低频漂移
  let filtered1 = highPassFilter(ch1, 20, samplingRate);
  let filtered2 = highPassFilter(ch2, 20, samplingRate);
  let filtered3 = highPassFilter(ch3, 20, samplingRate);

  // 第2步：陷波滤波去除工频干扰（50Hz）
  // 关键修复：ch1 的高 RMS 来自 50Hz 工频噪声，必须在这里去除
  filtered1 = notchFilter(filtered1, 50, samplingRate, 35);
  filtered2 = notchFilter(filtered2, 50, samplingRate, 35);
  filtered3 = notchFilter(filtered3, 50, samplingRate, 35);

  // 第3步：中值滤波去除脉冲噪声
  filtered1 = medianFilter(filtered1, 5);
  filtered2 = medianFilter(filtered2, 5);
  filtered3 = medianFilter(filtered3, 5);

  // 第4步：自适应滤波（如果有基线）
  if (restingBaseline) {
    const adaptive = adaptiveFilterMultiChannel(
      filtered1,
      filtered2,
      filtered3,
      {
        ch1: medianFilter(restingBaseline.ch1, 5),
        ch2: medianFilter(restingBaseline.ch2, 5),
        ch3: medianFilter(restingBaseline.ch3, 5),
      }
    );
    filtered1 = adaptive.ch1;
    filtered2 = adaptive.ch2;
    filtered3 = adaptive.ch3;
  }

  return {
    ch1: filtered1,
    ch2: filtered2,
    ch3: filtered3,
  };
}

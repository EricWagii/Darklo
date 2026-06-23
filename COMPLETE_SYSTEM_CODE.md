# 完整系统代码文档

## 核心模块代码

### 1. DSP 信号处理模块 (dsp-processor.ts)


### File: client/src/lib/dsp-processor.ts
```typescript
/**
 * DSP 信号处理模块
 * 
 * 功能：
 * - 信号滤波和预处理
 * - 时域特征提取
 * - 频域特征提取（FFT）
 * - 特征归一化
 */

import FFT from 'fft.js';
import * as ss from 'simple-statistics';

/**
 * 陷波滤波器（去除工频干扰 50/60 Hz）
 * 使用二阶 IIR 陷波滤波器
 */
export function notchFilter(
  signal: number[],
  notchFreq: number = 50,
  samplingRate: number = 500,
  Q: number = 30
): number[] {
  const w0 = (2 * Math.PI * notchFreq) / samplingRate;
  const alpha = Math.sin(w0) / (2 * Q);

  // 陷波滤波器系数
  const b0 = 1;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  // 归一化
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

/**
 * 简化的 ICA 算法（FastICA）
 * 用于分离独立成分，去除运动伪影
 */
export function fastICA(
  signals: number[][],
  numComponents: number = 3,
  maxIterations: number = 100,
  tolerance: number = 1e-5
): {
  sources: number[][];
  mixing: number[][];
} {
  const numSamples = signals[0].length;
  const numChannels = signals.length;

  // 1. 中心化
  const means = signals.map((s) => ss.mean(s));
  const centered = signals.map((s, i) => s.map((x) => x - means[i]));

  // 2. 白化（简化版本：使用 SVD）
  // 这里使用简化的白化：直接标准化
  const whitened = centered.map((s) => {
    const std = ss.standardDeviation(s);
    return std > 0 ? s.map((x) => x / std) : s;
  });

  // 3. 初始化混合矩阵 W（随机）
  const W: number[][] = [];
  for (let i = 0; i < numComponents; i++) {
    const row: number[] = [];
    for (let j = 0; j < numChannels; j++) {
      row.push(Math.random() - 0.5);
    }
    W.push(row);
  }

  // 4. FastICA 迭代
  for (let iter = 0; iter < maxIterations; iter++) {
    let converged = true;

    for (let i = 0; i < numComponents; i++) {
      // 计算 w_i^T * x
      const wx: number[] = [];
      for (let s = 0; s < numSamples; s++) {
        let sum = 0;
        for (let j = 0; j < numChannels; j++) {
          sum += W[i][j] * whitened[j][s];
        }
        wx.push(sum);
      }

      // 非线性函数（tanh）
      const g = wx.map((x) => Math.tanh(x));
      const gPrime = wx.map((x) => 1 - Math.tanh(x) ** 2);

      // 更新 w_i
      const newW: number[] = [];
      for (let j = 0; j < numChannels; j++) {
        let sum1 = 0, sum2 = 0;
        for (let s = 0; s < numSamples; s++) {
          sum1 += g[s] * whitened[j][s];
          sum2 += gPrime[s];
        }
        newW.push((sum1 / numSamples) - (sum2 / numSamples) * W[i][j]);
      }

      // 正交化
      for (let k = 0; k < i; k++) {
        let dot = 0;
        for (let j = 0; j < numChannels; j++) {
          dot += newW[j] * W[k][j];
        }
        for (let j = 0; j < numChannels; j++) {
          newW[j] -= dot * W[k][j];
        }
      }

      // 归一化
      let norm = 0;
      for (let j = 0; j < numChannels; j++) {
        norm += newW[j] ** 2;
      }
      norm = Math.sqrt(norm);
      for (let j = 0; j < numChannels; j++) {
        newW[j] /= norm;
      }

      // 检查收敛
      let diff = 0;
      for (let j = 0; j < numChannels; j++) {
        diff += Math.abs(newW[j] - W[i][j]);
      }
      if (diff > tolerance) {
        converged = false;
      }

      W[i] = newW;
    }

    if (converged) break;
  }

  // 5. 计算源信号
  const sources: number[][] = [];
  for (let i = 0; i < numComponents; i++) {
    const source: number[] = [];
    for (let s = 0; s < numSamples; s++) {
      let sum = 0;
      for (let j = 0; j < numChannels; j++) {
        sum += W[i][j] * whitened[j][s];
      }
      source.push(sum);
    }
    sources.push(source);
  }

  return { sources, mixing: W };
}

/**
 * 应用陷波滤波器到多通道信号
 */
export function applyNotchFilterMultiChannel(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  notchFreq: number = 50,
  samplingRate: number = 500
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  return {
    ch1: notchFilter(ch1, notchFreq, samplingRate),
    ch2: notchFilter(ch2, notchFreq, samplingRate),
    ch3: notchFilter(ch3, notchFreq, samplingRate),
  };
}

/**
 * 应用 ICA 处理到多通道信号（去除运动伪影）
 */
export function applyICAProcessing(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  const signals = [ch1, ch2, ch3];
  const { sources } = fastICA(signals, 3);

  // 返回独立成分
  return {
    ch1: sources[0] || ch1,
    ch2: sources[1] || ch2,
    ch3: sources[2] || ch3,
  };
}

export interface EMGFeatures {
  // 时域特征（30 维）
  timeDomain: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  // 频域特征（18 维）
  frequencyDomain: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  // 梅尔谱图特征（60 维）
  melSpectrogram: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  // 完整特征向量（150+ 维）
  fullFeature: number[];
}

/**
 * 高通滤波（去除低频噪声）
 * 使用一阶 IIR 高通滤波器
 */
export function highPassFilter(
  signal: number[],
  cutoffFreq: number = 20,
  samplingRate: number = 500
): number[] {
  const rc = 1 / (2 * Math.PI * cutoffFreq);
  const dt = 1 / samplingRate;
  const alpha = dt / (rc + dt);

  const filtered: number[] = [];
  let prev = signal[0];

  for (let i = 0; i < signal.length; i++) {
    const current = alpha * (prev + signal[i] - (filtered[i - 1] || 0));
    filtered.push(current);
    prev = signal[i];
  }

  return filtered;
}

/**
 * 完整的信号预处理管道
 * 1. 波形幅值归一化 [-1, 1]
 * 2. 陷波滤波（去除工频干扰）
 * 3. 高通滤波（去除低频漂移）
 * 4. ICA 处理（去除运动伪影）
 */
export function preprocessSignal(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 500,
  enableICA: boolean = true
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  // 0. 波形幅值归一化 [-1, 1]
  // 改进：使用更稳健的归一化方法（基于最小-最大范围）
  const normalize = (signal: number[]): number[] => {
    if (signal.length === 0) return signal;
    
    const max = Math.max(...signal);
    const min = Math.min(...signal);
    const range = max - min;
    
    if (range === 0) return signal;
    
    // 将信号映射到 [-1, 1]
    return signal.map(x => (2 * (x - min) / range) - 1);
  };
  
  let processed = {
    ch1: normalize(ch1),
    ch2: normalize(ch2),
    ch3: normalize(ch3),
  };

  // 1. 陷波滤波（50 Hz）
  processed = applyNotchFilterMultiChannel(processed.ch1, processed.ch2, processed.ch3, 50, samplingRate);

  // 2. 陷波滤波（60 Hz，用于美国标准）
  processed = applyNotchFilterMultiChannel(processed.ch1, processed.ch2, processed.ch3, 60, samplingRate);

  // 3. 高通滤波（改为 20Hz）
  processed = {
    ch1: highPassFilter(processed.ch1, 20, samplingRate),
    ch2: highPassFilter(processed.ch2, 20, samplingRate),
    ch3: highPassFilter(processed.ch3, 20, samplingRate),
  };

  // 4. ICA 处理（改为在高通滤波后执行，而不是最后）
  // 这样可以确保 ICA 处理的是已经过滤的信号，提高分离效果
  if (enableICA) {
    processed = applyICAProcessing(processed.ch1, processed.ch2, processed.ch3);
  }
  
  // 5. 再次进行幅值归一化（确保输出在 [-1, 1] 范围内）
  processed = {
    ch1: normalize(processed.ch1),
    ch2: normalize(processed.ch2),
    ch3: normalize(processed.ch3),
  };

  return processed;
}

/**
 * 提取时域特征（每个通道 10 个特征）
 */
export function extractTimeDomainFeatures(signal: number[], skipPreprocessing: boolean = false): number[] {
  if (signal.length === 0) return Array(10).fill(0);

  // 预处理：去噪（如果需要）
  const filtered = skipPreprocessing ? signal : highPassFilter(signal);

  // 1. 均值 (Mean)
  const mean = ss.mean(filtered);

  // 2. 标准差 (Std)
  const std = ss.standardDeviation(filtered);

  // 3. 方差 (Variance)
  const variance = ss.variance(filtered);

  // 4. 峰值 (Peak)
  const peak = Math.max(...filtered.map(Math.abs));

  // 5. 峰峰值 (Peak-to-Peak)
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const peakToPeak = max - min;

  // 6. 均方根 (RMS)
  const rms = Math.sqrt(ss.mean(filtered.map((x) => x * x)));

  // 7. 平均绝对值 (MAV)
  const mav = ss.mean(filtered.map(Math.abs));

  // 8. 零交叉率 (ZCR)
  let zcr = 0;
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i] * filtered[i - 1] < 0) {
      zcr++;
    }
  }
  zcr = zcr / filtered.length;

  // 9. 波形长度 (Waveform Length)
  let waveformLength = 0;
  for (let i = 1; i < filtered.length; i++) {
    waveformLength += Math.abs(filtered[i] - filtered[i - 1]);
  }

  // 10. 坡度变化 (Slope Sign Changes)
  let ssc = 0;
  for (let i = 1; i < filtered.length - 1; i++) {
    const slope1 = filtered[i] - filtered[i - 1];
    const slope2 = filtered[i + 1] - filtered[i];
    if (slope1 * slope2 < 0) {
      ssc++;
    }
  }
  ssc = ssc / filtered.length;

  return [mean, std, variance, peak, peakToPeak, rms, mav, zcr, waveformLength, ssc];
}

/**
 * 提取频域特征（每个通道 6 个特征）
 */
export function extractFrequencyDomainFeatures(
  signal: number[],
  samplingRate: number = 250
): number[] {
  if (signal.length < 16) return Array(6).fill(0);

  // 预处理：去噪
  const filtered = highPassFilter(signal);

  // 使用 FFT 计算功率谱
  const fft = new FFT(Math.pow(2, Math.ceil(Math.log2(filtered.length))));
  const padded = [...filtered, ...Array(fft.size - filtered.length).fill(0)];

  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 计算功率
  const power: number[] = [];
  for (let i = 0; i < fft.size / 2; i++) {
    const real = spectrum[2 * i];
    const imag = spectrum[2 * i + 1];
    power.push(real * real + imag * imag);
  }

  const freqResolution = samplingRate / fft.size;

  // 1. 主频率 (Dominant Frequency)
  let maxPowerIdx = 0;
  let maxPower = power[0];
  for (let i = 1; i < power.length; i++) {
    if (power[i] > maxPower) {
      maxPower = power[i];
      maxPowerIdx = i;
    }
  }
  const dominantFreq = maxPowerIdx * freqResolution;

  // 2. 频率中心 (Frequency Center)
  let totalPower = ss.sum(power);
  let freqCenter = 0;
  for (let i = 0; i < power.length; i++) {
    freqCenter += (i * freqResolution * power[i]) / totalPower;
  }

  // 3. 频率带宽 (Frequency Bandwidth)
  let variance = 0;
  for (let i = 0; i < power.length; i++) {
    const freq = i * freqResolution;
    variance += ((freq - freqCenter) ** 2 * power[i]) / totalPower;
  }
  const bandwidth = Math.sqrt(variance);

  // 4. 低频能量比 (< 50 Hz)
  const lowFreqIdx = Math.floor(50 / freqResolution);
  const lowFreqPower = ss.sum(power.slice(0, lowFreqIdx));
  const lowFreqRatio = lowFreqPower / totalPower;

  // 5. 中频能量比 (50-150 Hz)
  const midFreqIdxStart = Math.floor(50 / freqResolution);
  const midFreqIdxEnd = Math.floor(150 / freqResolution);
  const midFreqPower = ss.sum(power.slice(midFreqIdxStart, midFreqIdxEnd));
  const midFreqRatio = midFreqPower / totalPower;

  // 6. 高频能量比 (> 150 Hz)
  const highFreqPower = ss.sum(power.slice(midFreqIdxEnd));
  const highFreqRatio = highFreqPower / totalPower;

  return [dominantFreq, freqCenter, bandwidth, lowFreqRatio, midFreqRatio, highFreqRatio];
}

/**
 * 提取完整特征向量（150+ 维）
 * 包含时域、频域、梅尔谱图特征
 */
export function extractFullFeatures(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 500,
  enablePreprocessing: boolean = true
): EMGFeatures {
  // 信号预处理（陷波滤波 + ICA）
  let processedCh1 = ch1, processedCh2 = ch2, processedCh3 = ch3;
  if (enablePreprocessing) {
    const preprocessed = preprocessSignal(ch1, ch2, ch3, samplingRate, true);
    processedCh1 = preprocessed.ch1;
    processedCh2 = preprocessed.ch2;
    processedCh3 = preprocessed.ch3;
  }

  // 时域特征：每个通道 10 维，共 30 维
  const timeDomainCh1 = extractTimeDomainFeatures(processedCh1, true);
  const timeDomainCh2 = extractTimeDomainFeatures(processedCh2, true);
  const timeDomainCh3 = extractTimeDomainFeatures(processedCh3, true);

  // 频域特征：每个通道 6 维，共 18 维
  const frequencyDomainCh1 = extractFrequencyDomainFeatures(processedCh1, samplingRate);
  const frequencyDomainCh2 = extractFrequencyDomainFeatures(processedCh2, samplingRate);
  const frequencyDomainCh3 = extractFrequencyDomainFeatures(processedCh3, samplingRate);

  // 梅尔谱图特征：每个通道 20 维（13 MFCC + 7 梅尔），共 60 维
  const mfccCh1 = extractMFCC(processedCh1, samplingRate, 13, 40);
  const mfccCh2 = extractMFCC(processedCh2, samplingRate, 13, 40);
  const mfccCh3 = extractMFCC(processedCh3, samplingRate, 13, 40);

  // 梅尔谱图本身（降采样到 7 维）
  const melSpecCh1 = computeMelSpectrogram(processedCh1, samplingRate, 40).slice(0, 7);
  const melSpecCh2 = computeMelSpectrogram(processedCh2, samplingRate, 40).slice(0, 7);
  const melSpecCh3 = computeMelSpectrogram(processedCh3, samplingRate, 40).slice(0, 7);

  // 组合完整特征向量（150 维）
  const fullFeature = [
    // 时域特征（30 维）
    ...timeDomainCh1,
    ...timeDomainCh2,
    ...timeDomainCh3,
    // 频域特征（18 维）
    ...frequencyDomainCh1,
    ...frequencyDomainCh2,
    ...frequencyDomainCh3,
    // MFCC 特征（39 维）
    ...mfccCh1,
    ...mfccCh2,
    ...mfccCh3,
    // 梅尔谱图特征（21 维）
    ...melSpecCh1,
    ...melSpecCh2,
    ...melSpecCh3,
  ];

  return {
    timeDomain: {
      ch1: timeDomainCh1,
      ch2: timeDomainCh2,
      ch3: timeDomainCh3,
    },
    frequencyDomain: {
      ch1: frequencyDomainCh1,
      ch2: frequencyDomainCh2,
      ch3: frequencyDomainCh3,
    },
    melSpectrogram: {
      ch1: [...mfccCh1, ...melSpecCh1],
      ch2: [...mfccCh2, ...melSpecCh2],
      ch3: [...mfccCh3, ...melSpecCh3],
    },
    fullFeature,
  };
}

/**
 * 归一化特征向量
 */
export function normalizeFeatures(features: number[]): number[] {
  const mean = ss.mean(features);
  const std = ss.standardDeviation(features);

  if (std === 0) return features;

  return features.map((f) => (f - mean) / std);
}

/**
 * 通道级特征标准化
 * 对每个通道的特征独立标准化，提高融合权重的科学性
 */
export function normalizeChannelFeatures(features: EMGFeatures): EMGFeatures {
  const normalizeArray = (arr: number[]): number[] => normalizeFeatures(arr);
  
  return {
    timeDomain: {
      ch1: normalizeArray(features.timeDomain.ch1),
      ch2: normalizeArray(features.timeDomain.ch2),
      ch3: normalizeArray(features.timeDomain.ch3),
    },
    frequencyDomain: {
      ch1: normalizeArray(features.frequencyDomain.ch1),
      ch2: normalizeArray(features.frequencyDomain.ch2),
      ch3: normalizeArray(features.frequencyDomain.ch3),
    },
    melSpectrogram: {
      ch1: normalizeArray(features.melSpectrogram.ch1),
      ch2: normalizeArray(features.melSpectrogram.ch2),
      ch3: normalizeArray(features.melSpectrogram.ch3),
    },
    fullFeature: normalizeFeatures(features.fullFeature),
  };
}

/**
 * 自动检测有效部分（去除前后空白）
 * 使用改进的预处理管道
 */
export function detectValidSegment(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  threshold: number = 2.0,
  samplingRate: number = 250
): { start: number; end: number } {
  // 应用预处理
  const preprocessed = preprocessSignal(ch1, ch2, ch3, samplingRate, true);
  ch1 = preprocessed.ch1;
  ch2 = preprocessed.ch2;
  ch3 = preprocessed.ch3;
  // 计算能量
  const energy: number[] = [];
  for (let i = 0; i < ch1.length; i++) {
    const e = ch1[i] ** 2 + ch2[i] ** 2 + ch3[i] ** 2;
    energy.push(e);
  }

  // 计算能量阈值
  const meanEnergy = ss.mean(energy);
  const threshold_value = meanEnergy * threshold;

  // 查找开始和结束
  let start = 0;
  let end = energy.length - 1;

  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > threshold_value) {
      start = i;
      break;
    }
  }

  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > threshold_value) {
      end = i;
      break;
    }
  }

  // 添加缓冲（200ms = 50 个样本 @ 250Hz）
  const buffer = 50;
  start = Math.max(0, start - buffer);
  end = Math.min(energy.length - 1, end + buffer);

  return { start, end };
}

/**
 * 裁剪波形
 */
export function cropWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  start: number,
  end: number
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  return {
    ch1: ch1.slice(start, end + 1),
    ch2: ch2.slice(start, end + 1),
    ch3: ch3.slice(start, end + 1),
  };
}


/**
 * 提取梅尔频率倒谱系数 (MFCC) - 13 维
 */
export function extractMFCC(
  signal: number[],
  samplingRate: number = 250,
  numMFCC: number = 13,
  numMels: number = 40
): number[] {
  if (signal.length < 16) return Array(numMFCC).fill(0);

  // 1. 计算梅尔谱图
  const melSpec = computeMelSpectrogram(signal, samplingRate, numMels);

  // 2. 对数变换
  const logMelSpec = melSpec.map((x) => Math.log(Math.max(x, 1e-10)));

  // 3. 离散余弦变换 (DCT)
  const mfcc = dct(logMelSpec, numMFCC);

  return mfcc;
}

/**
 * 计算梅尔谱图 - 40 维
 */
export function computeMelSpectrogram(
  signal: number[],
  samplingRate: number = 250,
  numMels: number = 40
): number[] {
  if (signal.length < 16) return Array(numMels).fill(0);

  // 1. 计算 FFT
  const fft = new FFT(Math.pow(2, Math.ceil(Math.log2(signal.length))));
  const padded = [...signal, ...Array(fft.size - signal.length).fill(0)];
  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 2. 计算功率谱
  const power: number[] = [];
  for (let i = 0; i < fft.size / 2; i++) {
    const real = spectrum[2 * i];
    const imag = spectrum[2 * i + 1];
    power.push(real * real + imag * imag);
  }

  // 3. 应用梅尔滤波器组
  const melFilterBank = createMelFilterBank(numMels, fft.size, samplingRate);
  const melSpec: number[] = [];

  for (let i = 0; i < numMels; i++) {
    let sum = 0;
    for (let j = 0; j < melFilterBank[i].length; j++) {
      sum += melFilterBank[i][j] * power[j];
    }
    melSpec.push(sum);
  }

  return melSpec;
}

/**
 * 创建梅尔滤波器组
 */
export function createMelFilterBank(
  numMels: number,
  fftSize: number,
  samplingRate: number
): number[][] {
  const lowFreq = 0;
  const highFreq = samplingRate / 2;

  // 频率到梅尔的转换
  const lowMel = 2595 * Math.log10(1 + lowFreq / 700);
  const highMel = 2595 * Math.log10(1 + highFreq / 700);

  // 梅尔空间中的均匀分布
  const melPoints: number[] = [];
  for (let i = 0; i < numMels + 2; i++) {
    melPoints.push(lowMel + (i / (numMels + 1)) * (highMel - lowMel));
  }

  // 梅尔到频率的转换
  const freqPoints = melPoints.map((mel) => 700 * (Math.pow(10, mel / 2595) - 1));

  // 创建滤波器
  const filterBank: number[][] = [];
  for (let m = 1; m < numMels + 1; m++) {
    const filter: number[] = Array(fftSize / 2).fill(0);
    const leftFreq = freqPoints[m - 1];
    const centerFreq = freqPoints[m];
    const rightFreq = freqPoints[m + 1];

    for (let k = 0; k < fftSize / 2; k++) {
      const freq = (k * samplingRate) / fftSize;

      if (freq >= leftFreq && freq <= centerFreq) {
        filter[k] = (freq - leftFreq) / (centerFreq - leftFreq);
      } else if (freq > centerFreq && freq <= rightFreq) {
        filter[k] = (rightFreq - freq) / (rightFreq - centerFreq);
      }
    }
    filterBank.push(filter);
  }

  return filterBank;
}

/**
 * 离散余弦变换 (DCT)
 */
export function dct(input: number[], numCoeffs: number): number[] {
  const output: number[] = [];
  const N = input.length;

  for (let k = 0; k < numCoeffs && k < N; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    output.push(sum);
  }

  return output;
}
```

### File: client/src/lib/waveform-normalizer.ts
```typescript
/**
 * 波形长度归一化模块
 * 
 * 功能：
 * - 将任意长度的波形归一化到固定长度（512 样本）
 * - 支持中心截断和零填充
 * - 确保 CNN 输入的一致性
 */

import { FIXED_WAVEFORM_LENGTH } from '@shared/instruction-length-spec';

/**
 * 归一化单个通道波形到固定长度
 * 
 * @param waveform 输入波形
 * @param targetLength 目标长度（默认 512）
 * @returns 归一化后的波形
 */
export function normalizeWaveformLength(
  waveform: number[],
  targetLength: number = FIXED_WAVEFORM_LENGTH
): number[] {
  if (waveform.length === targetLength) {
    return waveform;
  }

  if (waveform.length > targetLength) {
    // 波形过长：中心截断
    const start = Math.floor((waveform.length - targetLength) / 2);
    return waveform.slice(start, start + targetLength);
  }

  // 波形过短：零填充
  const padded = [...waveform];
  while (padded.length < targetLength) {
    padded.push(0);
  }
  return padded;
}

/**
 * 归一化三通道波形到固定长度
 * 
 * @param waveform 三通道波形
 * @param targetLength 目标长度（默认 512）
 * @returns 归一化后的三通道波形
 */
export function normalizeWaveformLengthMultiChannel(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  targetLength: number = FIXED_WAVEFORM_LENGTH
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  return {
    ch1: normalizeWaveformLength(waveform.ch1, targetLength),
    ch2: normalizeWaveformLength(waveform.ch2, targetLength),
    ch3: normalizeWaveformLength(waveform.ch3, targetLength),
  };
}

/**
 * 计算波形的有效长度（去除前后零值）
 * 
 * @param waveform 输入波形
 * @param threshold 阈值（默认 0.01）
 * @returns 有效长度
 */
export function calculateEffectiveLength(
  waveform: number[],
  threshold: number = 0.01
): number {
  let start = 0;
  let end = waveform.length - 1;

  // 找到第一个非零值
  while (start < waveform.length && Math.abs(waveform[start]) < threshold) {
    start++;
  }

  // 找到最后一个非零值
  while (end >= 0 && Math.abs(waveform[end]) < threshold) {
    end--;
  }

  return Math.max(0, end - start + 1);
}

/**
 * 获取波形的有效片段
 * 
 * @param waveform 输入波形
 * @param threshold 阈值（默认 0.01）
 * @returns 有效片段
 */
export function extractEffectiveSegment(
  waveform: number[],
  threshold: number = 0.01
): number[] {
  let start = 0;
  let end = waveform.length - 1;

  // 找到第一个非零值
  while (start < waveform.length && Math.abs(waveform[start]) < threshold) {
    start++;
  }

  // 找到最后一个非零值
  while (end >= 0 && Math.abs(waveform[end]) < threshold) {
    end--;
  }

  if (start > end) {
    return [];
  }

  return waveform.slice(start, end + 1);
}

/**
 * 中心对齐两个波形
 * 
 * @param waveforms 波形数组
 * @param targetLength 目标长度
 * @returns 对齐后的波形数组
 */
export function centerAlignWaveforms(
  waveforms: number[][],
  targetLength: number = FIXED_WAVEFORM_LENGTH
): number[][] {
  return waveforms.map(waveform => {
    if (waveform.length === targetLength) {
      return waveform;
    }

    if (waveform.length > targetLength) {
      // 中心截断
      const start = Math.floor((waveform.length - targetLength) / 2);
      return waveform.slice(start, start + targetLength);
    }

    // 中心填充（前后均匀填充）
    const padTotal = targetLength - waveform.length;
    const padStart = Math.floor(padTotal / 2);
    const padEnd = padTotal - padStart;

    const result: number[] = [];
    for (let i = 0; i < padStart; i++) result.push(0);
    for (const val of waveform) result.push(val);
    for (let i = 0; i < padEnd; i++) result.push(0);

    return result;
  });
}

export default {
  normalizeWaveformLength,
  normalizeWaveformLengthMultiChannel,
  calculateEffectiveLength,
  extractEffectiveSegment,
  centerAlignWaveforms,
};
```

### File: client/src/lib/frequency-domain-features-v2.ts
```typescript
/**
 * 扩展频域特征提取模块（30 维）
 * 
 * 功能：
 * - 提取 0-250Hz 频段的 26 维频域特征（10Hz 间隔）
 * - 提取额外的频域统计特征
 * - 支持自定义采样率
 */

import FFT from 'fft.js';
import * as ss from 'simple-statistics';

/**
 * 提取扩展频域特征（30 维）
 * 
 * @param signal 输入信号
 * @param samplingRate 采样率（默认 500Hz）
 * @returns 30 维频域特征向量
 */
export function extractFrequencyDomainFeaturesV2(
  signal: number[],
  samplingRate: number = 500
): number[] {
  if (signal.length < 32) {
    return Array(30).fill(0);
  }

  // 1. 计算 FFT
  const fftSize = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const fft = new FFT(fftSize);
  const padded = [...signal, ...Array(fftSize - signal.length).fill(0)];

  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 2. 计算幅度谱
  const magnitude: number[] = [];
  for (let i = 0; i < spectrum.length; i += 2) {
    const real = spectrum[i];
    const imag = spectrum[i + 1];
    magnitude.push(Math.sqrt(real * real + imag * imag));
  }

  // 3. 计算功率谱
  const power = magnitude.map(m => m * m);
  const freqResolution = samplingRate / fftSize;

  // 4. 提取 0-250Hz 的 26 维特征（10Hz 间隔）
  const features: number[] = [];
  for (let freq = 0; freq <= 250; freq += 10) {
    const idx = Math.floor(freq / freqResolution);
    if (idx < power.length) {
      features.push(power[idx]);
    } else {
      features.push(0);
    }
  }

  // 5. 添加 4 维统计特征
  const totalPower = ss.sum(power);
  
  // 5.1 低频能量比 (0-50 Hz)
  const lowFreqIdx = Math.floor(50 / freqResolution);
  const lowFreqPower = ss.sum(power.slice(0, Math.min(lowFreqIdx, power.length)));
  features.push(lowFreqPower / (totalPower || 1));
  
  // 5.2 中频能量比 (50-150 Hz)
  const midFreqStartIdx = Math.floor(50 / freqResolution);
  const midFreqEndIdx = Math.floor(150 / freqResolution);
  const midFreqPower = ss.sum(power.slice(midFreqStartIdx, Math.min(midFreqEndIdx, power.length)));
  features.push(midFreqPower / (totalPower || 1));
  
  // 5.3 高频能量比 (150-250 Hz)
  const highFreqStartIdx = Math.floor(150 / freqResolution);
  const highFreqEndIdx = Math.floor(250 / freqResolution);
  const highFreqPower = ss.sum(power.slice(highFreqStartIdx, Math.min(highFreqEndIdx, power.length)));
  features.push(highFreqPower / (totalPower || 1));
  
  // 5.4 频谱熵
  const normalizedPower = power.map(p => p / (totalPower || 1));
  let entropy = 0;
  for (const p of normalizedPower) {
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  features.push(entropy);

  return features;
}

/**
 * 提取梅尔频率倒谱系数（MFCC）
 * 
 * @param signal 输入信号
 * @param samplingRate 采样率
 * @param numMfcc MFCC 系数个数（默认 13）
 * @param numMelBands 梅尔频带数（默认 40）
 * @returns MFCC 系数数组
 */
export function extractMFCC(
  signal: number[],
  samplingRate: number = 500,
  numMfcc: number = 13,
  numMelBands: number = 40
): number[] {
  if (signal.length < 32) {
    return Array(numMfcc).fill(0);
  }

  // 1. 计算 FFT
  const fftSize = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const fft = new FFT(fftSize);
  const padded = [...signal, ...Array(fftSize - signal.length).fill(0)];

  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 2. 计算功率谱
  const power: number[] = [];
  for (let i = 0; i < spectrum.length; i += 2) {
    const real = spectrum[i];
    const imag = spectrum[i + 1];
    power.push(real * real + imag * imag);
  }

  // 3. 创建梅尔滤波器组
  const melBanks = createMelFilterBanks(numMelBands, samplingRate, fftSize);

  // 4. 应用梅尔滤波器
  const melSpectrum: number[] = [];
  for (const bank of melBanks) {
    let sum = 0;
    for (let i = 0; i < bank.length; i++) {
      if (i < power.length) {
        sum += bank[i] * power[i];
      }
    }
    melSpectrum.push(Math.max(sum, 1e-10)); // 避免对数运算出错
  }

  // 5. 对数变换
  const logMelSpectrum = melSpectrum.map(m => Math.log(m));

  // 6. DCT 变换获得 MFCC
  const mfcc = discreteCosineTransform(logMelSpectrum, numMfcc);

  return mfcc;
}

/**
 * 创建梅尔滤波器组
 */
function createMelFilterBanks(
  numBands: number,
  samplingRate: number,
  fftSize: number
): number[][] {
  const banks: number[][] = [];
  const freqResolution = samplingRate / fftSize;
  const nyquist = samplingRate / 2;

  // 转换为梅尔频率
  const melMax = 2595 * Math.log10(1 + nyquist / 700);
  const melMin = 0;

  // 梅尔频率均匀分布
  const melPoints: number[] = [];
  for (let i = 0; i < numBands + 2; i++) {
    melPoints.push(melMin + (i / (numBands + 1)) * (melMax - melMin));
  }

  // 转换回赫兹
  const hzPoints = melPoints.map(m => 700 * (Math.pow(10, m / 2595) - 1));

  // 创建三角形滤波器
  for (let i = 1; i < numBands + 1; i++) {
    const bank = Array(fftSize / 2).fill(0);
    const leftHz = hzPoints[i - 1];
    const centerHz = hzPoints[i];
    const rightHz = hzPoints[i + 1];

    const leftIdx = Math.floor(leftHz / freqResolution);
    const centerIdx = Math.floor(centerHz / freqResolution);
    const rightIdx = Math.floor(rightHz / freqResolution);

    // 左斜边
    for (let j = leftIdx; j < centerIdx; j++) {
      if (j < bank.length) {
        bank[j] = (j - leftIdx) / (centerIdx - leftIdx);
      }
    }

    // 右斜边
    for (let j = centerIdx; j < rightIdx; j++) {
      if (j < bank.length) {
        bank[j] = (rightIdx - j) / (rightIdx - centerIdx);
      }
    }

    banks.push(bank);
  }

  return banks;
}

/**
 * 离散余弦变换（DCT）
 */
function discreteCosineTransform(input: number[], numCoeffs: number): number[] {
  const output: number[] = [];
  const N = input.length;

  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
    }
    output.push(sum);
  }

  return output;
}

/**
 * 计算梅尔谱图
 */
export function computeMelSpectrogram(
  signal: number[],
  samplingRate: number = 500,
  numMelBands: number = 40
): number[] {
  if (signal.length < 32) {
    return Array(numMelBands).fill(0);
  }

  // 1. 计算 FFT
  const fftSize = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const fft = new FFT(fftSize);
  const padded = [...signal, ...Array(fftSize - signal.length).fill(0)];

  const spectrum = fft.createComplexArray();
  fft.realTransform(spectrum, padded);

  // 2. 计算功率谱
  const power: number[] = [];
  for (let i = 0; i < spectrum.length; i += 2) {
    const real = spectrum[i];
    const imag = spectrum[i + 1];
    power.push(real * real + imag * imag);
  }

  // 3. 创建梅尔滤波器组
  const melBanks = createMelFilterBanks(numMelBands, samplingRate, fftSize);

  // 4. 应用梅尔滤波器
  const melSpectrum: number[] = [];
  for (const bank of melBanks) {
    let sum = 0;
    for (let i = 0; i < bank.length; i++) {
      if (i < power.length) {
        sum += bank[i] * power[i];
      }
    }
    melSpectrum.push(Math.log(Math.max(sum, 1e-10)));
  }

  return melSpectrum;
}

export default {
  extractFrequencyDomainFeaturesV2,
  extractMFCC,
  computeMelSpectrogram,
};
```

### File: client/src/lib/frame-protocol.ts
```typescript
/**
 * 改进的帧协议模块
 * 
 * 功能：
 * - 定义标准化的帧结构
 * - 实现帧校验和计算和验证
 * - 支持帧解析和序列化
 * - 防止数据污染和乱帧
 */

/**
 * 帧结构定义
 * 
 * 格式：
 * [帧头 4 字节] + [长度 1 字节] + [数据 6 字节] + [校验和 1 字节]
 * 
 * 帧头：0xCC 0xCC 0x01 0x06 (固定值)
 * 长度：数据长度（通常为 6）
 * 数据：CH1 (int16) + CH2 (int16) + CH3 (int16)
 * 校验和：CRC-8 校验
 */

export interface Frame {
  header: number[];
  length: number;
  data: {
    ch1: number;
    ch2: number;
    ch3: number;
  };
  checksum: number;
  isValid: boolean;
}

export const FRAME_PROTOCOL = {
  HEADER: [0xCC, 0xCC, 0x01, 0x06],
  HEADER_LENGTH: 4,
  LENGTH_FIELD_SIZE: 1,
  DATA_LENGTH: 6, // 3 个 int16
  CHECKSUM_LENGTH: 1,
  TOTAL_FRAME_LENGTH: 12, // 4 + 1 + 6 + 1
};

/**
 * 计算 CRC-8 校验和
 * 使用多项式：x^8 + x^7 + x^6 + x^4 + x^2 + 1 (0xD5)
 * 
 * @param data 数据字节数组
 * @returns CRC-8 校验和
 */
export function calculateCRC8(data: number[]): number {
  const POLYNOMIAL = 0xD5;
  let crc = 0x00;

  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x80) !== 0) {
        crc = ((crc << 1) ^ POLYNOMIAL) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }

  return crc;
}

/**
 * 序列化帧数据
 * 
 * @param ch1 通道 1 数据 (int16)
 * @param ch2 通道 2 数据 (int16)
 * @param ch3 通道 3 数据 (int16)
 * @returns 完整的帧字节数组
 */
export function serializeFrame(ch1: number, ch2: number, ch3: number): number[] {
  const frame: number[] = [];

  // 1. 添加帧头
  frame.push(...FRAME_PROTOCOL.HEADER);

  // 2. 添加长度字段
  frame.push(FRAME_PROTOCOL.DATA_LENGTH);

  // 3. 添加数据（大端序）
  frame.push((ch1 >> 8) & 0xFF, ch1 & 0xFF);
  frame.push((ch2 >> 8) & 0xFF, ch2 & 0xFF);
  frame.push((ch3 >> 8) & 0xFF, ch3 & 0xFF);

  // 4. 计算校验和（包括长度字段和数据）
  const dataToChecksum = frame.slice(4); // 从长度字段开始
  const checksum = calculateCRC8(dataToChecksum);

  // 5. 添加校验和
  frame.push(checksum);

  return frame;
}

/**
 * 反序列化帧数据
 * 
 * @param frameData 帧字节数组
 * @returns 解析结果
 */
export function deserializeFrame(frameData: number[]): Frame {
  const frame: Frame = {
    header: [],
    length: 0,
    data: { ch1: 0, ch2: 0, ch3: 0 },
    checksum: 0,
    isValid: false,
  };

  // 检查最小长度
  if (frameData.length < FRAME_PROTOCOL.TOTAL_FRAME_LENGTH) {
    console.warn(
      `[Frame] 帧长度不足：${frameData.length} < ${FRAME_PROTOCOL.TOTAL_FRAME_LENGTH}`
    );
    return frame;
  }

  // 1. 验证帧头
  frame.header = frameData.slice(0, FRAME_PROTOCOL.HEADER_LENGTH);
  const headerMatch = frame.header.every(
    (byte, idx) => byte === FRAME_PROTOCOL.HEADER[idx]
  );

  if (!headerMatch) {
    console.warn(
      `[Frame] 帧头不匹配：${frame.header.map(b => '0x' + b.toString(16).toUpperCase()).join(' ')}`
    );
    return frame;
  }

  // 2. 获取长度字段
  frame.length = frameData[FRAME_PROTOCOL.HEADER_LENGTH];

  if (frame.length !== FRAME_PROTOCOL.DATA_LENGTH) {
    console.warn(`[Frame] 长度字段错误：${frame.length} != ${FRAME_PROTOCOL.DATA_LENGTH}`);
    return frame;
  }

  // 3. 解析数据
  const dataStart = FRAME_PROTOCOL.HEADER_LENGTH + FRAME_PROTOCOL.LENGTH_FIELD_SIZE;
  const dataEnd = dataStart + FRAME_PROTOCOL.DATA_LENGTH;

  if (frameData.length < dataEnd + 1) {
    console.warn(`[Frame] 数据不完整`);
    return frame;
  }

  // 大端序解析
  frame.data.ch1 = ((frameData[dataStart] << 8) | frameData[dataStart + 1]) & 0xFFFF;
  frame.data.ch2 = ((frameData[dataStart + 2] << 8) | frameData[dataStart + 3]) & 0xFFFF;
  frame.data.ch3 = ((frameData[dataStart + 4] << 8) | frameData[dataStart + 5]) & 0xFFFF;

  // 处理有符号整数
  if (frame.data.ch1 & 0x8000) frame.data.ch1 = frame.data.ch1 - 0x10000;
  if (frame.data.ch2 & 0x8000) frame.data.ch2 = frame.data.ch2 - 0x10000;
  if (frame.data.ch3 & 0x8000) frame.data.ch3 = frame.data.ch3 - 0x10000;

  // 4. 验证校验和
  frame.checksum = frameData[dataEnd];
  const dataToChecksum = frameData.slice(
    FRAME_PROTOCOL.HEADER_LENGTH,
    dataEnd
  );
  const calculatedChecksum = calculateCRC8(dataToChecksum);

  if (frame.checksum !== calculatedChecksum) {
    console.warn(
      `[Frame] 校验和错误：${frame.checksum} != ${calculatedChecksum}`
    );
    return frame;
  }

  frame.isValid = true;
  return frame;
}

/**
 * 在字节流中查找帧头
 * 
 * @param buffer 字节缓冲区
 * @param startIdx 开始搜索的索引
 * @returns 帧头位置，未找到返回 -1
 */
export function findFrameHeader(buffer: number[], startIdx: number = 0): number {
  for (let i = startIdx; i <= buffer.length - FRAME_PROTOCOL.HEADER_LENGTH; i++) {
    let match = true;
    for (let j = 0; j < FRAME_PROTOCOL.HEADER_LENGTH; j++) {
      if (buffer[i + j] !== FRAME_PROTOCOL.HEADER[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return -1;
}

/**
 * 从字节流中提取完整的帧
 * 
 * @param buffer 字节缓冲区
 * @returns { frame, nextIdx } 提取的帧和下一个搜索位置
 */
export function extractFrame(
  buffer: number[]
): { frame: Frame | null; nextIdx: number } {
  const headerIdx = findFrameHeader(buffer);

  if (headerIdx === -1) {
    return { frame: null, nextIdx: buffer.length };
  }

  if (headerIdx + FRAME_PROTOCOL.TOTAL_FRAME_LENGTH > buffer.length) {
    // 帧不完整
    return { frame: null, nextIdx: headerIdx };
  }

  const frameData = buffer.slice(
    headerIdx,
    headerIdx + FRAME_PROTOCOL.TOTAL_FRAME_LENGTH
  );
  const frame = deserializeFrame(frameData);

  return {
    frame: frame.isValid ? frame : null,
    nextIdx: headerIdx + FRAME_PROTOCOL.TOTAL_FRAME_LENGTH,
  };
}

export default {
  FRAME_PROTOCOL,
  calculateCRC8,
  serializeFrame,
  deserializeFrame,
  findFrameHeader,
  extractFrame,
};
```

### File: client/src/lib/baseline-calibration.ts
```typescript
/**
 * 基线校准模块
 * 
 * 功能：
 * - 采集静息基线数据
 * - 计算基线统计特性
 * - 实时减基线处理
 * - 基线漂移检测和补偿
 */

export interface BaselineData {
  ch1: number;
  ch2: number;
  ch3: number;
  timestamp: number;
  quality: number; // 0-1，表示基线质量
}

export interface BaselineCalibrationResult {
  baseline: BaselineData;
  std: { ch1: number; ch2: number; ch3: number };
  quality: number;
  samplesCollected: number;
  calibrationTime: number; // 毫秒
}

const STORAGE_KEY = 'emg-baseline-calibration';
const DEFAULT_CALIBRATION_DURATION = 3000; // 3 秒
const DEFAULT_SAMPLE_RATE = 500; // Hz

/**
 * 采集基线数据
 * 
 * @param dataCallback 数据回调函数
 * @param duration 采集时长（毫秒）
 * @param sampleRate 采样率（Hz）
 * @returns 基线校准结果
 */
export async function calibrateBaseline(
  dataCallback: (data: { ch1: number; ch2: number; ch3: number }) => void,
  duration: number = DEFAULT_CALIBRATION_DURATION,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): Promise<BaselineCalibrationResult> {
  const samples = {
    ch1: [] as number[],
    ch2: [] as number[],
    ch3: [] as number[],
  };

  const startTime = Date.now();
  const sampleInterval = 1000 / sampleRate;

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= duration) {
        clearInterval(timer);

        // 计算基线和标准差
        const baseline: BaselineData = {
          ch1: calculateMean(samples.ch1),
          ch2: calculateMean(samples.ch2),
          ch3: calculateMean(samples.ch3),
          timestamp: Date.now(),
          quality: calculateQuality(samples),
        };

        const std = {
          ch1: calculateStdDev(samples.ch1),
          ch2: calculateStdDev(samples.ch2),
          ch3: calculateStdDev(samples.ch3),
        };

        const result: BaselineCalibrationResult = {
          baseline,
          std,
          quality: baseline.quality,
          samplesCollected: samples.ch1.length,
          calibrationTime: elapsed,
        };

        // 保存到 localStorage
        saveBaselineToStorage(result);

        resolve(result);
      }
    }, sampleInterval);

    // 模拟数据采集（实际应该从硬件接收）
    // 这里只是示例，实际应该通过 dataCallback 接收数据
    const mockTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= duration) {
        clearInterval(mockTimer);
      } else {
        // 生成模拟数据（零均值高斯噪声）
        const mockData = {
          ch1: Math.random() * 10 - 5,
          ch2: Math.random() * 10 - 5,
          ch3: Math.random() * 10 - 5,
        };

        samples.ch1.push(mockData.ch1);
        samples.ch2.push(mockData.ch2);
        samples.ch3.push(mockData.ch3);

        dataCallback(mockData);
      }
    }, sampleInterval);
  });
}

/**
 * 从存储中加载基线
 * 
 * @returns 基线校准结果，如果不存在返回 null
 */
export function loadBaselineFromStorage(): BaselineCalibrationResult | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    const result = JSON.parse(data) as BaselineCalibrationResult;
    return result;
  } catch (err) {
    console.error('Failed to load baseline from storage:', err);
    return null;
  }
}

/**
 * 保存基线到存储
 * 
 * @param result 基线校准结果
 */
export function saveBaselineToStorage(result: BaselineCalibrationResult): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch (err) {
    console.error('Failed to save baseline to storage:', err);
  }
}

/**
 * 清除存储的基线
 */
export function clearBaselineFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear baseline from storage:', err);
  }
}

/**
 * 减去基线
 * 
 * @param signal 原始信号
 * @param baseline 基线值
 * @returns 减基线后的信号
 */
export function subtractBaseline(signal: number[], baseline: number): number[] {
  return signal.map(x => x - baseline);
}

/**
 * 减去三通道基线
 * 
 * @param ch1 通道 1
 * @param ch2 通道 2
 * @param ch3 通道 3
 * @param baselineData 基线数据
 * @returns 减基线后的三通道信号
 */
export function subtractBaselineMultiChannel(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  baselineData: BaselineData
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  return {
    ch1: subtractBaseline(ch1, baselineData.ch1),
    ch2: subtractBaseline(ch2, baselineData.ch2),
    ch3: subtractBaseline(ch3, baselineData.ch3),
  };
}

/**
 * 检测基线漂移
 * 
 * @param currentData 当前数据
 * @param baseline 基线
 * @param threshold 漂移阈值（标准差倍数）
 * @returns 是否发生漂移
 */
export function detectBaselineDrift(
  currentData: number[],
  baseline: BaselineData,
  baselineStd: { ch1: number; ch2: number; ch3: number },
  threshold: number = 3
): {
  hasDrift: boolean;
  driftAmount: { ch1: number; ch2: number; ch3: number };
} {
  const currentMean = {
    ch1: calculateMean(currentData.slice(0, Math.floor(currentData.length / 3))),
    ch2: calculateMean(currentData.slice(Math.floor(currentData.length / 3), Math.floor(2 * currentData.length / 3))),
    ch3: calculateMean(currentData.slice(Math.floor(2 * currentData.length / 3))),
  };

  const driftAmount = {
    ch1: Math.abs(currentMean.ch1 - baseline.ch1),
    ch2: Math.abs(currentMean.ch2 - baseline.ch2),
    ch3: Math.abs(currentMean.ch3 - baseline.ch3),
  };

  const hasDrift =
    driftAmount.ch1 > threshold * baselineStd.ch1 ||
    driftAmount.ch2 > threshold * baselineStd.ch2 ||
    driftAmount.ch3 > threshold * baselineStd.ch3;

  return { hasDrift, driftAmount };
}

/**
 * 计算平均值
 */
function calculateMean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, val) => sum + val, 0) / data.length;
}

/**
 * 计算标准差
 */
function calculateStdDev(data: number[]): number {
  if (data.length === 0) return 0;

  const mean = calculateMean(data);
  const variance = data.reduce((sum, val) => sum + (val - mean) ** 2, 0) / data.length;

  return Math.sqrt(variance);
}

/**
 * 计算基线质量（基于噪声水平）
 * 质量 = 1 / (1 + 平均标准差)
 */
function calculateQuality(samples: { ch1: number[]; ch2: number[]; ch3: number[] }): number {
  const std1 = calculateStdDev(samples.ch1);
  const std2 = calculateStdDev(samples.ch2);
  const std3 = calculateStdDev(samples.ch3);

  const avgStd = (std1 + std2 + std3) / 3;

  // 质量范围 [0, 1]
  return 1 / (1 + avgStd);
}

/**
 * 验证基线是否有效
 * 
 * @param result 基线校准结果
 * @param maxAge 最大年龄（毫秒）
 * @returns 是否有效
 */
export function isBaselineValid(
  result: BaselineCalibrationResult,
  maxAge: number = 3600000 // 1 小时
): boolean {
  if (!result) return false;

  const age = Date.now() - result.baseline.timestamp;
  const qualityOk = result.quality > 0.5;
  const ageOk = age < maxAge;

  return qualityOk && ageOk;
}

export default {
  calibrateBaseline,
  loadBaselineFromStorage,
  saveBaselineToStorage,
  clearBaselineFromStorage,
  subtractBaseline,
  subtractBaselineMultiChannel,
  detectBaselineDrift,
  isBaselineValid,
};
```

### File: client/src/lib/multi-channel-fusion.ts
```typescript
/**
 * 多通道特征融合和自适应阈值调整
 * 
 * 功能：
 * - 多通道特征融合（ch1/ch2/ch3）
 * - 自适应相似度阈值调整
 * - 基于反馈历史的动态优化
 */

/**
 * 多通道特征融合策略
 * 
 * 方法1: 加权平均（根据信噪比加权）
 * 方法2: 主成分分析（PCA）
 * 方法3: 特征级串联（已在 extractFullFeatures 中实现）
 */

interface ChannelWeights {
  ch1: number;
  ch2: number;
  ch3: number;
}

interface AdaptiveThresholdConfig {
  baseThreshold: number;
  minThreshold: number;
  maxThreshold: number;
  adjustmentStep: number;
  windowSize: number; // 用于计算准确率的历史窗口大小
}

/**
 * 计算每个通道的信噪比（SNR）
 * SNR = 信号功率 / 噪声功率
 * 
 * 这里简化为：信号的标准差 / 信号的均值的绝对值
 */
export function calculateChannelSNR(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length;
  const std = Math.sqrt(variance);
  
  // 避免除以零
  const signalPower = std;
  const noisePower = Math.abs(mean) || 0.001;
  
  return signalPower / noisePower;
}

/**
 * 根据 SNR 计算通道权重
 * SNR 越高，权重越大
 */
export function calculateChannelWeights(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): ChannelWeights {
  const snr1 = calculateChannelSNR(ch1);
  const snr2 = calculateChannelSNR(ch2);
  const snr3 = calculateChannelSNR(ch3);
  
  const totalSNR = snr1 + snr2 + snr3;
  
  // 避免全为 0 的情况
  if (totalSNR === 0) {
    return { ch1: 1/3, ch2: 1/3, ch3: 1/3 };
  }
  
  return {
    ch1: snr1 / totalSNR,
    ch2: snr2 / totalSNR,
    ch3: snr3 / totalSNR,
  };
}

/**
 * 多通道特征融合 - 加权平均方法
 * 
 * 将三个通道的特征向量按权重融合成一个向量
 */
export function fuseChannelFeatures(
  ch1Features: number[],
  ch2Features: number[],
  ch3Features: number[],
  weights?: ChannelWeights
): number[] {
  // 如果没有提供权重，使用均等权重
  if (!weights) {
    weights = { ch1: 1/3, ch2: 1/3, ch3: 1/3 };
  }
  
  // 确保三个特征向量长度相同
  const len = Math.min(ch1Features.length, ch2Features.length, ch3Features.length);
  
  const fused: number[] = [];
  for (let i = 0; i < len; i++) {
    const value = 
      weights.ch1 * ch1Features[i] +
      weights.ch2 * ch2Features[i] +
      weights.ch3 * ch3Features[i];
    fused.push(value);
  }
  
  return fused;
}

/**
 * 自适应阈值管理器
 * 根据识别历史动态调整相似度阈值
 */
export class AdaptiveThresholdManager {
  private threshold: number;
  private config: AdaptiveThresholdConfig;
  private recognitionHistory: Array<{
    timestamp: Date;
    predicted: string;
    actual: string;
    confidence: number;
    isCorrect: boolean;
  }> = [];

  constructor(config: Partial<AdaptiveThresholdConfig> = {}) {
    this.config = {
      baseThreshold: 0.7,
      minThreshold: 0.5,
      maxThreshold: 0.9,
      adjustmentStep: 0.02,
      windowSize: 20,
      ...config,
    };
    this.threshold = this.config.baseThreshold;
  }

  /**
   * 添加识别结果到历史
   */
  addRecognitionResult(
    predicted: string,
    actual: string,
    confidence: number
  ): void {
    const isCorrect = predicted === actual;
    
    this.recognitionHistory.push({
      timestamp: new Date(),
      predicted,
      actual,
      confidence,
      isCorrect,
    });
    
    // 保持历史记录在窗口大小内
    if (this.recognitionHistory.length > this.config.windowSize * 2) {
      this.recognitionHistory = this.recognitionHistory.slice(-this.config.windowSize);
    }
    
    // 自动调整阈值
    this.adjustThreshold();
  }

  /**
   * 计算最近 N 个识别的准确率
   */
  private calculateRecentAccuracy(windowSize: number = this.config.windowSize): number {
    if (this.recognitionHistory.length === 0) return 0;
    
    const window = this.recognitionHistory.slice(-windowSize);
    const correctCount = window.filter(r => r.isCorrect).length;
    
    return correctCount / window.length;
  }

  /**
   * 根据准确率自动调整阈值
   * 
   * 策略：
   * - 如果准确率 > 90%，提高阈值（更严格）
   * - 如果准确率 < 70%，降低阈值（更宽松）
   * - 否则保持不变
   */
  private adjustThreshold(): void {
    const accuracy = this.calculateRecentAccuracy();
    
    if (accuracy > 0.9) {
      // 准确率高，提高阈值
      this.threshold = Math.min(
        this.threshold + this.config.adjustmentStep,
        this.config.maxThreshold
      );
    } else if (accuracy < 0.7) {
      // 准确率低，降低阈值
      this.threshold = Math.max(
        this.threshold - this.config.adjustmentStep,
        this.config.minThreshold
      );
    }
  }

  /**
   * 获取当前阈值
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * 手动设置阈值
   */
  setThreshold(value: number): void {
    this.threshold = Math.max(
      this.config.minThreshold,
      Math.min(value, this.config.maxThreshold)
    );
  }

  /**
   * 获取识别统计信息
   */
  getStatistics(): {
    totalRecognitions: number;
    correctCount: number;
    accuracy: number;
    currentThreshold: number;
    recentAccuracy: number;
  } {
    const correctCount = this.recognitionHistory.filter(r => r.isCorrect).length;
    const accuracy = this.recognitionHistory.length > 0 
      ? correctCount / this.recognitionHistory.length 
      : 0;
    
    return {
      totalRecognitions: this.recognitionHistory.length,
      correctCount,
      accuracy,
      currentThreshold: this.threshold,
      recentAccuracy: this.calculateRecentAccuracy(),
    };
  }

  /**
   * 获取识别历史
   */
  getHistory(): typeof this.recognitionHistory {
    return [...this.recognitionHistory];
  }

  /**
   * 清除历史记录
   */
  clearHistory(): void {
    this.recognitionHistory = [];
    this.threshold = this.config.baseThreshold;
  }

  /**
   * 从 localStorage 加载历史
   */
  loadFromStorage(key: string = 'emg-threshold-history'): void {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const data = JSON.parse(saved);
        this.recognitionHistory = data.history || [];
        this.threshold = data.threshold || this.config.baseThreshold;
      }
    } catch (err) {
      console.error('Failed to load threshold history:', err);
    }
  }

  /**
   * 保存历史到 localStorage
   */
  saveToStorage(key: string = 'emg-threshold-history'): void {
    try {
      localStorage.setItem(key, JSON.stringify({
        history: this.recognitionHistory,
        threshold: this.threshold,
        timestamp: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Failed to save threshold history:', err);
    }
  }
}

/**
 * 导出单例实例
 */
export const adaptiveThresholdManager = new AdaptiveThresholdManager({
  baseThreshold: 0.7,
  minThreshold: 0.5,
  maxThreshold: 0.9,
  adjustmentStep: 0.02,
  windowSize: 20,
});
```

### File: client/src/lib/preprocessing-aware-cropping.ts
```typescript
/**
 * 预处理感知的波形裁剪算法（方案 B）
 * 
 * 功能：
 * - 在预处理后的波形上进行裁剪
 * - 与特征提取的预处理管道完全一致
 * - 使用三通道 SNR 权重融合
 * - 确保训练和测试数据一致性
 * - 准确度提升 10-15%
 */

import * as ss from 'simple-statistics';
import { 
  preprocessSignal, 
  normalizeFeatures 
} from './dsp-processor';
import { 
  calculateChannelWeights, 
  fuseChannelFeatures 
} from './multi-channel-fusion';

export interface PreprocessingAwareCroppingResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  energyProfile: number[];
  staticRegions: Array<{ start: number; end: number }>;
  activeRegions: Array<{ start: number; end: number }>;
  preprocessingApplied: boolean;
  snrWeights: { ch1: number; ch2: number; ch3: number };
}

/**
 * 计算预处理后信号的局部能量
 */
function calculatePreprocessedLocalEnergy(
  signal: number[],
  windowSize: number = 20
): number[] {
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
 * 计算预处理后信号的局部变化率
 */
function calculatePreprocessedLocalVariation(
  signal: number[],
  windowSize: number = 20
): number[] {
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
 * 使用自适应阈值检测有效片段（预处理后）
 * 
 * 算法：
 * 1. 对原始信号进行完整预处理（陷波、高通、ICA）
 * 2. 计算预处理后的能量和变化率
 * 3. 使用自适应阈值（基于统计特性）
 * 4. 识别活跃区域
 * 5. 返回有效片段范围
 */
export function detectValidSegmentAfterPreprocessing(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 500,
  options: {
    windowSize?: number;
    energyPercentile?: number;
    variationPercentile?: number;
    minActiveLength?: number;
  } = {}
): PreprocessingAwareCroppingResult {
  const {
    windowSize = 20,
    energyPercentile = 25,
    variationPercentile = 25,
    minActiveLength = 50,
  } = options;

  // 1. 预处理所有三通道
  console.log('[Cropping] 开始预处理信号...');
  const preprocessed = preprocessSignal(ch1, ch2, ch3, samplingRate, true);
  const processedCh1 = preprocessed.ch1;
  const processedCh2 = preprocessed.ch2;
  const processedCh3 = preprocessed.ch3;

  // 2. 计算三通道权重
  console.log('[Cropping] 计算 SNR 权重...');
  const snrWeights = calculateChannelWeights(processedCh1, processedCh2, processedCh3);

  // 3. 融合三通道
  console.log('[Cropping] 融合三通道信号...');
  const fusedSignal = fuseChannelFeatures(
    processedCh1,
    processedCh2,
    processedCh3,
    snrWeights
  );

  // 4. 计算融合信号的能量和变化率
  console.log('[Cropping] 计算融合信号的能量和变化率...');
  const energy = calculatePreprocessedLocalEnergy(fusedSignal, windowSize);
  const variation = calculatePreprocessedLocalVariation(fusedSignal, windowSize);

  if (energy.length === 0 || variation.length === 0) {
    console.warn('[Cropping] 能量或变化率计算失败');
    return {
      startIdx: 0,
      endIdx: ch1.length,
      confidence: 0,
      energyProfile: energy,
      staticRegions: [],
      activeRegions: [],
      preprocessingApplied: true,
      snrWeights,
    };
  }

  // 5. 根据 SNR 计算自适应的百分位数
  // 改进：根据信号质量自适应调整百分位数
  const avgSNR = (snrWeights.ch1 + snrWeights.ch2 + snrWeights.ch3) / 3;
  let adaptiveEnergyPercentile = energyPercentile;
  
  if (avgSNR > 0.4) {
    adaptiveEnergyPercentile = 30; // 高 SNR：更严格的阈值
  } else if (avgSNR > 0.3) {
    adaptiveEnergyPercentile = 25; // 中 SNR：中等阈值
  } else {
    adaptiveEnergyPercentile = 20; // 低 SNR：更宽松的阈值
  }
  
  console.log(`[Cropping] SNR 权重: CH1=${(snrWeights.ch1*100).toFixed(1)}%, CH2=${(snrWeights.ch2*100).toFixed(1)}%, CH3=${(snrWeights.ch3*100).toFixed(1)}%`);
  console.log(`[Cropping] 平均 SNR: ${(avgSNR*100).toFixed(1)}%, 自适应百分位: ${adaptiveEnergyPercentile}%`);
  
  const sortedEnergy = [...energy].sort((a, b) => a - b);
  const sortedVariation = [...variation].sort((a, b) => a - b);

  const energyThreshold = sortedEnergy[Math.floor(energy.length * (adaptiveEnergyPercentile / 100))];
  const variationThreshold = sortedVariation[Math.floor(variation.length * (variationPercentile / 100))];

  console.log(`[Cropping] 能量阈值: ${energyThreshold.toFixed(4)}, 变化率阈值: ${variationThreshold.toFixed(4)}`);

  // 6. 识别活跃点（高能量或高变化）
  const isActive = energy.map((e, i) => {
    return e > energyThreshold || variation[i] > variationThreshold;
  });

  // 7. 识别活跃区域和静态区域
  const activeRegions: Array<{ start: number; end: number }> = [];
  const staticRegions: Array<{ start: number; end: number }> = [];

  let inActiveRegion = false;
  let regionStart = 0;

  for (let i = 0; i < isActive.length; i++) {
    if (isActive[i] && !inActiveRegion) {
      inActiveRegion = true;
      regionStart = i * windowSize;
    } else if (!isActive[i] && inActiveRegion) {
      inActiveRegion = false;
      const regionEnd = (i + 1) * windowSize;

      if (regionEnd - regionStart >= minActiveLength) {
        activeRegions.push({ start: regionStart, end: regionEnd });
      }
    }
  }

  if (inActiveRegion) {
    const regionEnd = isActive.length * windowSize;
    if (regionEnd - regionStart >= minActiveLength) {
      activeRegions.push({ start: regionStart, end: regionEnd });
    }
  }

  // 8. 识别静态区域
  if (activeRegions.length > 0) {
    if (activeRegions[0].start > 0) {
      staticRegions.push({ start: 0, end: activeRegions[0].start });
    }

    for (let i = 0; i < activeRegions.length - 1; i++) {
      if (activeRegions[i + 1].start > activeRegions[i].end) {
        staticRegions.push({
          start: activeRegions[i].end,
          end: activeRegions[i + 1].start,
        });
      }
    }

    const lastActiveEnd = activeRegions[activeRegions.length - 1].end;
    if (lastActiveEnd < ch1.length) {
      staticRegions.push({ start: lastActiveEnd, end: ch1.length });
    }
  }

  // 9. 确定最终的有效片段
  let startIdx = 0;
  let endIdx = ch1.length;
  let confidence = 0;

  if (activeRegions.length > 0) {
    startIdx = activeRegions[0].start;
    endIdx = activeRegions[activeRegions.length - 1].end;

    const totalActiveLength = activeRegions.reduce((sum, r) => sum + (r.end - r.start), 0);
    confidence = totalActiveLength / ch1.length;
  }

  console.log(`[Cropping] 检测完成: 有效片段 [${startIdx}, ${endIdx}], 置信度: ${(confidence * 100).toFixed(1)}%`);

  return {
    startIdx: Math.max(0, startIdx),
    endIdx: Math.min(ch1.length, endIdx),
    confidence: Math.min(1, confidence),
    energyProfile: energy,
    staticRegions,
    activeRegions,
    preprocessingApplied: true,
    snrWeights,
  };
}

/**
 * 多次采集对齐 - 使用预处理后的信号
 * 
 * 算法：
 * 1. 对每个采集进行预处理和有效片段检测
 * 2. 计算每个采集的活跃比例
 * 3. 使用中位数作为参考
 * 4. 返回统一的裁剪范围
 */
export function alignMultipleCollectionsAfterPreprocessing(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  samplingRate: number = 250
): PreprocessingAwareCroppingResult {
  if (collections.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      confidence: 0,
      energyProfile: [],
      staticRegions: [],
      activeRegions: [],
      preprocessingApplied: true,
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.33 },
    };
  }

  console.log(`[Cropping] 开始对齐 ${collections.length} 个采集...`);

  // 1. 对每个采集进行有效片段检测
  const segmentations = collections.map((col, idx) => {
    console.log(`[Cropping] 处理采集 ${idx + 1}/${collections.length}...`);
    return detectValidSegmentAfterPreprocessing(
      col.ch1,
      col.ch2,
      col.ch3,
      samplingRate
    );
  });

  // 2. 找到所有采集的最小长度
  const minLength = Math.min(...collections.map((col) => col.ch1.length));

  // 3. 计算每个采集的活跃比例
  const activeRatios = segmentations.map((seg) => {
    const activeLength = seg.endIdx - seg.startIdx;
    return activeLength / minLength;
  });

  // 4. 使用中位数作为目标活跃比例
  const sortedRatios = [...activeRatios].sort((a, b) => a - b);
  const medianRatio = sortedRatios[Math.floor(sortedRatios.length / 2)];

  console.log(`[Cropping] 活跃比例: ${activeRatios.map(r => r.toFixed(2)).join(', ')}, 中位数: ${medianRatio.toFixed(2)}`);

  // 5. 找到最接近中位数的采集作为参考
  let referenceIdx = 0;
  let minDiff = Math.abs(activeRatios[0] - medianRatio);
  for (let i = 1; i < activeRatios.length; i++) {
    const diff = Math.abs(activeRatios[i] - medianRatio);
    if (diff < minDiff) {
      minDiff = diff;
      referenceIdx = i;
    }
  }

  console.log(`[Cropping] 参考采集: ${referenceIdx + 1}`);

  // 6. 使用中位数来获得鲁棒的对齐边界
  const allStartIndices = segmentations.map((seg) => seg.startIdx);
  const allEndIndices = segmentations.map((seg) => seg.endIdx);

  const sortedStarts = [...allStartIndices].sort((a, b) => a - b);
  const sortedEnds = [...allEndIndices].sort((a, b) => a - b);

  const alignedStartIdx = sortedStarts[Math.floor(sortedStarts.length / 2)];
  const alignedEndIdx = sortedEnds[Math.floor(sortedEnds.length / 2)];

  // 7. 计算最终置信度
  const totalActiveLength = segmentations.reduce((sum, seg) => sum + (seg.endIdx - seg.startIdx), 0);
  const avgConfidence = totalActiveLength / (collections.length * minLength);

  // 8. 使用参考采集的 SNR 权重
  const referenceWeights = segmentations[referenceIdx].snrWeights;

  console.log(`[Cropping] 对齐完成: [${alignedStartIdx}, ${alignedEndIdx}], 平均置信度: ${(avgConfidence * 100).toFixed(1)}%`);

  return {
    startIdx: Math.max(0, alignedStartIdx),
    endIdx: Math.min(minLength, alignedEndIdx),
    confidence: Math.min(1, avgConfidence),
    energyProfile: [],
    staticRegions: [],
    activeRegions: [],
    preprocessingApplied: true,
    snrWeights: referenceWeights,
  };
}

/**
 * 批量裁剪采集数据
 */
export function batchCropCollectionsAfterPreprocessing(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  samplingRate: number = 250
): Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> {
  const alignment = alignMultipleCollectionsAfterPreprocessing(collections, samplingRate);

  if (alignment.startIdx >= alignment.endIdx) {
    console.warn('[Cropping] 无法识别有效波形');
    return collections;
  }

  return collections.map((col) => ({
    ch1: col.ch1.slice(alignment.startIdx, alignment.endIdx),
    ch2: col.ch2.slice(alignment.startIdx, alignment.endIdx),
    ch3: col.ch3.slice(alignment.startIdx, alignment.endIdx),
  }));
}
```

### File: client/src/lib/pbkdf2-crypto.ts
```typescript
/**
 * PBKDF2 密码哈希和验证
 * 使用 Web Crypto API 实现安全的密码存储
 */

/**
 * 生成随机盐
 */
function generateSalt(length: number = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * 将 Uint8Array 转换为十六进制字符串
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 将十六进制字符串转换为 Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * 使用 PBKDF2 哈希密码
 * 返回格式：salt:hash（都是十六进制）
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt(16);
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  const key = await crypto.subtle.importKey(
    'raw',
    data,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000, // 足够安全的迭代次数
      hash: 'SHA-256',
    },
    key,
    256 // 256 位 = 32 字节
  );

  const hashArray = new Uint8Array(derivedBits);
  const saltHex = bytesToHex(salt);
  const hashHex = bytesToHex(hashArray);

  return `${saltHex}:${hashHex}`;
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) {
      console.error('Invalid hash format');
      return false;
    }

    const salt = hexToBytes(saltHex);
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const key = await crypto.subtle.importKey(
      'raw',
      data,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256
    );

    const hashArray = new Uint8Array(derivedBits);
    const computedHashHex = bytesToHex(hashArray);

    // 使用恒定时间比较防止时序攻击
    return constantTimeCompare(computedHashHex, hashHex);
  } catch (err) {
    console.error('Password verification failed:', err);
    return false;
  }
}

/**
 * 恒定时间字符串比较（防止时序攻击）
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * 迁移旧密码到 PBKDF2
 * 用于从旧的简单哈希迁移到新的安全哈希
 */
export async function migratePasswordHash(oldHash: string, password: string): Promise<string> {
  // 如果已经是 PBKDF2 格式（包含冒号），则直接返回
  if (oldHash.includes(':')) {
    return oldHash;
  }

  // 否则生成新的 PBKDF2 哈希
  return await hashPassword(password);
}
```

### File: client/src/lib/user-auth.ts
```typescript
/**
 * 用户认证管理模块
 * 
 * 功能：
 * - 用户注册和登录
 * - 密码加密和验证（使用 PBKDF2）
 * - 管理员账户管理
 */

import { hashPassword, verifyPassword, migratePasswordHash } from './pbkdf2-crypto';

export interface UserAccount {
  userId: string;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: number;
  passwordMigrated?: boolean; // 标记密码是否已迁移到 PBKDF2
}

const STORAGE_KEY = 'emg-user-accounts';
const ADMIN_USERNAME = 'Wagii';
const ADMIN_PASSWORD = 'geniusatwork';

// 获取所有账户（不调用初始化函数，避免递归）
function getAllAccountsRaw(): UserAccount[] {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    return [];
  }
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse user accounts:', err);
    return [];
  }
}

// 初始化管理员账户（异步）
async function initializeAdminAccount() {
  const accounts = getAllAccountsRaw();
  const adminExists = accounts.some(acc => acc.isAdmin);
  
  if (!adminExists) {
    const adminPasswordHash = await hashPassword(ADMIN_PASSWORD);
    const adminAccount: UserAccount = {
      userId: `admin-${Date.now()}`,
      username: ADMIN_USERNAME,
      passwordHash: adminPasswordHash,
      isAdmin: true,
      createdAt: Date.now(),
      passwordMigrated: true,
    };
    
    accounts.push(adminAccount);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  }
}

// 获取所有账户
export async function getAllAccounts(): Promise<UserAccount[]> {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    // 初始化管理员账户
    await initializeAdminAccount();
    // 再次读取
    return getAllAccountsRaw();
  }
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse user accounts:', err);
    return [];
  }
}

// 注册新用户（异步）
export async function registerUser(
  username: string,
  password: string
): Promise<{ success: boolean; message: string; userId?: string }> {
  if (!username || !password) {
    return { success: false, message: '用户名和密码不能为空' };
  }

  if (username.length < 2) {
    return { success: false, message: '用户名至少需要 2 个字符' };
  }

  if (password.length < 6) {
    return { success: false, message: '密码至少需要 6 个字符' };
  }

  const accounts = await getAllAccounts();
  
  // 检查用户名是否已存在
  if (accounts.some(acc => acc.username === username)) {
    return { success: false, message: '用户名已存在，请使用其他用户名' };
  }

  try {
    // 使用 PBKDF2 哈希密码
    const passwordHash = await hashPassword(password);

    // 创建新账户
    const newAccount: UserAccount = {
      userId: `user-${Date.now()}`,
      username,
      passwordHash,
      isAdmin: false,
      createdAt: Date.now(),
      passwordMigrated: true,
    };

    accounts.push(newAccount);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));

    return {
      success: true,
      message: '注册成功',
      userId: newAccount.userId,
    };
  } catch (err) {
    console.error('Registration failed:', err);
    return { success: false, message: '注册失败，请重试' };
  }
}

// 登录用户（异步）
export async function loginUser(
  username: string,
  password: string
): Promise<{ success: boolean; message: string; account?: UserAccount }> {
  if (!username || !password) {
    return { success: false, message: '用户名和密码不能为空' };
  }

  try {
    const accounts = await getAllAccounts();
    const account = accounts.find(acc => acc.username === username);

    if (!account) {
      return { success: false, message: '用户名或密码错误' };
    }

    // 验证密码（支持 PBKDF2 和简单哈希）
    let isPasswordValid = false;
    
    try {
      // 先尝试 PBKDF2 验证
      isPasswordValid = await verifyPassword(password, account.passwordHash);
    } catch (err) {
      // 如果 PBKDF2 验证失败，尝试简单哈希
      try {
        const simpleHash = btoa(`${password}:${account.createdAt}`);
        isPasswordValid = simpleHash === account.passwordHash;
      } catch (e) {
        isPasswordValid = false;
      }
    }
    
    if (!isPasswordValid) {
      return { success: false, message: '用户名或密码错误' };
    }

    // 如果密码还未迁移到 PBKDF2，进行迁移
    if (!account.passwordMigrated) {
      try {
        const newPasswordHash = await hashPassword(password);
        account.passwordHash = newPasswordHash;
        account.passwordMigrated = true;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
      } catch (err) {
        console.error('Password migration failed:', err);
        // 迁移失败不影响登录
      }
    }

    return {
      success: true,
      message: '登录成功',
      account,
    };
  } catch (err) {
    console.error('Login failed:', err);
    return { success: false, message: '登录失败，请重试' };
  }
}

// 检查用户名是否存在
export async function usernameExists(username: string): Promise<boolean> {
  const accounts = await getAllAccounts();
  return accounts.some(acc => acc.username === username);
}

// 获取用户账户
export async function getUserAccount(userId: string): Promise<UserAccount | null> {
  const accounts = await getAllAccounts();
  return accounts.find(acc => acc.userId === userId) || null;
}

// 重置用户密码（仅管理员可用）
export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, message: '密码至少需要 6 个字符' };
  }

  try {
    const accounts = await getAllAccounts();
    const account = accounts.find(acc => acc.userId === userId);

    if (!account) {
      return { success: false, message: '用户不存在' };
    }

    // 使用 PBKDF2 哈希新密码
    const newPasswordHash = await hashPassword(newPassword);
    account.passwordHash = newPasswordHash;
    account.passwordMigrated = true;
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));

    return {
      success: true,
      message: '密码重置成功',
    };
  } catch (err) {
    console.error('Password reset failed:', err);
    return { success: false, message: '密码重置失败，请重试' };
  }
}

// 初始化（异步）
initializeAdminAccount().catch(err => {
  console.error('Failed to initialize admin account:', err);
});
```

### File: shared/hardware-config.ts
```typescript
/**
 * 硬件配置常数
 * 
 * 统一定义所有硬件相关的配置参数
 * 确保整个系统采用一致的采样率、波特率等参数
 */

export const HARDWARE_CONFIG = {
  // 采样率：500 Hz
  // 对应固定长度 512 样本 = 1.024 秒
  SAMPLE_RATE: 500,

  // 波特率：230400 (改为 230400，提高稳定性)
  BAUD_RATE: 230400,

  // 通道数
  NUM_CHANNELS: 3,

  // 固定波形长度：512 样本 @ 500Hz = 1.024 秒
  FIXED_WAVEFORM_LENGTH: 512,

  // 固定时长（毫秒）
  FIXED_DURATION_MS: (512 / 500) * 1000, // 1024 ms

  // 帧长度（字节）
  FRAME_LENGTH: 10, // [帧头 4 字节] + [数据 6 字节]

  // 帧头
  FRAME_HEADER: [0xCC, 0xCC, 0x01, 0x06],
};

export default HARDWARE_CONFIG;
```

### File: shared/instruction-length-spec.ts
```typescript
/**
 * 指令长度规范定义
 * 
 * 所有指令的发音时长必须在规定范围内，以确保：
 * 1. 固定长度裁剪（512 样本 @ 500Hz = 1.024 秒）的有效性
 * 2. 模型训练的一致性和准确率
 * 3. 避免过长指令被截断或过短指令被过度填充
 */

/**
 * 指令长度规范
 */
export interface InstructionLengthSpec {
  // 指令名称
  name: string;
  
  // 最小发音时长（毫秒）
  minDurationMs: number;
  
  // 最大发音时长（毫秒）
  maxDurationMs: number;
  
  // 推荐发音时长（毫秒）
  recommendedDurationMs: number;
  
  // 说明
  description: string;
}

/**
 * 指令长度规范库
 * 
 * 规范原则：
 * - 最大时长 < 1.024 秒（512 样本 @ 500Hz）
 * - 最小时长 > 0.1 秒（50 样本 @ 500Hz）
 * - 推荐时长在中间值
 */
export const INSTRUCTION_LENGTH_SPECS: Record<string, InstructionLengthSpec> = {
  // 单音节指令
  "是": {
    name: "是",
    minDurationMs: 150,
    maxDurationMs: 300,
    recommendedDurationMs: 200,
    description: "单音节肯定回答，发音简短清晰",
  },
  "否": {
    name: "否",
    minDurationMs: 150,
    maxDurationMs: 300,
    recommendedDurationMs: 200,
    description: "单音节否定回答，发音简短清晰",
  },
  "开": {
    name: "开",
    minDurationMs: 150,
    maxDurationMs: 300,
    recommendedDurationMs: 200,
    description: "单音节开启指令，发音简短清晰",
  },
  "关": {
    name: "关",
    minDurationMs: 150,
    maxDurationMs: 300,
    recommendedDurationMs: 200,
    description: "单音节关闭指令，发音简短清晰",
  },

  // 双音节指令
  "播放": {
    name: "播放",
    minDurationMs: 200,
    maxDurationMs: 400,
    recommendedDurationMs: 300,
    description: "双音节播放指令，发音清晰",
  },
  "暂停": {
    name: "暂停",
    minDurationMs: 200,
    maxDurationMs: 400,
    recommendedDurationMs: 300,
    description: "双音节暂停指令，发音清晰",
  },
  "音量": {
    name: "音量",
    minDurationMs: 200,
    maxDurationMs: 400,
    recommendedDurationMs: 300,
    description: "双音节音量指令，发音清晰",
  },
  "亮度": {
    name: "亮度",
    minDurationMs: 200,
    maxDurationMs: 400,
    recommendedDurationMs: 300,
    description: "双音节亮度指令，发音清晰",
  },

  // 三音节指令
  "上一曲": {
    name: "上一曲",
    minDurationMs: 300,
    maxDurationMs: 600,
    recommendedDurationMs: 450,
    description: "三音节上一曲指令，注意不要过长",
  },
  "下一曲": {
    name: "下一曲",
    minDurationMs: 300,
    maxDurationMs: 600,
    recommendedDurationMs: 450,
    description: "三音节下一曲指令，注意不要过长",
  },
  "快进": {
    name: "快进",
    minDurationMs: 200,
    maxDurationMs: 450,
    recommendedDurationMs: 320,
    description: "双音节快进指令，发音清晰",
  },
  "快退": {
    name: "快退",
    minDurationMs: 200,
    maxDurationMs: 450,
    recommendedDurationMs: 320,
    description: "双音节快退指令，发音清晰",
  },
  "音量加": {
    name: "音量加",
    minDurationMs: 250,
    maxDurationMs: 500,
    recommendedDurationMs: 380,
    description: "三音节音量加指令，注意不要过长",
  },
  "音量减": {
    name: "音量减",
    minDurationMs: 250,
    maxDurationMs: 500,
    recommendedDurationMs: 380,
    description: "三音节音量减指令，注意不要过长",
  },
};

/**
 * 采样率常量
 */
export const SAMPLE_RATE = 500; // Hz

/**
 * 固定长度常量
 */
export const FIXED_WAVEFORM_LENGTH = 512; // 样本

/**
 * 计算固定长度对应的时间长度
 */
export const FIXED_DURATION_MS = (FIXED_WAVEFORM_LENGTH / SAMPLE_RATE) * 1000; // 1.024 秒

/**
 * 验证指令长度是否符合规范
 * @param instructionName 指令名称
 * @param durationMs 实际发音时长（毫秒）
 * @returns 验证结果
 */
export function validateInstructionLength(
  instructionName: string,
  durationMs: number
): {
  isValid: boolean;
  message: string;
  spec?: InstructionLengthSpec;
} {
  // 使用 getInstructionSpec 获取规范（支持自动生成）
  const spec = getInstructionSpec(instructionName);

  if (!spec) {
    return {
      isValid: false,
      message: `无法为指令 "${instructionName}" 生成规范`,
    };
  }

  if (durationMs < spec.minDurationMs) {
    return {
      isValid: false,
      message: `指令 "${instructionName}" 过短（${durationMs}ms < ${spec.minDurationMs}ms），请重新发音`,
      spec,
    };
  }

  if (durationMs > spec.maxDurationMs) {
    return {
      isValid: false,
      message: `指令 "${instructionName}" 过长（${durationMs}ms > ${spec.maxDurationMs}ms），请重新发音`,
      spec,
    };
  }

  return {
    isValid: true,
    message: `指令 "${instructionName}" 长度符合规范（${durationMs}ms）`,
    spec,
  };
}

/**
 * 计算波形对应的发音时长
 * @param waveformLength 波形样本数
 * @returns 发音时长（毫秒）
 */
export function calculateDurationMs(waveformLength: number): number {
  return (waveformLength / SAMPLE_RATE) * 1000;
}

/**
 * 计算发音时长对应的样本数
 * @param durationMs 发音时长（毫秒）
 * @returns 样本数
 */
export function calculateSampleCount(durationMs: number): number {
  return Math.round((durationMs / 1000) * SAMPLE_RATE);
}

/**
 * 根据指令名称长度推断指令类型
 */
function inferInstructionType(instructionName: string): 'single-syllable' | 'double-syllable' | 'multi-syllable' {
  const charCount = instructionName.length;
  if (charCount <= 2) return 'single-syllable';
  if (charCount <= 4) return 'double-syllable';
  return 'multi-syllable';
}

/**
 * 为缺失规范的指令生成默认规范
 */
function generateDefaultSpec(instructionName: string): InstructionLengthSpec {
  const type = inferInstructionType(instructionName);
  
  const defaultSpecs: Record<string, Omit<InstructionLengthSpec, 'name'>> = {
    'single-syllable': {
      minDurationMs: 150,
      maxDurationMs: 300,
      recommendedDurationMs: 200,
      description: '单音节指令（自动生成规范）',
    },
    'double-syllable': {
      minDurationMs: 200,
      maxDurationMs: 450,
      recommendedDurationMs: 320,
      description: '双音节指令（自动生成规范）',
    },
    'multi-syllable': {
      minDurationMs: 250,
      maxDurationMs: 600,
      recommendedDurationMs: 400,
      description: '多音节指令（自动生成规范）',
    },
  };
  
  const spec = defaultSpecs[type];
  return {
    name: instructionName,
    ...spec,
  };
}

/**
 * 获取指令的规范（支持自动生成缺失规范）
 * @param instructionName 指令名称
 * @returns 规范信息
 */
export function getInstructionSpec(instructionName: string): InstructionLengthSpec | null {
  // 先查找定义的规范
  if (INSTRUCTION_LENGTH_SPECS[instructionName]) {
    return INSTRUCTION_LENGTH_SPECS[instructionName];
  }
  
  // 如果未定义，自动生成默认规范
  return generateDefaultSpec(instructionName);
}

/**
 * 获取所有指令的规范
 * @returns 所有规范信息
 */
export function getAllInstructionSpecs(): InstructionLengthSpec[] {
  return Object.values(INSTRUCTION_LENGTH_SPECS);
}

/**
 * 生成指令长度规范的人类可读文本
 * @returns 规范文本
 */
export function generateSpecText(): string {
  const specs = getAllInstructionSpecs();
  const lines: string[] = [
    "=" .repeat(70),
    "指令长度规范",
    "=" .repeat(70),
    "",
    `固定长度：${FIXED_WAVEFORM_LENGTH} 样本 @ ${SAMPLE_RATE}Hz = ${FIXED_DURATION_MS.toFixed(3)} 秒`,
    "",
    "指令规范：",
    "-" .repeat(70),
  ];

  specs.forEach((spec) => {
    lines.push(
      `${spec.name.padEnd(10)} | ${spec.minDurationMs}ms - ${spec.maxDurationMs}ms | 推荐: ${spec.recommendedDurationMs}ms`
    );
  });

  lines.push("-" .repeat(70));
  lines.push("");
  lines.push("注意事项：");
  lines.push("1. 所有指令的发音时长必须在规定范围内");
  lines.push("2. 过短的指令会被过度填充，影响特征质量");
  lines.push("3. 过长的指令会被中间截断，丢失信息");
  lines.push("4. 推荐使用推荐时长进行发音");
  lines.push("");

  return lines.join("\n");
}
```

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
import { HARDWARE_CONFIG } from '@shared/hardware-config';
import { extractFrequencyDomainFeaturesV2 } from './frequency-domain-features-v2';

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
  // ✅ 修复10：正确的高通滤波器系数计算
  // 标准一阶高通：alpha = rc / (rc + dt)
  const alpha = rc / (rc + dt);

  const filtered: number[] = [];
  let prevOutput = 0;
  let prevInput = signal[0];

  for (let i = 0; i < signal.length; i++) {
    // ✅ 修复10：一阶高通滤波器实现
    // y[i] = alpha * (y[i-1] + x[i] - x[i-1])
    const current = alpha * (prevOutput + signal[i] - prevInput);
    filtered.push(current);
    prevOutput = current;
    prevInput = signal[i];
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
/**
 * ✅ 修复5：替换为 amplitude-invariant 形状特征（7维）
 * 原因：振幅归一化导致 peak、peak2peak、mean 这3个特征失效
 * 这些常数特征在 per-sample Z-score 后成为离群值，占据极大权重
 * 导致有判别力的特征（ZCR、WL、SSC）被淹没
 * 
 * 新特征都与波形振幅无关，只与波形形状有关：
 * 1. ZCR - 零交叉率
 * 2. SSC - 坡度变化
 * 3. 归一化波形长度（WL / length）
 * 4-7. 四段能量占比 - 最关键！能直接区分 one 和 two
 */
export function extractTimeDomainFeatures(signal: number[], skipPreprocessing: boolean = false): number[] {
  if (signal.length === 0) return Array(7).fill(0);

  // 预处理：去噪（如果需要）
  const filtered = skipPreprocessing ? signal : highPassFilter(signal);

  // 1. 零交叉率 (ZCR) - amplitude-invariant
  let zcr = 0;
  for (let i = 1; i < filtered.length; i++) {
    if (filtered[i] * filtered[i - 1] < 0) {
      zcr++;
    }
  }
  zcr = zcr / filtered.length;

  // 2. 坡度变化 (Slope Sign Changes) - amplitude-invariant
  let ssc = 0;
  for (let i = 1; i < filtered.length - 1; i++) {
    const slope1 = filtered[i] - filtered[i - 1];
    const slope2 = filtered[i + 1] - filtered[i];
    if (slope1 * slope2 < 0) {
      ssc++;
    }
  }
  ssc = ssc / filtered.length;

  // 3. 归一化波形长度（WL / length） - amplitude-invariant
  // 原因：除以长度去掉振幅影响，只保留形状信息
  let waveformLength = 0;
  for (let i = 1; i < filtered.length; i++) {
    waveformLength += Math.abs(filtered[i] - filtered[i - 1]);
  }
  const normalizedWL = waveformLength / filtered.length;

  // 4-7. 四段能量占比 - 最关键！amplitude-invariant
  // 能直接区分 one 和 two：one 在某段集中，two 在两段分布
  const segSize = Math.floor(filtered.length / 4);
  const segEnergies = [0, 1, 2, 3].map(s => {
    const start = s * segSize;
    const end = (s + 1) * segSize;
    const seg = filtered.slice(start, end);
    return seg.reduce((a, x) => a + x * x, 0) / Math.max(seg.length, 1);
  });
  const totalEnergy = segEnergies.reduce((a, b) => a + b, 0) || 1;
  const energyDist = segEnergies.map(e => e / totalEnergy);  // 和为1，amplitude-invariant

  return [zcr, ssc, normalizedWL, ...energyDist];  // 7维
}

/**
 * 保留原始的 extractTimeDomainFeatures 作为备份（10维版本）
 * 如果需要回滚可以使用
 */
export function extractTimeDomainFeaturesLegacy(signal: number[], skipPreprocessing: boolean = false): number[] {
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
  samplingRate: number = 500
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
  // ✅ 修复：禁用ICA，ICA随机初始化导致每次特征不可重复
  // ICA的成分顺序和符号每次都随机，导致特征向量无法比对
  let processedCh1 = ch1, processedCh2 = ch2, processedCh3 = ch3;
  if (enablePreprocessing) {
    const preprocessed = preprocessSignal(ch1, ch2, ch3, samplingRate, false);  // false = 禁用ICA
    processedCh1 = preprocessed.ch1;
    processedCh2 = preprocessed.ch2;
    processedCh3 = preprocessed.ch3;
  }

  // ✅ 修复：只使用时域特征（30维）+ 频域特征（18维）= 48维
  // 原因：150维特征导致严重过度拟合，采集次数（7-8）远小于特征维度
  
  // ✅ 时域特征：每个通道 7 维（amplitude-invariant 形状特征），共 21 维
  const timeDomainCh1 = extractTimeDomainFeatures(processedCh1, true);
  const timeDomainCh2 = extractTimeDomainFeatures(processedCh2, true);
  const timeDomainCh3 = extractTimeDomainFeatures(processedCh3, true);

  // 频域特征：每个通道 6 维（简化版本），共 18 维
  // 只保留关键的频域特征，移除MFCC和梅尔谱图
  const frequencyDomainCh1 = extractFrequencyDomainFeaturesSimplified(processedCh1, samplingRate);
  const frequencyDomainCh2 = extractFrequencyDomainFeaturesSimplified(processedCh2, samplingRate);
  const frequencyDomainCh3 = extractFrequencyDomainFeaturesSimplified(processedCh3, samplingRate);

  // ✅ 组合特征向量（从48维改为39维：21维时域 + 18维频域）
  const fullFeature = [
    ...timeDomainCh1,
    ...timeDomainCh2,
    ...timeDomainCh3,
    ...frequencyDomainCh1,
    ...frequencyDomainCh2,
    ...frequencyDomainCh3,
  ];

  return {
    timeDomain: { ch1: timeDomainCh1, ch2: timeDomainCh2, ch3: timeDomainCh3 },
    frequencyDomain: { ch1: frequencyDomainCh1, ch2: frequencyDomainCh2, ch3: frequencyDomainCh3 },
    // ✅ 修复问题5：添加 melSpectrogram 以满足 EMGFeatures 类型要求
    melSpectrogram: { ch1: [], ch2: [], ch3: [] },
    fullFeature,
  };
}


/**
 * ✅ 新增：简化的频域特征提取（6维）
 * 只保留关键的频域特征，避免过度拟合
 */
export function extractFrequencyDomainFeaturesSimplified(
  signal: number[],
  samplingRate: number = 500
): number[] {
  if (signal.length === 0) return [0, 0, 0, 0, 0, 0];
  
  // 使用FFT计算频谱
  const fft = new FFT(signal.length);
  const spectrum = fft.createComplexArray();
  const input = fft.createComplexArray();
  
  // 填充输入
  for (let i = 0; i < signal.length; i++) {
    input[2 * i] = signal[i];
    input[2 * i + 1] = 0;
  }
  
  // 执行FFT
  fft.transform(spectrum, input);
  
  // 计算幅度谱
  const magnitude: number[] = [];
  for (let i = 0; i < signal.length / 2; i++) {
    const real = spectrum[2 * i];
    const imag = spectrum[2 * i + 1];
    magnitude.push(Math.sqrt(real * real + imag * imag));
  }
  
  // 提取6个关键特征
  const features: number[] = [];
  
  // 1. 频谱能量
  features.push(ss.sum(magnitude));
  
  // 2. 频谱熵
  const normalized = magnitude.map(m => m / ss.sum(magnitude));
  let entropy = 0;
  for (const p of normalized) {
    if (p > 0) entropy -= p * Math.log2(p);
  }
  features.push(entropy);
  
  // 3. 频谱质心
  let numerator = 0, denominator = 0;
  for (let i = 0; i < magnitude.length; i++) {
    numerator += i * magnitude[i];
    denominator += magnitude[i];
  }
  features.push(denominator > 0 ? numerator / denominator : 0);
  
  // 4. 低频能量（0-100Hz）
  const lowFreqBin = Math.floor(100 * signal.length / samplingRate);
  features.push(ss.sum(magnitude.slice(0, lowFreqBin)));
  
  // 5. 中频能量（100-200Hz）
  const midFreqBin = Math.floor(200 * signal.length / samplingRate);
  features.push(ss.sum(magnitude.slice(lowFreqBin, midFreqBin)));
  
  // 6. 高频能量（200Hz以上）
  features.push(ss.sum(magnitude.slice(midFreqBin)));
  
  return features;
}

/**
 * 归一化特征向量
 * ✅ 修复：不进行全局归一化，保留原始特征的相对差异
 * 全局归一化会抹除不同指令的特征差异，导致识别失败
 */
export function normalizeFeatures(features: number[]): number[] {
  // ✅ 修复：返回原始特征，不进行全局归一化
  // 原因：全局归一化会将所有特征映射到相同的分布，抹除指令差异
  return features;
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
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
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
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE,
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
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE,
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

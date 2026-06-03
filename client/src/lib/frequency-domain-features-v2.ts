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
  // 修复：改为频带平均而非单点采样，以提高鲁棒性
  // 原实现直接取单点功率，对噪声极度敏感，同一指令重复采集特征值可能变化 50% 以上
  // 新实现对 [freq-5, freq+5] Hz 范围内的所有 bin 求平均，显著提升鲁棒性
  const features: number[] = [];
  for (let freq = 0; freq <= 250; freq += 10) {
    const centerIdx = Math.floor(freq / freqResolution);
    const bandwidthBins = Math.ceil(5 / freqResolution); // ±5Hz 对应的 bin 数
    
    // 计算频带平均功率
    let bandPower = 0;
    let count = 0;
    for (let i = Math.max(0, centerIdx - bandwidthBins); 
         i <= Math.min(power.length - 1, centerIdx + bandwidthBins); 
         i++) {
      bandPower += power[i];
      count++;
    }
    
    features.push(count > 0 ? bandPower / count : 0);
  }

  // 5. 添加 4 维统计特征
  const totalPower = ss.sum(power);
  
  // 5.1 低频能量比 (0-50 Hz)
  const lowFreqIdx = Math.floor(50 / freqResolution);
  const lowFreqPower = ss.sum(power.slice(0, Math.min(lowFreqIdx + 1, power.length)));
  features.push(lowFreqPower / (totalPower || 1));
  
  // 5.2 中频能量比 (50-150 Hz)
  const midFreqStartIdx = Math.floor(50 / freqResolution);
  const midFreqEndIdx = Math.floor(150 / freqResolution);
  const midFreqPower = ss.sum(power.slice(midFreqStartIdx, Math.min(midFreqEndIdx + 1, power.length)));
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

/**
 * FFT 频谱分析模块
 * 
 * 功能：
 * - 计算信号的频谱
 * - 识别主要频率成分
 * - 分析噪声特性
 * - 评估信号质量
 */

import FFT from 'fft.js';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

export interface SpectrumAnalysis {
  frequencies: number[];
  magnitudes: number[];
  dominantFrequency: number;
  dominantMagnitude: number;
  noiseFloor: number;
  snr: number; // 信噪比
  peakFrequencies: Array<{ frequency: number; magnitude: number }>;
}

/**
 * 计算信号的 FFT 频谱
 */
export function computeFFT(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): SpectrumAnalysis {
  // 补零到 2 的幂次方
  const fftSize = Math.pow(2, Math.ceil(Math.log2(signal.length)));
  const paddedSignal = [...signal, ...Array(fftSize - signal.length).fill(0)];

  // 应用 Hanning 窗口，减少频谱泄露
  const window = hanningWindow(paddedSignal.length);
  const windowedSignal = paddedSignal.map((x, i) => x * window[i]);

  // 计算 FFT
  const fft = new FFT(fftSize);
  const spectrum = fft.createComplexArray();
  for (let i = 0; i < fftSize; i++) {
    spectrum[2 * i] = windowedSignal[i];
    spectrum[2 * i + 1] = 0;
  }

  (fft as any).forward(spectrum);

  // 计算幅度谱
  const magnitudes: number[] = [];
  const frequencies: number[] = [];

  for (let i = 0; i < fftSize / 2; i++) {
    const real = spectrum[2 * i];
    const imag = spectrum[2 * i + 1];
    const magnitude = Math.sqrt(real * real + imag * imag) / fftSize;
    magnitudes.push(magnitude);

    const frequency = (i * samplingRate) / fftSize;
    frequencies.push(frequency);
  }

  // 找到主要频率成分
  let dominantIdx = 0;
  let dominantMagnitude = 0;

  // 只考虑 10-200 Hz 范围（肌电信号的主要频率范围）
  const minFreq = 10;
  const maxFreq = 200;
  const minIdx = Math.floor((minFreq * fftSize) / samplingRate);
  const maxIdx = Math.floor((maxFreq * fftSize) / samplingRate);

  for (let i = minIdx; i < Math.min(maxIdx, magnitudes.length); i++) {
    if (magnitudes[i] > dominantMagnitude) {
      dominantMagnitude = magnitudes[i];
      dominantIdx = i;
    }
  }

  const dominantFrequency = frequencies[dominantIdx];

  // 计算噪声基准（低频噪声的平均值）
  const noiseFloor = magnitudes.slice(0, minIdx).reduce((a, b) => a + b, 0) / minIdx;

  // 计算信噪比 (SNR)
  const signalPower = magnitudes.slice(minIdx, maxIdx).reduce((a, b) => a + b, 0);
  const noisePower = magnitudes.slice(0, minIdx).reduce((a, b) => a + b, 0);
  const snr = 10 * Math.log10((signalPower + 1e-10) / (noisePower + 1e-10));

  // 找到前 5 个主要峰值
  const peakFrequencies: Array<{ frequency: number; magnitude: number }> = [];
  const peaks = findPeaks(magnitudes, minIdx, maxIdx);

  for (const peakIdx of peaks.slice(0, 5)) {
    peakFrequencies.push({
      frequency: frequencies[peakIdx],
      magnitude: magnitudes[peakIdx],
    });
  }

  return {
    frequencies,
    magnitudes,
    dominantFrequency,
    dominantMagnitude,
    noiseFloor,
    snr: Math.max(-20, Math.min(60, snr)), // 限制在 -20 到 60 dB
    peakFrequencies,
  };
}

/**
 * Hanning 窗口
 */
function hanningWindow(length: number): number[] {
  const window: number[] = [];
  for (let i = 0; i < length; i++) {
    window.push(0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1))));
  }
  return window;
}

/**
 * 找到频谱中的峰值
 */
function findPeaks(
  magnitudes: number[],
  startIdx: number,
  endIdx: number,
  threshold: number = 0.1
): number[] {
  const peaks: number[] = [];
  const maxMag = Math.max(...magnitudes.slice(startIdx, endIdx));

  for (let i = startIdx + 1; i < endIdx - 1; i++) {
    if (
      magnitudes[i] > magnitudes[i - 1] &&
      magnitudes[i] > magnitudes[i + 1] &&
      magnitudes[i] > maxMag * threshold
    ) {
      peaks.push(i);
    }
  }

  // 按幅度排序
  peaks.sort((a, b) => magnitudes[b] - magnitudes[a]);

  return peaks;
}

/**
 * 评估信号质量（基于频谱特性）
 */
export function assessSignalQuality(analysis: SpectrumAnalysis): {
  score: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  feedback: string;
} {
  let score = 50; // 基础分数

  // 1. SNR 评分（权重 40%）
  if (analysis.snr > 15) score += 20;
  else if (analysis.snr > 10) score += 15;
  else if (analysis.snr > 5) score += 10;
  else if (analysis.snr > 0) score += 5;

  // 2. 主要频率评分（权重 30%）
  if (analysis.dominantFrequency > 10 && analysis.dominantFrequency < 200) {
    score += 15;
  }
  if (analysis.dominantMagnitude > analysis.noiseFloor * 5) {
    score += 15;
  }

  // 3. 峰值数量评分（权重 30%）
  const peakCount = analysis.peakFrequencies.length;
  if (peakCount >= 3) score += 15;
  else if (peakCount >= 2) score += 10;
  else if (peakCount >= 1) score += 5;

  score = Math.min(100, Math.max(0, score));

  let quality: 'excellent' | 'good' | 'fair' | 'poor';
  let feedback: string;

  if (score >= 80) {
    quality = 'excellent';
    feedback = '✓ 信号质量优秀，适合训练和识别';
  } else if (score >= 60) {
    quality = 'good';
    feedback = '✓ 信号质量良好，可用于训练';
  } else if (score >= 40) {
    quality = 'fair';
    feedback = '⚠ 信号质量一般，建议重新采集';
  } else {
    quality = 'poor';
    feedback = '✗ 信号质量差，请检查设备连接';
  }

  return { score, quality, feedback };
}

/**
 * 比较两个信号的频谱相似度
 */
export function compareSpectra(
  spectrum1: SpectrumAnalysis,
  spectrum2: SpectrumAnalysis
): number {
  // 计算频谱的欧几里得距离
  let distance = 0;
  const minLen = Math.min(spectrum1.magnitudes.length, spectrum2.magnitudes.length);

  for (let i = 0; i < minLen; i++) {
    distance += (spectrum1.magnitudes[i] - spectrum2.magnitudes[i]) ** 2;
  }

  distance = Math.sqrt(distance / minLen);

  // 转换为相似度（0-100）
  const similarity = Math.max(0, 100 - distance * 100);

  return similarity;
}

/**
 * DSP 增强处理模块
 * 
 * 功能：
 * - 原始波形 (Raw) 显示
 * - 滤波波形 (Filtered) 显示
 * - 包络波形 (Envelope) 显示
 * 
 * 优化（基于实际数据分析）：
 * - 低通滤波截止频率：150 Hz → 300 Hz（保留更多高频信息）
 * - 带通范围：10-200 Hz → 10-300 Hz
 * - 添加 50 Hz 陷波滤波器（去除工频干扰）
 */

import { highPassFilter } from './dsp-processor';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

/**
 * 低通滤波（去除高频噪声）
 * 使用一阶 IIR 低通滤波器
 * 优化：截止频率从 150 Hz 提升到 300 Hz，保留更多肌电信息
 */
export function lowPassFilter(
  signal: number[],
  cutoffFreq: number = 300,
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): number[] {
  const rc = 1 / (2 * Math.PI * cutoffFreq);
  const dt = 1 / samplingRate;
  const alpha = dt / (rc + dt);

  const filtered: number[] = [];
  let prev = signal[0];

  for (let i = 0; i < signal.length; i++) {
    const current = alpha * signal[i] + (1 - alpha) * prev;
    filtered.push(current);
    prev = current;
  }

  return filtered;
}

/**
 * 50 Hz 陷波滤波器（去除工频干扰）
 * 使用二阶 IIR 陷波滤波器，高 Q 值确保只影响 50 Hz 附近
 */
export function notchFilter50Hz(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): number[] {
  const Q = 30; // 高品质因数，使陷波更尖锐
  const w0 = (2 * Math.PI * 50) / samplingRate;
  const alpha = Math.sin(w0) / (2 * Q);

  const b0 = 1;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  const filtered: number[] = [];
  let y1 = 0, y2 = 0;
  let x1 = 0, x2 = 0;

  for (let i = 0; i < signal.length; i++) {
    const x0 = signal[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    filtered.push(y0);
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return filtered;
}

/**
 * 带通滤波（10-300 Hz）
 * 结合高通和低通滤波，可选添加 50 Hz 陷波
 * 优化：低通截止频率从 200 Hz 提升到 300 Hz
 */
export function bandPassFilter(
  signal: number[],
  lowCutoff: number = 10,
  highCutoff: number = 300,
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE,
  useNotch: boolean = true
): number[] {
  let filtered = highPassFilter(signal, lowCutoff, samplingRate);
  filtered = lowPassFilter(filtered, highCutoff, samplingRate);
  
  // 可选：应用 50 Hz 陷波滤波器
  if (useNotch) {
    filtered = notchFilter50Hz(filtered, samplingRate);
  }
  
  return filtered;
}

/**
 * 计算包络（使用希尔伯特变换的近似）
 * 方法：对滤波信号进行整流后低通滤波
 */
export function computeEnvelope(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): number[] {
  // 第一步：全波整流
  const rectified = signal.map(Math.abs);

  // 第二步：低通滤波（提取包络）
  const envelope = lowPassFilter(rectified, 5, samplingRate);

  return envelope;
}

/**
 * 处理原始、滤波、包络三层波形
 */
export interface ProcessedWaveforms {
  raw: number[];
  filtered: number[];
  envelope: number[];
}

export function processWaveform(
  signal: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): ProcessedWaveforms {
  const raw = signal;
  // 使用优化后的带通滤波（10-300 Hz，包含 50 Hz 陷波）
  const filtered = bandPassFilter(signal, 10, 300, samplingRate, true);
  const envelope = computeEnvelope(filtered, samplingRate);

  return {
    raw,
    filtered,
    envelope,
  };
}

/**
 * 处理三通道波形
 */
export interface ProcessedMultiChannelWaveforms {
  ch1: ProcessedWaveforms;
  ch2: ProcessedWaveforms;
  ch3: ProcessedWaveforms;
}

export function processMultiChannelWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): ProcessedMultiChannelWaveforms {
  return {
    ch1: processWaveform(ch1, samplingRate),
    ch2: processWaveform(ch2, samplingRate),
    ch3: processWaveform(ch3, samplingRate),
  };
}

/**
 * 计算信噪比 (SNR)
 */
export function computeSNR(signal: number[]): number {
  if (signal.length === 0) return 0;

  // 计算信号功率
  const signalPower = signal.reduce((sum, x) => sum + x * x, 0) / signal.length;

  // 计算噪声功率（使用前 10% 作为噪声估计）
  const noiseLength = Math.ceil(signal.length * 0.1);
  const noise = signal.slice(0, noiseLength);
  const noisePower = noise.reduce((sum, x) => sum + x * x, 0) / noise.length;

  if (noisePower === 0) return 0;

  return 10 * Math.log10(signalPower / noisePower);
}

/**
 * 计算信号质量评分（0-100）
 * 基于 SNR、能量和频谱分布
 */
export function computeSignalQuality(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): number {
  if (ch1.length === 0 || ch2.length === 0 || ch3.length === 0) return 0;

  // SNR 评分
  const snr1 = computeSNR(ch1);
  const snr2 = computeSNR(ch2);
  const snr3 = computeSNR(ch3);
  const avgSNR = (snr1 + snr2 + snr3) / 3;
  const snrScore = Math.min(100, Math.max(0, (avgSNR + 10) * 5)); // 范围 0-100

  // 能量评分
  const energy1 = ch1.reduce((sum, x) => sum + x * x, 0) / ch1.length;
  const energy2 = ch2.reduce((sum, x) => sum + x * x, 0) / ch2.length;
  const energy3 = ch3.reduce((sum, x) => sum + x * x, 0) / ch3.length;
  const avgEnergy = (energy1 + energy2 + energy3) / 3;
  const energyScore = Math.min(100, Math.max(0, Math.sqrt(avgEnergy) * 10));

  // 综合评分（权重：SNR 60%，能量 40%）
  const qualityScore = snrScore * 0.6 + energyScore * 0.4;

  return Math.round(qualityScore);
}

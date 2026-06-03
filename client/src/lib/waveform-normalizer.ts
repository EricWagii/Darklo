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

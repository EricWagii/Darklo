/**
 * 基线校准模块
 * 
 * 功能：
 * - 采集静息基线数据
 * - 计算基线统计特性
 * - 实时减基线处理
 * - 基线漂移检测和补偿
 */

import { emgDatabase } from './db';

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

        // 保存到 IndexedDB
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
// ✅ 修改5：改为async以正确等待IndexedDB操作
export async function loadBaselineFromStorage(): Promise<BaselineCalibrationResult | null> {
  try {
    const data = await emgDatabase.getCalibration();
    if (!data) return null;

    const result = data as BaselineCalibrationResult;
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
// ✅ 修改5：改为async以正确等待IndexedDB操作
export async function saveBaselineToStorage(result: BaselineCalibrationResult): Promise<void> {
  try {
    await emgDatabase.saveCalibration(result);
  } catch (err) {
    console.error('Failed to save baseline to storage:', err);
  }
}

/**
 * 清除存储的基线
 */
// ✅ 修改5：改为async以正确等待IndexedDB操作
export async function clearBaselineFromStorage(): Promise<void> {
  try {
    await emgDatabase.clearCalibration();
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

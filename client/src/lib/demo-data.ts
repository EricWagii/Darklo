/**
 * 演示模式 - 示例数据生成
 * 
 * 为没有硬件的用户生成逼真的示例数据
 */

import { PREDEFINED_COMMANDS, FeatureVector, TrainingData } from '@/../../shared/const';
import { emgDatabase } from './db';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

/**
 * 生成模拟 EMG 信号
 */
function generateMockEMGSignal(
  commandId: string,
  duration: number = 3,
  sampleRate: number = HARDWARE_CONFIG.SAMPLE_RATE
): number[][] {
  const samples = duration * sampleRate;
  const signal: number[][] = [];

  // 为不同指令生成不同的特征信号
  const commandIndex = PREDEFINED_COMMANDS.findIndex((c) => c.id === commandId);
  const baseFreq = 10 + commandIndex * 5; // 不同指令有不同的基频
  const amplitude = 200 + Math.random() * 100; // 随机振幅

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const phase = (2 * Math.PI * baseFreq * t) / 10;

    // 生成三个通道的信号，每个通道有不同的特征
    const ch1 =
      amplitude * Math.sin(phase) +
      50 * Math.sin(phase * 2) +
      Math.random() * 30;
    const ch2 =
      amplitude * Math.cos(phase) +
      40 * Math.sin(phase * 1.5) +
      Math.random() * 25;
    const ch3 =
      amplitude * Math.sin(phase * 0.8) +
      60 * Math.cos(phase * 2.5) +
      Math.random() * 35;

    signal.push([
      Math.max(0, ch1),
      Math.max(0, ch2),
      Math.max(0, ch3),
    ]);
  }

  return signal;
}

/**
 * 计算特征向量
 */
function calculateFeatures(samples: number[][]): FeatureVector {
  const channels = 3;
  const mean = new Array(channels).fill(0);
  const variance = new Array(channels).fill(0);
  const rms = new Array(channels).fill(0);

  // 计算均值
  for (let ch = 0; ch < channels; ch++) {
    let sum = 0;
    for (const sample of samples) {
      sum += sample[ch];
    }
    mean[ch] = sum / samples.length;
  }

  // 计算方差和 RMS
  for (let ch = 0; ch < channels; ch++) {
    let sumSquaredDiff = 0;
    let sumSquared = 0;

    for (const sample of samples) {
      const diff = sample[ch] - mean[ch];
      sumSquaredDiff += diff * diff;
      sumSquared += sample[ch] * sample[ch];
    }

    variance[ch] = sumSquaredDiff / samples.length;
    rms[ch] = Math.sqrt(sumSquared / samples.length);
  }

  return { mean, variance, rms };
}

/**
 * 生成演示数据
 */
export async function generateDemoData(): Promise<void> {
  try {
    // 清空现有数据
    await emgDatabase.clearAllTrainingData();

    // 为每条指令生成 3 个训练样本
    for (const command of PREDEFINED_COMMANDS) {
      const samples: number[][][] = [];
      const features: FeatureVector[] = [];

      for (let i = 0; i < 3; i++) {
        // 生成模拟信号
        const signal = generateMockEMGSignal(command.id);
        samples.push(signal);

        // 计算特征
        const feature = calculateFeatures(signal);
        features.push(feature);
      }

      // 计算平均特征
      const averageFeature: FeatureVector = {
        mean: [0, 0, 0],
        variance: [0, 0, 0],
        rms: [0, 0, 0],
      };

      for (const feature of features) {
        for (let i = 0; i < 3; i++) {
          averageFeature.mean[i] += feature.mean[i];
          averageFeature.variance[i] += feature.variance[i];
          averageFeature.rms[i] += feature.rms[i];
        }
      }

      for (let i = 0; i < 3; i++) {
        averageFeature.mean[i] /= 3;
        averageFeature.variance[i] /= 3;
        averageFeature.rms[i] /= 3;
      }

      // 保存训练数据
      const trainingData: TrainingData = {
        commandId: command.id,
        commandName: command.name,
        samples: samples as any,
        features,
        averageFeature,
        timestamp: Date.now(),
      };

      await emgDatabase.saveTrainingData(trainingData);
    }
  } catch (error) {
    throw new Error('生成演示数据失败: ' + (error as Error).message);
  }
}

/**
 * 检查是否已有演示数据
 */
export async function hasDemoData(): Promise<boolean> {
  try {
    const trainingData = await emgDatabase.getAllTrainingData();
    return trainingData.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * 清除演示数据
 */
export async function clearDemoData(): Promise<void> {
  try {
    await emgDatabase.clearAllTrainingData();
  } catch (error) {
    throw new Error('清除演示数据失败: ' + (error as Error).message);
  }
}

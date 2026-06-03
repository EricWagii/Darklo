/**
 * 自适应长度裁剪和时间规范化策略
 * 
 * 解决问题：
 * 1. 不同指令的长度差异 - 按指令计算平均长度
 * 2. 同指令的速度变化 - 使用时间规范化处理
 * 3. 长度差异导致的特征偏差 - 使用重采样
 */

import { logger } from './logger';

export interface CommandLengthProfile {
  commandName: string;
  stage1Lengths: number[]; // 第一阶段裁剪后的长度列表
  avgLength: number; // 平均长度
  minLength: number; // 最小长度
  maxLength: number; // 最大长度
  stdDev: number; // 标准差
  targetLength: number; // 推荐的目标长度
  lengthVariability: 'low' | 'medium' | 'high'; // 长度变异程度
}

export interface TimeNormalizationResult {
  originalLength: number;
  normalizedLength: number;
  scaleFactor: number;
  method: 'resample' | 'interpolate';
  quality: number; // 0-1，表示规范化质量
}

/**
 * 自适应裁剪策略管理器
 */
export class AdaptiveCroppingStrategy {
  private commandProfiles: Map<string, CommandLengthProfile> = new Map();

  /**
   * 分析指令的长度分布
   */
  analyzeCommandLengths(
    commandName: string,
    stage1Lengths: number[]
  ): CommandLengthProfile {
    if (stage1Lengths.length === 0) {
      throw new Error('No waveforms to analyze');
    }

    const avgLength = stage1Lengths.reduce((a, b) => a + b, 0) / stage1Lengths.length;
    const minLength = Math.min(...stage1Lengths);
    const maxLength = Math.max(...stage1Lengths);

    // 计算标准差
    const variance =
      stage1Lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) /
      stage1Lengths.length;
    const stdDev = Math.sqrt(variance);

    // 确定长度变异程度
    const cv = stdDev / avgLength; // 变异系数
    let lengthVariability: 'low' | 'medium' | 'high';
    if (cv < 0.1) {
      lengthVariability = 'low';
    } else if (cv < 0.25) {
      lengthVariability = 'medium';
    } else {
      lengthVariability = 'high';
    }

    // 推荐目标长度（使用四舍五入的平均值）
    const targetLength = Math.round(avgLength);

    const profile: CommandLengthProfile = {
      commandName,
      stage1Lengths,
      avgLength,
      minLength,
      maxLength,
      stdDev,
      targetLength,
      lengthVariability,
    };

    this.commandProfiles.set(commandName, profile);

    logger.log(`\n[长度分析] 指令: ${commandName}`);
    logger.log(`  采集数: ${stage1Lengths.length}`);
    logger.log(`  平均长度: ${avgLength.toFixed(0)} 样本`);
    logger.log(`  长度范围: ${minLength} - ${maxLength} 样本`);
    logger.log(`  标准差: ${stdDev.toFixed(0)} 样本 (变异系数: ${(cv * 100).toFixed(1)}%)`);
    logger.log(`  推荐目标长度: ${targetLength} 样本`);
    logger.log(`  长度变异程度: ${lengthVariability}`);

    return profile;
  }

  /**
   * 获取指令的推荐目标长度
   */
  getCommandTargetLength(commandName: string): number {
    const profile = this.commandProfiles.get(commandName);
    if (!profile) {
      logger.warn(`未找到指令 ${commandName} 的长度配置，使用默认值512`);
      return 512;
    }
    return profile.targetLength;
  }

  /**
   * 时间规范化 - 重采样方法
   * 将波形重采样到目标长度
   */
  static resampleWaveform(
    waveform: number[],
    targetLength: number
  ): { normalized: number[]; quality: number } {
    if (waveform.length === targetLength) {
      return { normalized: waveform, quality: 1.0 };
    }

    const normalized: number[] = [];
    const scaleFactor = (waveform.length - 1) / (targetLength - 1);

    for (let i = 0; i < targetLength; i++) {
      const srcIdx = i * scaleFactor;
      const srcIdxFloor = Math.floor(srcIdx);
      const srcIdxCeil = Math.ceil(srcIdx);
      const frac = srcIdx - srcIdxFloor;

      if (srcIdxFloor === srcIdxCeil) {
        normalized.push(waveform[srcIdxFloor]);
      } else {
        // 线性插值
        const v1 = waveform[srcIdxFloor];
        const v2 = waveform[srcIdxCeil];
        normalized.push(v1 * (1 - frac) + v2 * frac);
      }
    }

    // 质量评分：基于缩放因子
    // 如果缩放因子接近1，质量更高
    const scaleFactorDiff = Math.abs(scaleFactor - 1);
    const quality = Math.max(0.5, 1 - scaleFactorDiff * 0.5);

    return { normalized, quality };
  }



  /**
   * 时间规范化 - 插值方法
   * 使用三次样条插值进行平滑的重采样
   */
  static interpolateWaveform(
    waveform: number[],
    targetLength: number
  ): { normalized: number[]; quality: number } {
    if (waveform.length === targetLength) {
      return { normalized: waveform, quality: 1.0 };
    }

    const normalized: number[] = [];
    const scaleFactor = (waveform.length - 1) / (targetLength - 1);

    for (let i = 0; i < targetLength; i++) {
      const srcIdx = i * scaleFactor;
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;

      // 三次样条插值（简化版）
      let value: number;
      if (idx === 0) {
        value = waveform[0];
      } else if (idx >= waveform.length - 1) {
        value = waveform[waveform.length - 1];
      } else {
        // 使用Catmull-Rom样条
        const p0 = waveform[Math.max(0, idx - 1)];
        const p1 = waveform[idx];
        const p2 = waveform[Math.min(waveform.length - 1, idx + 1)];
        const p3 = waveform[Math.min(waveform.length - 1, idx + 2)];

        const a = (-p0 + 3 * p1 - 3 * p2 + p3) / 6;
        const b = (p0 - 2 * p1 + p2) / 2;
        const c = (-p0 + p2) / 2;
        const d = p1;

        value = a * frac ** 3 + b * frac ** 2 + c * frac + d;
      }

      normalized.push(value);
    }

    const scaleFactorDiff = Math.abs(scaleFactor - 1);
    const quality = Math.max(0.6, 1 - scaleFactorDiff * 0.3);

    return { normalized, quality };
  }

  /**
   * 规范化多通道波形
   */
  static normalizeMultiChannelWaveform(
    waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
    targetLength: number,
    method: 'resample' | 'interpolate' = 'interpolate'
  ): {
    normalized: { ch1: number[]; ch2: number[]; ch3: number[] };
    quality: number;
  } {
    let normalizer: (w: number[], t: number) => { normalized: number[]; quality: number };

    switch (method) {
      case 'interpolate':
        normalizer = (w, t) => this.interpolateWaveform(w, t);
        break;
      case 'resample':
      default:
        normalizer = (w, t) => this.resampleWaveform(w, t);
        break;
    }

    const result1 = normalizer(waveform.ch1, targetLength);
    const result2 = normalizer(waveform.ch2, targetLength);
    const result3 = normalizer(waveform.ch3, targetLength);

    const avgQuality = (result1.quality + result2.quality + result3.quality) / 3;

    return {
      normalized: {
        ch1: result1.normalized,
        ch2: result2.normalized,
        ch3: result3.normalized,
      },
      quality: avgQuality,
    };
  }

  /**
   * 生成长度分析报告
   */
  generateLengthAnalysisReport(): string {
    let report = `\n========== 指令长度分析报告 ==========\n`;

    this.commandProfiles.forEach((profile, commandName) => {
      report += `\n[${commandName}]\n`;
      report += `  采集数: ${profile.stage1Lengths.length}\n`;
      report += `  平均长度: ${profile.avgLength.toFixed(0)} 样本\n`;
      report += `  长度范围: ${profile.minLength} - ${profile.maxLength} 样本\n`;
      report += `  标准差: ${profile.stdDev.toFixed(0)} 样本\n`;
      report += `  推荐目标长度: ${profile.targetLength} 样本\n`;
      report += `  长度变异程度: ${profile.lengthVariability}\n`;
    });

    return report;
  }

  /**
   * 获取所有指令的长度配置
   */
  getAllCommandProfiles(): Map<string, CommandLengthProfile> {
    return this.commandProfiles;
  }
}

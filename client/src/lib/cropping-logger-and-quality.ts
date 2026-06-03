/**
 * 两阶段裁剪日志和波形质量评分系统
 * 
 * 功能：
 * - 记录两阶段裁剪的详细过程
 * - 评估波形质量
 * - 检测和标记异常波形
 * - 提供裁剪一致性验证
 */

import { logger } from './logger';

/**
 * 裁剪阶段的日志记录
 */
export interface CroppingLog {
  stage: 'stage1' | 'stage2';           // 裁剪阶段
  collectionIndex: number;               // 采集索引
  timestamp: number;                     // 时间戳
  
  // 输入信息
  inputLength: number;                   // 输入波形长度
  inputChannels: { ch1: number; ch2: number; ch3: number };
  
  // 输出信息
  outputLength: number;                  // 输出波形长度
  startIdx: number;                      // 起始索引
  endIdx: number;                        // 结束索引
  
  // 质量指标
  confidence: number;                    // 置信度
  snrWeights: { ch1: number; ch2: number; ch3: number };
  
  // 处理信息
  strategy: string;                      // 使用的策略
  peakCount?: number;                    // 峰值数量
  qualityReason?: string;                // 质量原因
  
  // 性能信息
  processingTime: number;                // 处理时间（毫秒）
}

/**
 * 波形质量评分结果
 */
export interface WaveformQualityScore {
  collectionIndex: number;
  overallScore: number;                  // 总体评分 (0-100)
  energyScore: number;                   // 能量评分 (0-100)
  consistencyScore: number;              // 一致性评分 (0-100)
  signalToNoiseScore: number;            // 信噪比评分 (0-100)
  isAnomalous: boolean;                  // 是否异常
  anomalyReasons: string[];              // 异常原因列表
  recommendations: string[];             // 建议
}

/**
 * 两阶段裁剪的统计信息
 */
export interface CroppingStatistics {
  totalCollections: number;              // 总采集数
  stage1Success: number;                 // 第一阶段成功数
  stage2Success: number;                 // 第二阶段成功数
  stage1FailureReasons: Map<string, number>;  // 第一阶段失败原因统计
  stage2FailureReasons: Map<string, number>;  // 第二阶段失败原因统计
  averageStage1Length: number;           // 第一阶段平均长度
  averageStage2Length: number;           // 第二阶段平均长度
  lengthVariance: number;                // 长度方差
  anomalousCount: number;                // 异常波形数
  anomalyRate: number;                   // 异常率
}

/**
 * 裁剪日志管理器
 */
export class CroppingLogManager {
  private logs: CroppingLog[] = [];
  private qualityScores: WaveformQualityScore[] = [];
  private stage1Logs: CroppingLog[] = [];
  private stage2Logs: CroppingLog[] = [];

  /**
   * 记录裁剪日志
   */
  recordLog(log: CroppingLog): void {
    this.logs.push(log);
    
    if (log.stage === 'stage1') {
      this.stage1Logs.push(log);
    } else {
      this.stage2Logs.push(log);
    }

    // 输出详细日志
    this.logDetails(log);
  }

  /**
   * 输出详细的裁剪日志
   */
  private logDetails(log: CroppingLog): void {
    const stage = log.stage === 'stage1' ? '第一阶段（空白区域裁剪）' : '第二阶段（统一长度裁剪）';
    const lengthChange = log.inputLength - log.outputLength;
    const lengthChangePercent = ((lengthChange / log.inputLength) * 100).toFixed(1);

    logger.log(
      `[${stage}] 采集 #${log.collectionIndex + 1}: ` +
      `${log.inputLength} → ${log.outputLength} 样本 ` +
      `(减少 ${lengthChange} 样本, ${lengthChangePercent}%) ` +
      `[${log.startIdx}, ${log.endIdx}]`
    );

    logger.debug(
      `  置信度: ${(log.confidence * 100).toFixed(1)}%, ` +
      `SNR权重: ch1=${log.snrWeights.ch1.toFixed(3)}, ` +
      `ch2=${log.snrWeights.ch2.toFixed(3)}, ` +
      `ch3=${log.snrWeights.ch3.toFixed(3)}, ` +
      `处理时间: ${log.processingTime.toFixed(1)}ms`
    );

    if (log.qualityReason) {
      logger.warn(`  质量警告: ${log.qualityReason}`);
    }

    if (log.peakCount !== undefined) {
      logger.debug(`  峰值数量: ${log.peakCount}`);
    }
  }

  /**
   * 记录波形质量评分
   */
  recordQualityScore(score: WaveformQualityScore): void {
    this.qualityScores.push(score);

    const statusIcon = score.isAnomalous ? '⚠️' : '✓';
    logger.log(
      `${statusIcon} [质量评分] 采集 #${score.collectionIndex + 1}: ` +
      `总体=${score.overallScore.toFixed(1)}/100, ` +
      `能量=${score.energyScore.toFixed(1)}, ` +
      `一致性=${score.consistencyScore.toFixed(1)}, ` +
      `信噪比=${score.signalToNoiseScore.toFixed(1)}`
    );

    if (score.isAnomalous) {
      logger.warn(`  异常原因: ${score.anomalyReasons.join(', ')}`);
      if (score.recommendations.length > 0) {
        logger.info(`  建议: ${score.recommendations.join(', ')}`);
      }
    }
  }

  /**
   * 获取所有日志
   */
  getAllLogs(): CroppingLog[] {
    return [...this.logs];
  }

  /**
   * 获取第一阶段日志
   */
  getStage1Logs(): CroppingLog[] {
    return [...this.stage1Logs];
  }

  /**
   * 获取第二阶段日志
   */
  getStage2Logs(): CroppingLog[] {
    return [...this.stage2Logs];
  }

  /**
   * 获取所有质量评分
   */
  getQualityScores(): WaveformQualityScore[] {
    return [...this.qualityScores];
  }

  /**
   * 获取异常波形
   */
  getAnomalousWaveforms(): WaveformQualityScore[] {
    return this.qualityScores.filter(score => score.isAnomalous);
  }

  /**
   * 计算裁剪统计信息
   */
  calculateStatistics(): CroppingStatistics {
    const stage1FailureReasons = new Map<string, number>();
    const stage2FailureReasons = new Map<string, number>();
    let stage1Success = 0;
    let stage2Success = 0;

    // 统计第一阶段
    for (const log of this.stage1Logs) {
      if (log.outputLength > 0) {
        stage1Success++;
      } else if (log.qualityReason) {
        const count = stage1FailureReasons.get(log.qualityReason) || 0;
        stage1FailureReasons.set(log.qualityReason, count + 1);
      }
    }

    // 统计第二阶段
    for (const log of this.stage2Logs) {
      if (log.outputLength > 0) {
        stage2Success++;
      } else if (log.qualityReason) {
        const count = stage2FailureReasons.get(log.qualityReason) || 0;
        stage2FailureReasons.set(log.qualityReason, count + 1);
      }
    }

    // 计算长度统计
    const stage2Lengths = this.stage2Logs
      .filter(log => log.outputLength > 0)
      .map(log => log.outputLength);

    const averageStage2Length = stage2Lengths.length > 0
      ? stage2Lengths.reduce((a, b) => a + b, 0) / stage2Lengths.length
      : 0;

    const lengthVariance = stage2Lengths.length > 0
      ? Math.sqrt(
          stage2Lengths.reduce((sum, len) => sum + Math.pow(len - averageStage2Length, 2), 0) /
          stage2Lengths.length
        )
      : 0;

    const anomalousCount = this.qualityScores.filter(s => s.isAnomalous).length;

    return {
      totalCollections: this.logs.length / 2, // 每个采集有两条日志
      stage1Success,
      stage2Success,
      stage1FailureReasons,
      stage2FailureReasons,
      averageStage1Length: 0, // 需要从日志中计算
      averageStage2Length,
      lengthVariance,
      anomalousCount,
      anomalyRate: (anomalousCount / this.qualityScores.length) * 100,
    };
  }

  /**
   * 打印统计摘要
   */
  printSummary(): void {
    const stats = this.calculateStatistics();

    logger.log('\n========== 两阶段裁剪统计摘要 ==========');
    logger.log(`总采集数: ${stats.totalCollections}`);
    logger.log(`第一阶段成功: ${stats.stage1Success}/${stats.totalCollections} (${((stats.stage1Success / stats.totalCollections) * 100).toFixed(1)}%)`);
    logger.log(`第二阶段成功: ${stats.stage2Success}/${stats.totalCollections} (${((stats.stage2Success / stats.totalCollections) * 100).toFixed(1)}%)`);
    logger.log(`第二阶段平均长度: ${stats.averageStage2Length.toFixed(0)} 样本`);
    logger.log(`长度标准差: ${stats.lengthVariance.toFixed(1)} 样本`);
    logger.log(`异常波形: ${stats.anomalousCount}/${this.qualityScores.length} (${stats.anomalyRate.toFixed(1)}%)`);

    if (stats.stage1FailureReasons.size > 0) {
      logger.warn('第一阶段失败原因:');
      stats.stage1FailureReasons.forEach((count, reason) => {
        logger.warn(`  - ${reason}: ${count} 次`);
      });
    }

    if (stats.stage2FailureReasons.size > 0) {
      logger.warn('第二阶段失败原因:');
      stats.stage2FailureReasons.forEach((count, reason) => {
        logger.warn(`  - ${reason}: ${count} 次`);
      });
    }

    logger.log('========================================\n');
  }

  /**
   * 清除所有日志
   */
  clear(): void {
    this.logs = [];
    this.qualityScores = [];
    this.stage1Logs = [];
    this.stage2Logs = [];
  }
}

/**
 * 波形质量评分器
 */
export class WaveformQualityScorer {
  /**
   * 计算波形能量评分
   */
  static calculateEnergyScore(
    ch1: number[],
    ch2: number[],
    ch3: number[]
  ): number {
    const calculateEnergy = (signal: number[]): number => {
      return Math.sqrt(signal.reduce((sum, x) => sum + x * x, 0) / signal.length);
    };

    const energy1 = calculateEnergy(ch1);
    const energy2 = calculateEnergy(ch2);
    const energy3 = calculateEnergy(ch3);

    const avgEnergy = (energy1 + energy2 + energy3) / 3;
    const minEnergy = Math.min(energy1, energy2, energy3);

    // 能量评分：基于平均能量和通道平衡性
    // 理想情况：能量充足且通道平衡
    const energyScore = Math.min(100, (avgEnergy / 0.1) * 100);
    const balanceScore = (minEnergy / Math.max(energy1, energy2, energy3)) * 100;

    return (energyScore + balanceScore) / 2;
  }

  /**
   * 计算波形一致性评分
   */
  static calculateConsistencyScore(
    waveform: number[],
    referenceWaveforms: number[][] = []
  ): number {
    if (referenceWaveforms.length === 0) {
      // 没有参考波形，基于自身的平滑性评分
      return this.calculateSmoothness(waveform);
    }

    // 计算与参考波形的相似度
    const similarities: number[] = [];
    for (const ref of referenceWaveforms) {
      const similarity = this.calculateSimilarity(waveform, ref);
      similarities.push(similarity);
    }

    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    return Math.min(100, avgSimilarity * 100);
  }

  /**
   * 计算信噪比评分
   */
  static calculateSignalToNoiseScore(
    ch1: number[],
    ch2: number[],
    ch3: number[]
  ): number {
    const calculateSNR = (signal: number[]): number => {
      // 简化的SNR计算：信号能量 / 噪声能量
      const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
      const variance = signal.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / signal.length;
      const signalPower = mean * mean;
      const noisePower = variance;

      return noisePower > 0 ? signalPower / noisePower : 0;
    };

    const snr1 = calculateSNR(ch1);
    const snr2 = calculateSNR(ch2);
    const snr3 = calculateSNR(ch3);

    const avgSNR = (snr1 + snr2 + snr3) / 3;
    // SNR评分：0-10的SNR对应0-100的评分
    return Math.min(100, (avgSNR / 10) * 100);
  }

  /**
   * 计算整体质量评分
   */
  static calculateOverallScore(
    energyScore: number,
    consistencyScore: number,
    signalToNoiseScore: number
  ): number {
    // 加权平均：能量40%，一致性35%，信噪比25%
    return (
      energyScore * 0.4 +
      consistencyScore * 0.35 +
      signalToNoiseScore * 0.25
    );
  }

  /**
   * 检测异常波形
   */
  static detectAnomalies(
    scores: WaveformQualityScore[],
    overallThreshold: number = 50,
    anomalyThreshold: number = 1.5
  ): WaveformQualityScore[] {
    if (scores.length < 2) {
      return [];
    }

    // 计算平均评分和标准差
    const avgScore = scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s.overallScore - avgScore, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // 标记异常波形
    const anomalies: WaveformQualityScore[] = [];
    for (const score of scores) {
      const reasons: string[] = [];
      const recommendations: string[] = [];

      // 只使用相对评分检测异常，不使用绝对阈值
      // 检查与平均值的偏差（3σ标准）
      if (stdDev > 0) {
        const deviation = Math.abs(score.overallScore - avgScore) / stdDev;
        
        if (deviation > anomalyThreshold) {
          reasons.push(`评分与平均值偏差过大 (${deviation.toFixed(1)}σ)`);
          recommendations.push('检查采集质量');
        }
      }

      // 检查能量评分
      if (score.energyScore < 30) {
        reasons.push('能量不足');
        recommendations.push('增加肌肉收缩强度');
      }

      // 检查一致性评分
      if (score.consistencyScore < 40) {
        reasons.push('波形不一致');
        recommendations.push('保持稳定的肌肉收缩');
      }

      // 检查信噪比
      if (score.signalToNoiseScore < 20) {
        reasons.push('信噪比过低');
        recommendations.push('检查电极接触和环境噪声');
      }

      if (reasons.length > 0) {
        score.isAnomalous = true;
        score.anomalyReasons = reasons;
        score.recommendations = recommendations;
        anomalies.push(score);
      }
    }

    return anomalies;
  }

  /**
   * 计算波形平滑性
   */
  private static calculateSmoothness(waveform: number[]): number {
    if (waveform.length < 2) return 100;

    // 计算相邻样本的差异
    let totalDiff = 0;
    for (let i = 1; i < waveform.length; i++) {
      totalDiff += Math.abs(waveform[i] - waveform[i - 1]);
    }

    const avgDiff = totalDiff / (waveform.length - 1);
    // 平滑性评分：差异越小，评分越高
    // 假设最大合理差异为0.5
    return Math.min(100, (1 - Math.min(1, avgDiff / 0.5)) * 100);
  }

  /**
   * 计算两个波形的相似度（使用余弦相似度）
   */
  private static calculateSimilarity(waveform1: number[], waveform2: number[]): number {
    const minLength = Math.min(waveform1.length, waveform2.length);
    if (minLength === 0) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < minLength; i++) {
      dotProduct += waveform1[i] * waveform2[i];
      norm1 += waveform1[i] * waveform1[i];
      norm2 += waveform2[i] * waveform2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator > 0 ? dotProduct / denominator : 0;
  }
}

// 创建全局裁剪日志管理器实例
export const croppingLogManager = new CroppingLogManager();

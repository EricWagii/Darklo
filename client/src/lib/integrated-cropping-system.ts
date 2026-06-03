/**
 * 集成的两阶段裁剪系统
 * 
 * 集成功能：
 * - 两阶段裁剪（空白区域 + 统一长度）
 * - 详细的裁剪日志记录
 * - 波形质量评分
 * - 异常波形检测和标记
 * - 采集和测试阶段的一致性验证
 */

import { logger } from './logger';
import {
  CroppingLogManager,
  CroppingLog,
  WaveformQualityScorer,
  WaveformQualityScore,
  croppingLogManager,
} from './cropping-logger-and-quality';
import {
  batchCropCollectionsMultiPeak,
  MultiPeakCroppingResult,
} from './multi-peak-detection';
import {
  batchSimpleCroppingCompat,
  SimpleCroppingResult,
} from './simple-front-rear-cropping';
import { normalizeWaveformLengthMultiChannel } from './waveform-normalizer';

/**
 * 集成裁剪结果
 */
export interface IntegratedCroppingResult {
  // 第一阶段结果
  stage1Result: MultiPeakCroppingResult;
  stage1Crops: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>;
  
  // 第二阶段结果
  stage2Result: {
    targetLength: number;
    success: boolean;
    reason?: string;
  };
  stage2Crops: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>;
  
  // 质量评分
  qualityScores: WaveformQualityScore[];
  
  // 异常波形
  anomalousIndices: number[];
  
  // 统计信息
  totalCollections: number;
  successfulCollections: number;
  successRate: number;
}

/**
 * 集成两阶段裁剪系统
 */
export class IntegratedCroppingSystem {
  private logManager: CroppingLogManager;
  private targetLength: number = 512; // 第二阶段目标长度

  constructor(targetLength: number = 512) {
    this.targetLength = targetLength;
    this.logManager = croppingLogManager;
  }

  /**
   * 执行完整的两阶段裁剪流程（采集模式）
   */
  async performCollectionCropping(
    collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
    onProgress?: (current: number, total: number) => void
  ): Promise<IntegratedCroppingResult> {
    logger.log(`\n========== 开始采集模式两阶段裁剪 ==========`);
    logger.log(`总采集数: ${collections.length}, 目标长度: ${this.targetLength}`);

    const result: IntegratedCroppingResult = {
      stage1Result: {
        startIdx: 0,
        endIdx: 0,
        confidence: 0,
        snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.33 },
        isQualityAcceptable: false,
        peaks: [],
        peakCount: 0,
        detectionStrategy: 'single',
      },
      stage1Crops: [],
      stage2Result: { targetLength: this.targetLength, success: false },
      stage2Crops: [],
      qualityScores: [],
      anomalousIndices: [],
      totalCollections: collections.length,
      successfulCollections: 0,
      successRate: 0,
    };

    // 第一阶段：裁剪空白区域
    logger.log(`\n[第一阶段] 裁剪空白区域...`);
    const stage1StartTime = performance.now();

    try {
      // 使用简单的前后空白裁剪替换多峰值裁剪
      const stage1Result = batchSimpleCroppingCompat(
        collections,
        onProgress,
        'auto'
      );
      result.stage1Result = stage1Result as any;

      // 记录第一阶段日志
      for (let i = 0; i < collections.length; i++) {
        const col = collections[i];
        const croppedWaveform = {
          ch1: col.ch1.slice(result.stage1Result.startIdx, result.stage1Result.endIdx),
          ch2: col.ch2.slice(result.stage1Result.startIdx, result.stage1Result.endIdx),
          ch3: col.ch3.slice(result.stage1Result.startIdx, result.stage1Result.endIdx),
        };

        const log: CroppingLog = {
          stage: 'stage1',
          collectionIndex: i,
          timestamp: Date.now(),
          inputLength: col.ch1.length,
          inputChannels: { ch1: col.ch1.length, ch2: col.ch2.length, ch3: col.ch3.length },
          outputLength: croppedWaveform.ch1.length,
          startIdx: result.stage1Result.startIdx,
          endIdx: result.stage1Result.endIdx,
          confidence: result.stage1Result.confidence,
          snrWeights: result.stage1Result.snrWeights,
          strategy: result.stage1Result.detectionStrategy,
          peakCount: result.stage1Result.peakCount,
          qualityReason: result.stage1Result.qualityReason,
          processingTime: performance.now() - stage1StartTime,
        };

        this.logManager.recordLog(log);
        result.stage1Crops.push(croppedWaveform);
      }

      logger.log(
        `第一阶段完成: [${result.stage1Result.startIdx}, ${result.stage1Result.endIdx}], ` +
        `置信度: ${(result.stage1Result.confidence * 100).toFixed(1)}%`
      );
    } catch (error) {
      logger.error(`第一阶段失败: ${error instanceof Error ? error.message : '未知错误'}`);
      throw error;
    }

    // 第二阶段：统一长度裁剪
    logger.log(`\n[第二阶段] 统一长度裁剪到 ${this.targetLength} 样本...`);
    const stage2StartTime = performance.now();

    try {
      result.stage2Crops = await this.performStage2Cropping(
        result.stage1Crops,
        this.targetLength
      );

      result.stage2Result.success = result.stage2Crops.length > 0;

      // 记录第二阶段日志
      for (let i = 0; i < result.stage2Crops.length; i++) {
        const stage1Crop = result.stage1Crops[i];
        const stage2Crop = result.stage2Crops[i];

        const log: CroppingLog = {
          stage: 'stage2',
          collectionIndex: i,
          timestamp: Date.now(),
          inputLength: stage1Crop.ch1.length,
          inputChannels: {
            ch1: stage1Crop.ch1.length,
            ch2: stage1Crop.ch2.length,
            ch3: stage1Crop.ch3.length,
          },
          outputLength: stage2Crop.ch1.length,
          startIdx: 0,
          endIdx: stage2Crop.ch1.length,
          confidence: stage2Crop.ch1.length === this.targetLength ? 1.0 : 0.8,
          snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.33 },
          strategy: 'fixed-length',
          processingTime: performance.now() - stage2StartTime,
        };

        this.logManager.recordLog(log);
      }

      logger.log(`第二阶段完成: ${result.stage2Crops.length}/${collections.length} 采集成功`);
    } catch (error) {
      logger.error(`第二阶段失败: ${error instanceof Error ? error.message : '未知错误'}`);
      throw error;
    }

    // 质量评分
    logger.log(`\n[质量评分] 评估波形质量...`);
    result.qualityScores = this.performQualityScoring(result.stage2Crops);

    // 检测异常波形
    const anomalies = WaveformQualityScorer.detectAnomalies(result.qualityScores);
    result.anomalousIndices = anomalies.map(a => a.collectionIndex);

    if (anomalies.length > 0) {
      logger.warn(`检测到 ${anomalies.length} 个异常波形`);
      for (const anomaly of anomalies) {
        logger.warn(
          `  采集 #${anomaly.collectionIndex + 1}: ${anomaly.anomalyReasons.join(', ')}`
        );
      }
    }

    // 计算成功率
    result.successfulCollections = result.stage2Crops.length;
    result.successRate = (result.successfulCollections / result.totalCollections) * 100;

    // 打印统计摘要
    this.logManager.printSummary();

    logger.log(`========== 采集模式裁剪完成 ==========\n`);

    return result;
  }

  /**
   * 执行完整的两阶段裁剪流程（测试模式）
   */
  async performTestCropping(
    testWaveform: { ch1: number[]; ch2: number[]; ch3: number[] },
    referenceCollections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
  ): Promise<IntegratedCroppingResult> {
    logger.log(`\n========== 开始测试模式两阶段裁剪 ==========`);

    const result: IntegratedCroppingResult = {
      stage1Result: {
        startIdx: 0,
        endIdx: 0,
        confidence: 0,
        snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.33 },
        isQualityAcceptable: false,
        peaks: [],
        peakCount: 0,
        detectionStrategy: 'single',
      },
      stage1Crops: [testWaveform],
      stage2Result: { targetLength: this.targetLength, success: false },
      stage2Crops: [],
      qualityScores: [],
      anomalousIndices: [],
      totalCollections: 1,
      successfulCollections: 0,
      successRate: 0,
    };

    // 第一阶段：使用参考集合的裁剪参数
    logger.log(`[第一阶段] 使用参考集合的裁剪参数...`);
    const stage1StartTime = performance.now();

    try {
      // 使用简单的前后空白裁剪替换多峰值裁剪
      const stage1Result = batchSimpleCroppingCompat(
        referenceCollections,
        undefined,
        'auto'
      );
      result.stage1Result = stage1Result as any;

      const croppedWaveform = {
        ch1: testWaveform.ch1.slice(result.stage1Result.startIdx, result.stage1Result.endIdx),
        ch2: testWaveform.ch2.slice(result.stage1Result.startIdx, result.stage1Result.endIdx),
        ch3: testWaveform.ch3.slice(result.stage1Result.startIdx, result.stage1Result.endIdx),
      };

      const log: CroppingLog = {
        stage: 'stage1',
        collectionIndex: 0,
        timestamp: Date.now(),
        inputLength: testWaveform.ch1.length,
        inputChannels: {
          ch1: testWaveform.ch1.length,
          ch2: testWaveform.ch2.length,
          ch3: testWaveform.ch3.length,
        },
        outputLength: croppedWaveform.ch1.length,
        startIdx: result.stage1Result.startIdx,
        endIdx: result.stage1Result.endIdx,
        confidence: result.stage1Result.confidence,
        snrWeights: result.stage1Result.snrWeights,
        strategy: result.stage1Result.detectionStrategy,
        peakCount: result.stage1Result.peakCount,
        qualityReason: result.stage1Result.qualityReason,
        processingTime: performance.now() - stage1StartTime,
      };

      this.logManager.recordLog(log);
      result.stage1Crops = [croppedWaveform];

      logger.log(
        `第一阶段完成: [${result.stage1Result.startIdx}, ${result.stage1Result.endIdx}]`
      );
    } catch (error) {
      logger.error(`第一阶段失败: ${error instanceof Error ? error.message : '未知错误'}`);
      throw error;
    }

    // 第二阶段：统一长度裁剪
    logger.log(`[第二阶段] 统一长度裁剪到 ${this.targetLength} 样本...`);
    const stage2StartTime = performance.now();

    try {
      result.stage2Crops = await this.performStage2Cropping(
        result.stage1Crops,
        this.targetLength
      );

      result.stage2Result.success = result.stage2Crops.length > 0;

      const log: CroppingLog = {
        stage: 'stage2',
        collectionIndex: 0,
        timestamp: Date.now(),
        inputLength: result.stage1Crops[0].ch1.length,
        inputChannels: {
          ch1: result.stage1Crops[0].ch1.length,
          ch2: result.stage1Crops[0].ch2.length,
          ch3: result.stage1Crops[0].ch3.length,
        },
        outputLength: result.stage2Crops[0].ch1.length,
        startIdx: 0,
        endIdx: result.stage2Crops[0].ch1.length,
        confidence: result.stage2Crops[0].ch1.length === this.targetLength ? 1.0 : 0.8,
        snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.33 },
        strategy: 'fixed-length',
        processingTime: performance.now() - stage2StartTime,
      };

      this.logManager.recordLog(log);
      logger.log(`第二阶段完成`);
    } catch (error) {
      logger.error(`第二阶段失败: ${error instanceof Error ? error.message : '未知错误'}`);
      throw error;
    }

    // 质量评分
    logger.log(`[质量评分] 评估波形质量...`);
    result.qualityScores = this.performQualityScoring(result.stage2Crops);

    result.successfulCollections = result.stage2Crops.length;
    result.successRate = 100;

    logger.log(`========== 测试模式裁剪完成 ==========\n`);

    return result;
  }

  /**
   * 执行第二阶段裁剪（统一长度）
   */
  private async performStage2Cropping(
    stage1Crops: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
    targetLength: number
  ): Promise<Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>> {
    const stage2Crops: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }> = [];

    for (const crop of stage1Crops) {
      try {
        const normalized = normalizeWaveformLengthMultiChannel(
          crop,
          targetLength
        );

        stage2Crops.push(normalized);
      } catch (error) {
        logger.warn(
          `第二阶段裁剪失败: ${error instanceof Error ? error.message : '未知错误'}`
        );
      }
    }

    return stage2Crops;
  }

  /**
   * 执行质量评分
   */
  private performQualityScoring(
    crops: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
  ): WaveformQualityScore[] {
    const scores: WaveformQualityScore[] = [];

    for (let i = 0; i < crops.length; i++) {
      const crop = crops[i];

      const energyScore = WaveformQualityScorer.calculateEnergyScore(
        crop.ch1,
        crop.ch2,
        crop.ch3
      );

      const consistencyScore = WaveformQualityScorer.calculateConsistencyScore(crop.ch1);

      const signalToNoiseScore = WaveformQualityScorer.calculateSignalToNoiseScore(
        crop.ch1,
        crop.ch2,
        crop.ch3
      );

      const overallScore = WaveformQualityScorer.calculateOverallScore(
        energyScore,
        consistencyScore,
        signalToNoiseScore
      );

      const score: WaveformQualityScore = {
        collectionIndex: i,
        overallScore,
        energyScore,
        consistencyScore,
        signalToNoiseScore,
        isAnomalous: false,
        anomalyReasons: [],
        recommendations: [],
      };

      this.logManager.recordQualityScore(score);
      scores.push(score);
    }

    return scores;
  }

  /**
   * 获取日志管理器
   */
  getLogManager(): CroppingLogManager {
    return this.logManager;
  }

  /**
   * 清除所有日志
   */
  clearLogs(): void {
    this.logManager.clear();
  }

  /**
   * 设置目标长度
   */
  setTargetLength(length: number): void {
    this.targetLength = length;
  }
}

// 创建全局集成系统实例
export const integratedCroppingSystem = new IntegratedCroppingSystem();

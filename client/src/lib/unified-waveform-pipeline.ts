/**
 * 统一的波形处理流程
 * 
 * 确保采集训练和默念测试使用相同的三步处理：
 * 1. 滤波降噪（使用静息基线）
 * 2. 裁剪空白（移除前后空白部分）
 * 3. 统一缩放（缩放到固定长度）
 */

import { comprehensiveFiltering, resampleSignal } from './adaptive-waveform-filtering';
import { detectActiveSegment, improvedScaling } from './improved-waveform-normalization';
import { adaptiveCropMultiChannel, analyzeCroppingQuality } from './adaptive-cropping-algorithm';
import {
  suppressStartupArtifactMultiChannel,
  type StartupArtifactMetadata,
} from './startup-artifact-suppression';

export interface WaveformPipelineConfig {
  /** 目标长度（样本数） */
  targetLength: number;
  /** 采样率（Hz） */
  samplingRate: number;
  /** 静息基线数据（用于滤波） */
  restingBaseline?: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  /** 高通滤波截止频率（Hz） */
  highPassCutoff?: number;
  /** 自适应滤波参数 */
  adaptiveFilterParams?: {
    windowSize?: number;
    mu?: number;
  };
}

export interface WaveformPipelineResult {
  /** 处理后的波形 */
  processed: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  /** 处理元数据 */
  metadata: {
    /** 原始长度 */
    originalLength: number;
    /** 滤波后长度 */
    filteredLength: number;
    /** 裁剪后长度 */
    croppedLength: number;
    /** 最终长度 */
    finalLength: number;
    /** 裁剪范围 */
    cropRange: { startIdx: number; endIdx: number };
    /** 缩放因子 */
    scaleFactor: number;
    /** 处理质量评分（0-100） */
    qualityScore: number;
    /** 启动瞬态检测和处理结果 */
    startupArtifact: StartupArtifactMetadata;
    /** 处理步骤日志 */
    steps: string[];
  };
}

/**
 * 统一的波形处理流程
 * 
 * 步骤1：滤波降噪 - 使用静息基线进行自适应滤波
 * 步骤2：裁剪空白 - 移除有效波形前后的空白部分
 * 步骤3：统一缩放 - 缩放到固定长度
 */
export function processWaveformUnified(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  config: WaveformPipelineConfig
): WaveformPipelineResult {
  const steps: string[] = [];
  const originalLength = waveform.ch1.length;

  try {
    // ========== 步骤1：滤波降噪 ==========
    steps.push('开始滤波降噪');

    let filtered = waveform;
    let filteredLength = originalLength;

    if (config.restingBaseline) {
      // 使用静息基线进行三通道并行滤波
      filtered = comprehensiveFiltering(
        waveform.ch1,
        waveform.ch2,
        waveform.ch3,
        config.restingBaseline,
        config.samplingRate || 500
      );
      filteredLength = filtered.ch1.length;
      steps.push(`滤波完成: ${originalLength} → ${filteredLength} 样本`);
    } else {
      // 不提供静息基线时，仅执行基本滤波
      filtered = comprehensiveFiltering(
        waveform.ch1,
        waveform.ch2,
        waveform.ch3,
        undefined,
        config.samplingRate || 500
      );
      filteredLength = filtered.ch1.length;
      steps.push('滤波完成（仅基本滤波）');
    }

    // 启动伪迹必须在裁剪前处理，避免其主导有效区间和后续缩放。
    const startupArtifactResult = suppressStartupArtifactMultiChannel(
      filtered,
      config.samplingRate || 500
    );
    filtered = startupArtifactResult.cleaned;
    const startupArtifact = startupArtifactResult.metadata;
    steps.push(`启动伪迹检查: ${startupArtifact.reason}`);

    // ========== 步骤2：裁剪空白 ==========
    steps.push('开始自适应裁剪空白部分');

    // 使用自适应裁剪算法
    const adaptiveCropResult = adaptiveCropMultiChannel(
      filtered.ch1,
      filtered.ch2,
      filtered.ch3,
      {
        windowSize: 50,
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minSegmentLength: 100,
        preserveMargin: 20,
      }
    );

    // 分析裁剪质量
    const cropQuality = analyzeCroppingQuality(
      filteredLength,
      adaptiveCropResult.croppedCh1.length,
      adaptiveCropResult.confidence
    );

    const croppedLength = adaptiveCropResult.croppedCh1.length;
    steps.push(
      `自适应裁剪完成: 范围 [${adaptiveCropResult.startIdx}, ${adaptiveCropResult.endIdx}], 长度 ${croppedLength} 样本`
    );
    steps.push(`裁剪质量: ${cropQuality.quality} (${cropQuality.score.toFixed(1)}/100) - ${cropQuality.details}`);

    // 应用裁剪
    const cropped = {
      ch1: adaptiveCropResult.croppedCh1,
      ch2: adaptiveCropResult.croppedCh2,
      ch3: adaptiveCropResult.croppedCh3,
    };

    // 为了兼容后续代码，创建cropResult对象
    const cropResult = {
      start: adaptiveCropResult.startIdx,
      end: adaptiveCropResult.endIdx,
      confidence: adaptiveCropResult.confidence,
    };

    // ========== 步骤3：统一缩放 ==========
    steps.push('开始缩放到统一长度');

    // improvedScaling处理单个通道，需要分别处理三个通道
    const scaledCh1 = improvedScaling(cropped.ch1, undefined, {
      targetAmplitude: 2000,
      preserveRange: true,
    });
    const scaledCh2 = improvedScaling(cropped.ch2, undefined, {
      targetAmplitude: 2000,
      preserveRange: true,
    });
    const scaledCh3 = improvedScaling(cropped.ch3, undefined, {
      targetAmplitude: 2000,
      preserveRange: true,
    });

    // 重采样到目标长度
    const resampledCh1 = resampleSignal(scaledCh1.scaled, config.targetLength);
    const resampledCh2 = resampleSignal(scaledCh2.scaled, config.targetLength);
    const resampledCh3 = resampleSignal(scaledCh3.scaled, config.targetLength);

    const scaleResult = {
      scaled: { ch1: resampledCh1, ch2: resampledCh2, ch3: resampledCh3 },
      scaleFactor: (scaledCh1.scaleFactor + scaledCh2.scaleFactor + scaledCh3.scaleFactor) / 3,
    };

    const finalLength = scaleResult.scaled.ch1.length;
    steps.push(
      `缩放完成: ${croppedLength} → ${finalLength} 样本, 缩放因子: ${scaleResult.scaleFactor.toFixed(3)}`
    );

    // ========== 计算质量评分 ==========
    const qualityScore = calculatePipelineQualityScore({
      originalLength,
      filteredLength,
      croppedLength,
      finalLength,
      cropConfidence: adaptiveCropResult.confidence,
      scalePreservation: scaleResult.scaleFactor,
      cropQualityScore: cropQuality.score,
      startupArtifact,
    });

    steps.push(`处理完成，质量评分: ${qualityScore.toFixed(1)}/100`);

    return {
      processed: scaleResult.scaled,
      metadata: {
        originalLength,
        filteredLength,
        croppedLength,
        finalLength,
        cropRange: { startIdx: cropResult.start, endIdx: cropResult.end },
        scaleFactor: scaleResult.scaleFactor,
        qualityScore,
        startupArtifact,
        steps,
      },
    };
  } catch (error) {
    steps.push(`错误: ${error instanceof Error ? error.message : '未知错误'}`);
    console.error('[波形处理流程] 处理失败:', error);

    // 返回原始波形作为降级方案
    return {
      processed: waveform,
      metadata: {
        originalLength,
        filteredLength: originalLength,
        croppedLength: originalLength,
        finalLength: originalLength,
        cropRange: { startIdx: 0, endIdx: originalLength - 1 },
        scaleFactor: 1.0,
        qualityScore: 0,
        startupArtifact: {
          detected: false,
          ambiguous: true,
          suppressedSamples: 0,
          artifactRatio: 0,
          stabilizationIndex: null,
          reason: '处理流程异常，无法判断启动伪迹',
        },
        steps,
      },
    };
  }
}

/**
 * 计算波形处理流程的质量评分
 */
function calculatePipelineQualityScore(params: {
  originalLength: number;
  filteredLength: number;
  croppedLength: number;
  finalLength: number;
  cropConfidence: number;
  scalePreservation: number;
  cropQualityScore?: number;
  startupArtifact: StartupArtifactMetadata;
}): number {
  let score = 100;

  // 滤波损失评分（允许10%的损失）
  const filterLoss = 1 - params.filteredLength / params.originalLength;
  if (filterLoss > 0.1) {
    score -= Math.min(20, filterLoss * 100);
  }

  // 裁剪评分（基于裁剪后的长度和置信度）
  const cropRatio = params.croppedLength / params.filteredLength;
  if (cropRatio < 0.3 || cropRatio > 0.9) {
    score -= 15; // 裁剪过度或过少
  }
  score -= (1 - params.cropConfidence) * 10; // 置信度惩罚

  // 缩放评分（基于缩放因子）
  const scaleDeviation = Math.abs(params.scalePreservation - 1.0);
  if (scaleDeviation > 0.5) {
    score -= Math.min(15, scaleDeviation * 20);
  }

  // 最终长度检查
  if (params.finalLength !== 512 && params.finalLength !== 600) {
    // 假设目标长度是512或600
    score -= 5;
  }

  if (params.startupArtifact.ambiguous) {
    score = Math.min(score, 30);
  } else if (params.startupArtifact.detected) {
    score -= Math.min(15, Math.max(4, (params.startupArtifact.artifactRatio - 2.8) * 2));
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 获取处理流程的摘要
 */
export function getPipelineSummary(result: WaveformPipelineResult): string {
  const { metadata } = result;
  return (
    `原始: ${metadata.originalLength} → ` +
    `滤波: ${metadata.filteredLength} → ` +
    `裁剪: ${metadata.croppedLength} → ` +
    `缩放: ${metadata.finalLength} ` +
    `(质量: ${metadata.qualityScore.toFixed(0)}/100)`
  );
}

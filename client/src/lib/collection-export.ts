/**
 * 采集数据完整导出工具
 * 使用统一的空白裁剪 + 缩放流程
 */

import { processWaveform, ProcessedWaveform } from './independent-cropping';

// Command类型定义
export interface Command {
  name: string;
  collections?: any[];
  waveform?: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  ch1?: number[];
  ch2?: number[];
  ch3?: number[];
  timestamp?: string;
}

/**
 * 导出的采集数据格式
 */
export interface CollectionExportData {
  exportTime: string;
  exportVersion: string;
  metadata: {
    commandName: string;
    collectionIndex: number;
    collectionTimestamp: string;
    samplingRate: number;
    totalSamples: number;
  };
  rawWaveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    duration: number;
    samplingRate: number;
    totalSamples: number;
  };
  processing: {
    algorithm: string;
    description: string;
    parameters: {
      croppingMethod: string;
      normalizationMethod: string;
      targetLength: number;
      windowSize: number;
    };
    croppingResult: {
      stage: string;
      method: string;
      confidence: number;
      startIdx: number;
      endIdx: number;
      croppedLength: number;
      reason: string;
    };
    normalizationResult: {
      originalLength: number;
      targetLength: number;
      timestamp: number;
    };
  };
  processedWaveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    length: number;
  };
  qualityScore: {
    isAcceptable: boolean;
    score: number;
    factors: {
      croppingConfidence: number;
      normalizationQuality: number;
    };
    issues: string[];
    recommendations: string[];
  };
  // ✅ 修复问题5：添加 timingStats 属性
  timingStats: {
    rawDurationMs: number;
    afterFirstCroppingMs: number;
    afterSecondCroppingMs: number;
  };
  recognitionResult?: {
    predictedCommand: string;
    confidence: number;
    isCorrect: boolean;
    processingTimeMs: number;
    modelVersion: string;
  };
}

/**
 * 生成完整的导出数据
 */
export function generateCollectionExportData(
  command: Command,
  collectionIndex: number,
  recognitionResult?: { predictedCommand: string; confidence: number; isCorrect: boolean; processingTimeMs: number; modelVersion?: string }
): CollectionExportData {
  // 获取采集数据
  let collection: any = null;
  if (command.collections && Array.isArray(command.collections)) {
    collection = command.collections[collectionIndex];
  } else if (command.waveform) {
    collection = command;
  }

  if (!collection) {
    throw new Error('无法找到采集数据');
  }

  // 获取波形数据
  const waveform = {
    ch1: collection.waveform?.ch1 || collection.ch1 || [],
    ch2: collection.waveform?.ch2 || collection.ch2 || [],
    ch3: collection.waveform?.ch3 || collection.ch3 || [],
  };

  if (!waveform.ch1 || waveform.ch1.length === 0) {
    throw new Error('波形数据为空');
  }

  // 使用统一的处理流程：空白裁剪 + 缩放
  const processedData = processWaveform(waveform.ch1, waveform.ch2, waveform.ch3, 512, 20);

  // 时长统计
  const samplingRate = 500; // Hz
  const rawDurationMs = (waveform.ch1.length / samplingRate) * 1000;
  const croppingMeta = processedData.meta.croppingMeta;
  const normalizationMeta = processedData.meta.normalizationMeta;

  // 质量评分
  const croppingConfidence = croppingMeta.confidence;
  const normalizationQuality = normalizationMeta.targetLength > 0 ? 1.0 : 0.5;
  const qualityScore = Math.round((croppingConfidence + normalizationQuality) / 2 * 100);

  const issues: string[] = [];
  const recommendations: string[] = [];

  if (croppingMeta.stage === 'final-fallback') {
    issues.push('使用了最终降级裁剪（全段返回）');
    recommendations.push('建议检查信号质量或调整电极位置');
  } else if (croppingMeta.stage === 'fallback') {
    issues.push('使用了降级裁剪方法');
    recommendations.push('信号质量一般，建议重新采集');
  }

  if (croppingConfidence < 0.6) {
    issues.push(`裁剪置信度较低 (${(croppingConfidence * 100).toFixed(0)}%)`);
    recommendations.push('建议重新采集以获得更高质量的数据');
  }

  if (rawDurationMs > 2000) {
    issues.push(`原始时长过长 (${rawDurationMs.toFixed(0)}ms)`);
    recommendations.push('建议缩短指令发音时间');
  }

  return {
    exportTime: new Date().toISOString(),
    exportVersion: '3.0',
    metadata: {
      commandName: command.name,
      collectionIndex,
      collectionTimestamp: collection.timestamp || new Date().toISOString(),
      samplingRate,
      totalSamples: waveform.ch1.length,
    },
    rawWaveform: {
      ch1: waveform.ch1,
      ch2: waveform.ch2,
      ch3: waveform.ch3,
      duration: rawDurationMs,
      samplingRate,
      totalSamples: waveform.ch1.length,
    },
    processing: {
      algorithm: '空白裁剪 + 线性插值缩放',
      description: '使用双端静息估计或Otsu二值化进行空白裁剪，然后缩放到统一长度',
      parameters: {
        croppingMethod: '独立裁剪（Resting-Baseline + Otsu）',
        normalizationMethod: '线性插值',
        targetLength: 512,
        windowSize: 20,
      },
      croppingResult: {
        stage: croppingMeta.stage,
        method: croppingMeta.method,
        confidence: croppingMeta.confidence,
        startIdx: croppingMeta.startIdx,
        endIdx: croppingMeta.endIdx,
        croppedLength: croppingMeta.endIdx - croppingMeta.startIdx,
        reason: croppingMeta.reason,
      },
      normalizationResult: {
        originalLength: normalizationMeta.originalLength,
        targetLength: normalizationMeta.targetLength,
        timestamp: normalizationMeta.timestamp,
      },
    },
    processedWaveform: {
      ch1: processedData.ch1,
      ch2: processedData.ch2,
      ch3: processedData.ch3,
      length: processedData.ch1.length,
    },
    qualityScore: {
      isAcceptable: qualityScore >= 60,
      score: qualityScore,
      factors: {
        croppingConfidence,
        normalizationQuality,
      },
      issues,
      recommendations,
    },
    // ✅ 修复问题5：添加 timingStats 到返回值
    timingStats: {
      rawDurationMs,
      afterFirstCroppingMs: ((croppingMeta.endIdx - croppingMeta.startIdx) / 500) * 1000,
      afterSecondCroppingMs: (processedData.ch1.length / 500) * 1000,
    },
    ...(recognitionResult && { recognitionResult: { ...recognitionResult, modelVersion: recognitionResult.modelVersion || 'unknown' } }),
  };
}

/**
 * 将导出数据转换为CSV格式
 */
export function exportToCSV(data: CollectionExportData): string {
  const lines: string[] = [];

  // 头部信息
  lines.push('采集数据导出报告');
  lines.push(`导出时间,${data.exportTime}`);
  lines.push(`指令名称,${data.metadata.commandName}`);
  lines.push(`采集索引,${data.metadata.collectionIndex}`);
  lines.push('');

  // 处理参数
  lines.push('处理参数');
  lines.push(`算法,${data.processing.algorithm}`);
  lines.push(`裁剪方法,${data.processing.parameters.croppingMethod}`);
  lines.push(`目标长度,${data.processing.parameters.targetLength}`);
  lines.push('');

  // 裁剪结果
  lines.push('裁剪结果');
  lines.push(`阶段,${data.processing.croppingResult.stage}`);
  lines.push(`方法,${data.processing.croppingResult.method}`);
  lines.push(`置信度,${(data.processing.croppingResult.confidence * 100).toFixed(1)}%`);
  lines.push(`原始长度,${data.processing.croppingResult.startIdx}-${data.processing.croppingResult.endIdx}`);
  lines.push(`裁剪后长度,${data.processing.croppingResult.croppedLength}`);
  lines.push('');

  // 质量评分
  lines.push('质量评分');
  lines.push(`总分,${data.qualityScore.score}`);
  lines.push(`是否可接受,${data.qualityScore.isAcceptable ? '是' : '否'}`);
  lines.push('');

  // 问题和建议
  if (data.qualityScore.issues.length > 0) {
    lines.push('问题');
    data.qualityScore.issues.forEach(issue => lines.push(issue));
    lines.push('');
  }

  if (data.qualityScore.recommendations.length > 0) {
    lines.push('建议');
    data.qualityScore.recommendations.forEach(rec => lines.push(rec));
    lines.push('');
  }

  // 识别结果
  if (data.recognitionResult) {
    lines.push('识别结果');
    lines.push(`预测指令,${data.recognitionResult.predictedCommand}`);
    lines.push(`置信度,${(data.recognitionResult.confidence * 100).toFixed(1)}%`);
    lines.push(`是否正确,${data.recognitionResult.isCorrect ? '是' : '否'}`);
  }

  return lines.join('\n');
}

/**
 * 将导出数据转换为JSON格式
 */
export function exportToJSON(data: CollectionExportData): string {
  return JSON.stringify(data, null, 2);
}

/**
 * 导出别名 - 保持向后兼容
 */
export const exportCollectionToJSON = exportToJSON;
export const exportCollectionToCSV = exportToCSV;

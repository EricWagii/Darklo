/**
 * 数据导出工具函数
 * 用于导出DEBUG页面的完整诊断数据
 */

import { DebugData } from '@/pages/DebugPage';

/**
 * 导出数据的完整格式
 */
export interface ExportedDebugData {
  exportTime: string;
  exportVersion: string;
  metadata: {
    commandName: string;
    collectionIndex: number;
    timestamp: string;
  };
  rawWaveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    duration: number;
    samplingRate: number;
    totalSamples: number;
  };
  energyAnalysis: {
    energyValues: number[];
    threshold: number;
    validSegmentStart: number;
    validSegmentEnd: number;
    validSegmentLength: number;
    confidence: number;
    peakCount: number;
  };
  croppingParams: {
    startIdx: number;
    endIdx: number;
    croppingLength: number;
    croppingDurationMs: number;
    strategy: string;
    peakCount: number;
    mergedPeaks: Array<{
      start: number;
      end: number;
      energy: number;
    }>;
  };
  timingStats: {
    rawDurationMs: number;
    croppedDurationMs: number;
    normalizedDurationMs: number;
    samplingRate: number;
    timingAnalysis: {
      rawToNormalizedRatio: number;
      croppedToNormalizedRatio: number;
      needsAdjustment: boolean;
      recommendation: string;
    };
  };
  qualityScore: {
    isAcceptable: boolean;
    score: number;
    scorePercentage: string;
    reason: string;
    factors: {
      lengthScore: number;
      confidenceScore: number;
      peakScore: number;
      overallScore: number;
    };
  };
  analysis: {
    signalQuality: string;
    issues: string[];
    recommendations: string[];
    summary: string;
  };
}

/**
 * 生成完整的导出数据
 */
export function generateExportData(debugData: DebugData): ExportedDebugData {
  const croppingLength = debugData.croppingParams.endIdx - debugData.croppingParams.startIdx;
  const croppingDurationMs = (croppingLength / 500) * 1000;
  const validSegmentLength =
    debugData.energyAnalysis.validSegmentEnd - debugData.energyAnalysis.validSegmentStart;

  // 计算时长比例
  const rawToNormalizedRatio = debugData.timingStats.rawDurationMs / debugData.timingStats.normalizedDurationMs;
  const croppedToNormalizedRatio = debugData.timingStats.croppedDurationMs / debugData.timingStats.normalizedDurationMs;

  // 判断是否需要调整
  const needsAdjustment = debugData.timingStats.rawDurationMs > 1024;
  const recommendation = needsAdjustment
    ? `原始发音时长 ${debugData.timingStats.rawDurationMs.toFixed(0)}ms 超过固定长度 1024ms，建议增加 FIXED_WAVEFORM_LENGTH 参数`
    : `原始发音时长 ${debugData.timingStats.rawDurationMs.toFixed(0)}ms 在正常范围内`;

  // 分析信号质量
  const signalQuality = analyzeSignalQuality(debugData);
  const issues = detectIssues(debugData);
  const recommendations = generateRecommendations(debugData, issues);

  // 计算质量评分的各个因素
  const lengthScore = calculateLengthScore(croppingLength);
  const confidenceScore = debugData.energyAnalysis.confidence * 100;
  const peakScore = debugData.energyAnalysis.peakCount > 0 ? 100 : 0;
  const overallScore = (lengthScore + confidenceScore + peakScore) / 3;

  return {
    exportTime: new Date().toISOString(),
    exportVersion: '1.0',
    metadata: {
      commandName: debugData.commandName,
      collectionIndex: debugData.collectionIndex,
      timestamp: new Date().toISOString(),
    },
    rawWaveform: {
      ch1: debugData.rawWaveform.ch1,
      ch2: debugData.rawWaveform.ch2,
      ch3: debugData.rawWaveform.ch3,
      duration: debugData.rawWaveform.duration,
      samplingRate: 500,
      totalSamples: debugData.rawWaveform.ch1.length,
    },
    energyAnalysis: {
      energyValues: debugData.energyAnalysis.energyValues,
      threshold: debugData.energyAnalysis.threshold,
      validSegmentStart: debugData.energyAnalysis.validSegmentStart,
      validSegmentEnd: debugData.energyAnalysis.validSegmentEnd,
      validSegmentLength,
      confidence: debugData.energyAnalysis.confidence,
      peakCount: debugData.energyAnalysis.peakCount,
    },
    croppingParams: {
      startIdx: debugData.croppingParams.startIdx,
      endIdx: debugData.croppingParams.endIdx,
      croppingLength,
      croppingDurationMs,
      strategy: debugData.croppingParams.strategy,
      peakCount: debugData.croppingParams.peakCount,
      mergedPeaks: debugData.croppingParams.mergedPeaks,
    },
    timingStats: {
      rawDurationMs: debugData.timingStats.rawDurationMs,
      croppedDurationMs: debugData.timingStats.croppedDurationMs,
      normalizedDurationMs: debugData.timingStats.normalizedDurationMs,
      samplingRate: debugData.timingStats.samplingRate,
      timingAnalysis: {
        rawToNormalizedRatio,
        croppedToNormalizedRatio,
        needsAdjustment,
        recommendation,
      },
    },
    qualityScore: {
      isAcceptable: debugData.qualityScore.isAcceptable,
      score: debugData.qualityScore.score,
      scorePercentage: `${debugData.qualityScore.score}%`,
      reason: debugData.qualityScore.reason,
      factors: {
        lengthScore,
        confidenceScore,
        peakScore,
        overallScore,
      },
    },
    analysis: {
      signalQuality,
      issues,
      recommendations,
      summary: generateSummary(debugData, signalQuality, issues),
    },
  };
}

/**
 * 分析信号质量
 */
function analyzeSignalQuality(debugData: DebugData): string {
  const score = debugData.qualityScore.score;

  if (score >= 80) {
    return '优秀 - 信号清晰，适合识别';
  } else if (score >= 60) {
    return '良好 - 信号可用，但有一定噪声';
  } else if (score >= 40) {
    return '一般 - 信号较弱，识别准确率可能受影响';
  } else {
    return '不佳 - 信号质量很差，不建议用于识别';
  }
}

/**
 * 检测问题
 */
function detectIssues(debugData: DebugData): string[] {
  const issues: string[] = [];

  // 检查时长问题
  if (debugData.timingStats.rawDurationMs > 1024) {
    issues.push(`⚠️ 原始发音时长 ${debugData.timingStats.rawDurationMs.toFixed(0)}ms 超过固定长度 1024ms`);
  }

  // 检查能量问题
  if (debugData.energyAnalysis.peakCount === 0) {
    issues.push('❌ 未检测到有效的能量峰值，信号可能过弱或全是噪声');
  }

  // 检查置信度问题
  if (debugData.energyAnalysis.confidence < 0.3) {
    issues.push(`⚠️ 有效段置信度很低 (${(debugData.energyAnalysis.confidence * 100).toFixed(0)}%)，可能存在大量噪声`);
  }

  // 检查裁切长度问题
  const croppingLength = debugData.croppingParams.endIdx - debugData.croppingParams.startIdx;
  if (croppingLength < 100) {
    issues.push(`⚠️ 裁切长度过短 (${croppingLength} 样本)，信息量不足`);
  }

  // 检查质量评分
  if (debugData.qualityScore.score < 40) {
    issues.push(`❌ 质量评分很低 (${debugData.qualityScore.score}%)，${debugData.qualityScore.reason}`);
  }

  // 检查多峰值问题
  if (debugData.croppingParams.strategy === 'multi-peak' && debugData.croppingParams.peakCount > 3) {
    issues.push(`⚠️ 检测到 ${debugData.croppingParams.peakCount} 个峰值，可能是多音节或带停顿的指令`);
  }

  return issues.length > 0 ? issues : ['✅ 未检测到明显问题'];
}

/**
 * 生成建议
 */
function generateRecommendations(debugData: DebugData, issues: string[]): string[] {
  const recommendations: string[] = [];

  // 基于时长的建议
  if (debugData.timingStats.rawDurationMs > 1024) {
    recommendations.push('📝 建议增加 FIXED_WAVEFORM_LENGTH 参数（当前 512 样本 = 1.024 秒）');
  }

  // 基于能量的建议
  if (debugData.energyAnalysis.peakCount === 0) {
    recommendations.push('🎤 建议检查电极接触，重新采集数据');
  }

  // 基于置信度的建议
  if (debugData.energyAnalysis.confidence < 0.5) {
    recommendations.push('🔧 建议调整能量阈值或采集环境（减少背景噪声）');
  }

  // 基于质量评分的建议
  if (debugData.qualityScore.score < 60) {
    recommendations.push('📊 建议在采集前进行系统校准');
  }

  // 基于多峰值的建议
  if (debugData.croppingParams.strategy === 'multi-peak') {
    recommendations.push('🎯 这是多峰值信号，建议在识别时使用多峰值匹配算法');
  }

  // 基于裁切长度的建议
  const croppingLength = debugData.croppingParams.endIdx - debugData.croppingParams.startIdx;
  if (croppingLength < 200) {
    recommendations.push('⏱️ 信号较短，建议确保采集时有清晰的发音');
  }

  return recommendations.length > 0 ? recommendations : ['✅ 数据质量良好，可以进行识别测试'];
}

/**
 * 计算长度评分
 */
function calculateLengthScore(length: number): number {
  if (length < 100) return 30;
  if (length < 200) return 60;
  if (length < 400) return 90;
  if (length < 600) return 100;
  return 80; // 过长会降分
}

/**
 * 生成摘要
 */
function generateSummary(debugData: DebugData, quality: string, issues: string[]): string {
  const lines: string[] = [];

  lines.push(`指令: ${debugData.commandName}`);
  lines.push(`采集序号: ${debugData.collectionIndex + 1}`);
  lines.push(`信号质量: ${quality}`);
  lines.push(`质量评分: ${debugData.qualityScore.score}%`);
  lines.push(`原始时长: ${debugData.timingStats.rawDurationMs.toFixed(0)}ms`);
  lines.push(`裁切时长: ${debugData.timingStats.croppedDurationMs.toFixed(0)}ms`);
  lines.push(`峰值数: ${debugData.energyAnalysis.peakCount}`);
  lines.push(`置信度: ${(debugData.energyAnalysis.confidence * 100).toFixed(0)}%`);

  if (issues.length > 0 && issues[0] !== '✅ 未检测到明显问题') {
    lines.push(`\n检测到的问题:`);
    issues.forEach((issue) => lines.push(`  ${issue}`));
  }

  return lines.join('\n');
}

/**
 * 导出为JSON文件
 */
export function exportToJSON(debugData: DebugData, filename?: string): void {
  const exportedData = generateExportData(debugData);
  const jsonString = JSON.stringify(exportedData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `debug-export-${debugData.commandName}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 导出为CSV文件（用于表格分析）
 */
export function exportToCSV(debugData: DebugData, filename?: string): void {
  const exportedData = generateExportData(debugData);

  const rows: string[] = [];

  // 基本信息
  rows.push('基本信息');
  rows.push(`指令,${exportedData.metadata.commandName}`);
  rows.push(`采集序号,${exportedData.metadata.collectionIndex}`);
  rows.push(`导出时间,${exportedData.exportTime}`);
  rows.push('');

  // 时长统计
  rows.push('时长统计 (毫秒)');
  rows.push(`原始时长,${exportedData.timingStats.rawDurationMs}`);
  rows.push(`裁切时长,${exportedData.timingStats.croppedDurationMs}`);
  rows.push(`归一化时长,${exportedData.timingStats.normalizedDurationMs}`);
  rows.push(`原始/归一化比例,${exportedData.timingStats.timingAnalysis.rawToNormalizedRatio.toFixed(2)}`);
  rows.push('');

  // 能量分析
  rows.push('能量分析');
  rows.push(`阈值,${exportedData.energyAnalysis.threshold.toFixed(2)}`);
  rows.push(`置信度,${(exportedData.energyAnalysis.confidence * 100).toFixed(0)}%`);
  rows.push(`峰值数,${exportedData.energyAnalysis.peakCount}`);
  rows.push(`有效段长度,${exportedData.energyAnalysis.validSegmentLength}`);
  rows.push('');

  // 裁切参数
  rows.push('裁切参数');
  rows.push(`起点,${exportedData.croppingParams.startIdx}`);
  rows.push(`终点,${exportedData.croppingParams.endIdx}`);
  rows.push(`长度,${exportedData.croppingParams.croppingLength}`);
  rows.push(`策略,${exportedData.croppingParams.strategy}`);
  rows.push('');

  // 质量评分
  rows.push('质量评分');
  rows.push(`评分,${exportedData.qualityScore.score}%`);
  rows.push(`是否可接受,${exportedData.qualityScore.isAcceptable ? '是' : '否'}`);
  rows.push(`原因,${exportedData.qualityScore.reason}`);
  rows.push('');

  // 分析结果
  rows.push('分析结果');
  rows.push(`信号质量,${exportedData.analysis.signalQuality}`);
  rows.push('问题列表');
  exportedData.analysis.issues.forEach((issue) => {
    rows.push(`,${issue}`);
  });
  rows.push('');
  rows.push('建议列表');
  exportedData.analysis.recommendations.forEach((rec) => {
    rows.push(`,${rec}`);
  });

  const csvString = rows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `debug-export-${debugData.commandName}-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 处理状态可视化 - 显示采集的处理状态和质量评分
 * 
 * 功能：
 * 1. 状态分类 - 正常/异常/降级
 * 2. 质量评分 - 基于裁剪置信度和异常检测结果
 * 3. 视觉反馈 - 颜色、图标、文本描述
 */

import { ProcessedWaveform } from './independent-cropping';
import { CollectionWithUUID } from './uuid-based-collection-manager';

/**
 * 处理状态类型
 */
export type ProcessingStatus = 'normal' | 'degraded' | 'anomaly';

/**
 * 处理状态信息
 */
export interface ProcessingStatusInfo {
  status: ProcessingStatus;
  score: number;              // 质量评分（0-100）
  icon: string;               // 图标
  label: string;              // 标签
  description: string;        // 描述
  color: string;              // 颜色（用于UI）
  backgroundColor: string;    // 背景颜色
}

/**
 * 根据裁剪结果判定处理状态
 */
export function determineProcessingStatus(
  waveform: ProcessedWaveform
): ProcessingStatus {
  const croppingMeta = waveform.meta.croppingMeta;

  // 根据裁剪阶段判定状态
  if (croppingMeta.stage === 'primary') {
    return 'normal';
  } else if (croppingMeta.stage === 'fallback') {
    return 'degraded';
  } else if (croppingMeta.stage === 'final-fallback') {
    return 'degraded';
  }

  return 'normal';
}

/**
 * 计算质量评分（0-100）
 * 
 * 评分标准：
 * - 正常裁剪 + 高置信度 = 85-100分
 * - 降级裁剪 + 中等置信度 = 60-84分
 * - 降级裁剪 + 低置信度 = 40-59分
 * - 异常波形 = 0-39分
 */
export function calculateQualityScore(
  waveform: ProcessedWaveform,
  isAnomaly: boolean = false
): number {
  const croppingMeta = waveform.meta.croppingMeta;
  const confidence = croppingMeta.confidence;

  // 基础分数：根据裁剪置信度（0-1 转换为 0-100）
  let baseScore = confidence * 100;

  // 根据裁剪阶段调整分数
  let stageFactor = 1;
  if (croppingMeta.stage === 'primary') {
    // Primary: 高质量裁剪，保持原分数
    stageFactor = 1;
  } else if (croppingMeta.stage === 'fallback') {
    // Fallback: 中等质量裁剪，降低 10%
    stageFactor = 0.9;
  } else if (croppingMeta.stage === 'final-fallback') {
    // Final fallback: 低质量裁剪，降低 30%
    stageFactor = 0.7;
  }

  let score = baseScore * stageFactor;

  // 异常因子（如果检测到异常）
  if (isAnomaly) {
    score = Math.max(0, score * 0.5);  // 异常采集降低 50%
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * 获取处理状态的可视化信息
 */
export function getStatusVisualization(
  status: ProcessingStatus,
  score: number
): ProcessingStatusInfo {
  const visualizations: Record<ProcessingStatus, ProcessingStatusInfo> = {
    normal: {
      status: 'normal',
      score,
      icon: '✅',
      label: '已裁剪/已缩放',
      description: '精确空白裁剪并成功缩放到512样本',
      color: '#10b981',
      backgroundColor: '#d1fae5'
    },
    degraded: {
      status: 'degraded',
      score,
      icon: '⚠️',
      label: '已裁剪/已缩放(降级)',
      description: '使用降级裁剪方法，已缩放到512样本',
      color: '#f59e0b',
      backgroundColor: '#fef3c7'
    },
    anomaly: {
      status: 'anomaly',
      score,
      icon: '❌',
      label: '未裁剪/未缩放',
      description: '检测到异常波形，建议删除',
      color: '#ef4444',
      backgroundColor: '#fee2e2'
    }
  };

  return visualizations[status];
}

/**
 * 生成状态徽章的HTML
 */
export function generateStatusBadgeHTML(info: ProcessingStatusInfo): string {
  return `
    <div style="
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 4px;
      background-color: ${info.backgroundColor};
      color: ${info.color};
      font-size: 12px;
      font-weight: 500;
    ">
      <span>${info.icon}</span>
      <span>${info.label}</span>
      <span style="font-size: 11px; opacity: 0.7;">(${info.score.toFixed(0)}分)</span>
    </div>
  `;
}

/**
 * 生成状态统计信息
 */
export interface StatusStatistics {
  total: number;
  normal: number;
  degraded: number;
  anomaly: number;
  averageScore: number;
}

export function calculateStatusStatistics(
  waveforms: ProcessedWaveform[],
  anomalyIndices: Set<number> = new Set()
): StatusStatistics {
  let normal = 0;
  let degraded = 0;
  let anomaly = 0;
  let totalScore = 0;

  waveforms.forEach((wf, idx) => {
    const isAnomaly = anomalyIndices.has(idx);
    const status = determineProcessingStatus(wf);
    const score = calculateQualityScore(wf, isAnomaly);

    if (isAnomaly) {
      anomaly++;
    } else if (status === 'normal') {
      normal++;
    } else {
      degraded++;
    }

    totalScore += score;
  });

  return {
    total: waveforms.length,
    normal,
    degraded,
    anomaly,
    averageScore: waveforms.length > 0 ? totalScore / waveforms.length : 0
  };
}

/**
 * 生成状态统计的文本描述
 */
export function formatStatusStatistics(stats: StatusStatistics): string {
  const lines = [
    `总采集数: ${stats.total}`,
    `✅ 正常: ${stats.normal}`,
    `⚠️ 降级: ${stats.degraded}`,
    `❌ 异常: ${stats.anomaly}`,
    `平均评分: ${stats.averageScore.toFixed(1)}/100`
  ];

  return lines.join(' | ');
}

/**
 * 根据评分等级获取等级标签
 */
export function getScoreGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * 生成波形处理报告
 */
export interface WaveformProcessingReport {
  index: number;
  uuid?: string;
  status: ProcessingStatus;
  score: number;
  grade: string;
  croppingMethod: string;
  croppingConfidence: number;
  normalizationLength: number;
  isAnomaly: boolean;
  recommendation: string;
}

export function generateProcessingReport(
  waveforms: ProcessedWaveform[],
  uuidCollections?: CollectionWithUUID[],
  anomalyIndices: Set<number> = new Set()
): WaveformProcessingReport[] {
  return waveforms.map((wf, idx) => {
    const isAnomaly = anomalyIndices.has(idx);
    const status = determineProcessingStatus(wf);
    const score = calculateQualityScore(wf, isAnomaly);
    const grade = getScoreGrade(score);
    const croppingMeta = wf.meta.croppingMeta;
    const normalizationMeta = wf.meta.normalizationMeta;

    let recommendation = '';
    if (isAnomaly) {
      recommendation = '建议删除此波形';
    } else if (status === 'degraded' && score < 50) {
      recommendation = '建议重新采集';
    } else if (status === 'degraded') {
      recommendation = '可以保留，但质量一般';
    } else {
      recommendation = '质量良好，可以使用';
    }

    return {
      index: idx,
      uuid: uuidCollections?.[idx]?.uuid,
      status,
      score,
      grade,
      croppingMethod: croppingMeta.method || 'unknown',
      croppingConfidence: croppingMeta.confidence,
      normalizationLength: normalizationMeta.targetLength || 512,
      isAnomaly,
      recommendation
    };
  });
}

/**
 * 生成处理报告的CSV格式
 */
export function exportProcessingReportAsCSV(
  reports: WaveformProcessingReport[]
): string {
  const headers = [
    '索引',
    'UUID',
    '状态',
    '评分',
    '等级',
    '裁剪方法',
    '置信度',
    '缩放长度',
    '异常',
    '建议'
  ];

  const rows = reports.map(r => [
    r.index,
    r.uuid || '',
    r.status,
    r.score.toFixed(1),
    r.grade,
    r.croppingMethod,
    (r.croppingConfidence * 100).toFixed(0) + '%',
    r.normalizationLength,
    r.isAnomaly ? '是' : '否',
    r.recommendation
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csv;
}

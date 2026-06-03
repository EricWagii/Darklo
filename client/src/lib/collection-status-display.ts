/**
 * 采集状态显示集成层
 * 
 * 为CollectionMode提供处理状态显示的接口
 * 整合processedWaveforms的元数据和processing-status-visualization
 */

import { ProcessedWaveform } from './independent-cropping';
import {
  determineProcessingStatus,
  calculateQualityScore,
  getStatusVisualization,
  ProcessingStatus,
  ProcessingStatusInfo
} from './processing-status-visualization';

/**
 * 采集项的显示信息
 */
export interface CollectionDisplayInfo {
  index: number;
  processingStatus: ProcessingStatus;
  qualityScore: number;
  statusInfo: ProcessingStatusInfo;
  croppingStage: 'primary' | 'fallback' | 'final-fallback';
  croppingConfidence: number;
  croppingMethod: string;
  normalizationLength: number;
  originalLength: number;
}

/**
 * 为采集项生成显示信息
 */
export function generateCollectionDisplayInfo(
  waveform: ProcessedWaveform,
  index: number,
  isAnomaly: boolean = false
): CollectionDisplayInfo {
  // 确定处理状态
  const processingStatus = isAnomaly ? 'anomaly' : determineProcessingStatus(waveform);
  
  // 计算质量评分
  const qualityScore = calculateQualityScore(waveform, isAnomaly);
  
  // 获取状态可视化信息
  const statusInfo = getStatusVisualization(processingStatus, qualityScore);
  
  // 提取元数据
  const croppingMeta = waveform.meta.croppingMeta;
  const normalizationMeta = waveform.meta.normalizationMeta;
  
  return {
    index,
    processingStatus,
    qualityScore,
    statusInfo,
    croppingStage: croppingMeta.stage as 'primary' | 'fallback' | 'final-fallback',
    croppingConfidence: croppingMeta.confidence,
    croppingMethod: croppingMeta.method,
    normalizationLength: normalizationMeta.targetLength,
    originalLength: normalizationMeta.originalLength
  };
}

/**
 * 批量生成采集项显示信息
 */
export function generateCollectionDisplayInfoBatch(
  waveforms: ProcessedWaveform[],
  anomalyIndices?: Set<number>
): CollectionDisplayInfo[] {
  return waveforms.map((wf, idx) => {
    const isAnomaly = anomalyIndices?.has(idx) ?? false;
    return generateCollectionDisplayInfo(wf, idx, isAnomaly);
  });
}

/**
 * 生成采集项的HTML徽章
 */
export function generateCollectionBadgeHTML(info: CollectionDisplayInfo): string {
  return `
    <div style="
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background-color: ${info.statusInfo.backgroundColor};
      border: 1px solid ${info.statusInfo.color};
      border-radius: 4px;
      font-size: 12px;
    ">
      <span style="font-size: 14px;">${info.statusInfo.icon}</span>
      <span style="color: ${info.statusInfo.color}; font-weight: bold;">
        ${info.statusInfo.label}
      </span>
      <span style="color: #999; margin-left: 4px;">
        ${info.qualityScore.toFixed(0)}分
      </span>
    </div>
  `;
}

/**
 * 生成采集项的详细信息卡片
 */
export function generateCollectionDetailCard(info: CollectionDisplayInfo): string {
  const stageLabel: Record<'primary' | 'fallback' | 'final-fallback', string> = {
    'primary': '精确裁剪',
    'fallback': '降级裁剪',
    'final-fallback': '全段返回'
  };
  const stage = stageLabel[info.croppingStage];
  
  return `
    <div style="
      background-color: #1a1a1a;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 12px;
      font-size: 12px;
      color: #ccc;
    ">
      <div style="margin-bottom: 8px; font-weight: bold; color: #d4af37;">
        采集 #${info.index + 1}
      </div>
      <div style="margin-bottom: 4px;">
        状态: ${info.statusInfo.label} (${info.qualityScore.toFixed(0)}分)
      </div>
      <div style="margin-bottom: 4px;">
        裁剪: ${stage} (置信度: ${(info.croppingConfidence * 100).toFixed(0)}%)
      </div>
      <div style="margin-bottom: 4px;">
        方法: ${info.croppingMethod}
      </div>
      <div>
        缩放: ${info.originalLength} → ${info.normalizationLength}样本
      </div>
    </div>
  `;
}

/**
 * 生成采集统计摘要
 */
export interface CollectionSummary {
  total: number;
  normal: number;
  degraded: number;
  anomaly: number;
  averageScore: number;
  averageConfidence: number;
}

export function generateCollectionSummary(
  displayInfos: CollectionDisplayInfo[],
  anomalyCount: number = 0
): CollectionSummary {
  const total = displayInfos.length;
  
  let normal = 0;
  let degraded = 0;
  let totalScore = 0;
  let totalConfidence = 0;
  
  displayInfos.forEach(info => {
    if (info.processingStatus === 'normal') {
      normal++;
    } else if (info.processingStatus === 'degraded') {
      degraded++;
    }
    totalScore += info.qualityScore;
    totalConfidence += info.croppingConfidence;
  });
  
  return {
    total,
    normal,
    degraded,
    anomaly: anomalyCount,
    averageScore: total > 0 ? totalScore / total : 0,
    averageConfidence: total > 0 ? totalConfidence / total : 0
  };
}

/**
 * 格式化采集统计摘要为文本
 */
export function formatCollectionSummary(summary: CollectionSummary): string {
  return `
    总采集数: ${summary.total}
    ✅ 正常: ${summary.normal}
    ⚠️ 降级: ${summary.degraded}
    ❌ 异常: ${summary.anomaly}
    平均评分: ${summary.averageScore.toFixed(1)}分
    平均置信度: ${(summary.averageConfidence * 100).toFixed(0)}%
  `.trim();
}

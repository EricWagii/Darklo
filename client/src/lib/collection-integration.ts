/**
 * 采集集成层 - 连接新的独立裁剪算法与现有采集流程
 * 
 * 这个文件完全独立，不修改任何现有代码。
 * 提供清晰的接口给 CollectionMode.tsx 调用。
 * 
 * 流程：空白裁剪 → 缩放到统一长度 → 保存
 */

import {
  batchProcessWaveforms,
  ProcessedWaveform,
  IndependentCroppingResult
} from './independent-cropping';
import {
  detectAnomaliesUsingMahalanobis,
  formatAnomalyReport
} from './anomaly-detection-integration';

/**
 * 采集数据的完整处理流程
 */
export interface CollectionProcessingResult {
  // 处理后的波形（裁剪+缩放）
  processedWaveforms: ProcessedWaveform[];
  
  // 异常检测结果
  anomalies: {
    index: number;
    reason: string;
    confidence: number;
  }[];
  
  // 统计信息
  stats: {
    totalCollections: number;
    successfulCroppings: number;
    degradedCroppings: number;
    failedCroppings: number;
  };
  
  // 是否有异常需要用户处理
  hasAnomalies: boolean;
}

/**
 * 处理采集的波形数据
 * 
 * @param collections 采集的波形数据
 * @param targetLength 目标长度（默认512）
 * @returns 处理结果
 */
export function processCollections(
  collections: Array<{
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>,
  targetLength: number = 512
): CollectionProcessingResult {
  if (collections.length === 0) {
    return {
      processedWaveforms: [],
      anomalies: [],
      stats: {
        totalCollections: 0,
        successfulCroppings: 0,
        degradedCroppings: 0,
        failedCroppings: 0
      },
      hasAnomalies: false
    };
  }

  // 处理所有波形：空白裁剪 → 缩放到统一长度
  const processedWaveforms = batchProcessWaveforms(collections, targetLength);

  // 统计裁剪结果
  let successfulCroppings = 0;
  let degradedCroppings = 0;
  let failedCroppings = 0;

  processedWaveforms.forEach((result) => {
    const croppingMeta = result.meta.croppingMeta;

    if (croppingMeta.stage === 'primary') {
      successfulCroppings++;
    } else if (croppingMeta.stage === 'fallback') {
      degradedCroppings++;
    } else if (croppingMeta.stage === 'final-fallback') {
      degradedCroppings++;
    }
  });

  // 使用指南的异常检测方法：特征向量 + 马氏距离 + IQR
  const anomalyReport = detectAnomaliesUsingMahalanobis(processedWaveforms);
  const anomalies = anomalyReport.anomalies.map(a => ({
    index: a.index,
    reason: a.reason,
    confidence: a.confidence
  }));

  return {
    processedWaveforms,
    anomalies,
    stats: {
      totalCollections: collections.length,
      successfulCroppings,
      degradedCroppings,
      failedCroppings
    },
    hasAnomalies: anomalies.length > 0
  };
}

/**
 * 获取裁剪状态的人类可读描述
 */
export function getCroppingStatusDescription(
  result: ProcessedWaveform
): string {
  const meta = result.meta.croppingMeta;
  const percent = ((meta.confidence) * 100).toFixed(0);

  switch (meta.stage) {
    case 'primary':
      return `✅ 双端静息估计成功 (置信度: ${percent}%)`;
    case 'fallback':
      return `⚠️ Otsu二值化成功 (置信度: ${percent}%)`;
    case 'final-fallback':
      return `❌ 最终降级使用全段 (置信度: ${percent}%)`;
    default:
      return `未知状态 (${meta.stage})`;
  }
}

/**
 * 获取所有采集的状态摘要
 */
export function getSummary(result: CollectionProcessingResult): string {
  const { stats, anomalies } = result;
  const lines = [
    `总采集数: ${stats.totalCollections}`,
    `✅ 成功裁剪: ${stats.successfulCroppings}`,
    `⚠️ 降级裁剪: ${stats.degradedCroppings}`,
  ];

  if (anomalies.length > 0) {
    lines.push(`❌ 异常波形: ${anomalies.length}`);
  }

  return lines.join(' | ');
}

/**
 * 删除指定索引的波形后返回新的列表
 */
export function removeAnomalies(
  processedWaveforms: ProcessedWaveform[],
  indicesToRemove: number[]
): ProcessedWaveform[] {
  const indicesToRemoveSet = new Set(indicesToRemove);
  return processedWaveforms.filter((_, idx) => !indicesToRemoveSet.has(idx));
}

/**
 * 将处理后的波形转换回原始格式（用于保存到数据库）
 */
export function convertToStorageFormat(
  processedWaveforms: ProcessedWaveform[]
): Array<{
  ch1: number[];
  ch2: number[];
  ch3: number[];
  croppingMeta: any;
  normalizationMeta: any;
}> {
  return processedWaveforms.map((wf) => ({
    ch1: wf.ch1,
    ch2: wf.ch2,
    ch3: wf.ch3,
    croppingMeta: wf.meta.croppingMeta,
    normalizationMeta: wf.meta.normalizationMeta
  }));
}

/**
 * 验证处理结果是否可以保存
 */
export function canSave(result: CollectionProcessingResult): {
  canSave: boolean;
  reason?: string;
} {
  if (result.processedWaveforms.length === 0) {
    return {
      canSave: false,
      reason: '没有有效的波形数据'
    };
  }

  // 即使有异常也可以保存（用户可选择删除异常波形）
  return {
    canSave: true
  };
}

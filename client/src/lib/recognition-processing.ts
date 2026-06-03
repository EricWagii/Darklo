/**
 * 识别处理辅助函数
 * 提供统一的波形处理接口给RecognitionMode使用
 */

import { processWaveform, type ProcessedWaveform } from './independent-cropping';

export type { ProcessedWaveform };
import { extractFullFeatures, normalizeFeatures } from './dsp-processor';
import { calculateChannelWeights, fuseChannelFeatures } from './multi-channel-fusion';
import { processWaveformUnified, WaveformPipelineConfig } from './unified-waveform-pipeline';

/**
 * 处理实时测试波形
 * 使用统一的波形处理流程：滤波降噪 -> 裁剪空白 -> 统一缩放
 */
export function processTestWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): ProcessedWaveform {
  // 使用统一的波形处理流程
  const pipelineConfig: WaveformPipelineConfig = {
    targetLength: 512,
    samplingRate: 500,
    restingBaseline: undefined,
    highPassCutoff: 20,
    adaptiveFilterParams: { windowSize: 50, mu: 0.01 },
  };

  const pipelineResult = processWaveformUnified(
    { ch1, ch2, ch3 },
    pipelineConfig
  );

  // 转换为ProcessedWaveform格式
  return {
    ch1: pipelineResult.processed.ch1,
    ch2: pipelineResult.processed.ch2,
    ch3: pipelineResult.processed.ch3,
    meta: {
      croppingMeta: {
        startIdx: pipelineResult.metadata.cropRange.startIdx,
        endIdx: pipelineResult.metadata.cropRange.endIdx,
        confidence: pipelineResult.metadata.qualityScore / 100,
        method: 'unified-pipeline',
        stage: pipelineResult.metadata.qualityScore > 70 ? 'success' : 'degraded',
        reason: pipelineResult.metadata.steps.join(' -> '),
      },
      normalizationMeta: {
        originalLength: ch1.length,
        targetLength: 512,
        timestamp: Date.now(),
      },
    },
  };
}

/**
 * 处理参考波形（采集数据）
 * 使用统一的波形处理流程：滤波降噪 -> 裁剪空白 -> 统一缩放
 */
export function processReferenceWaveform(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] }
): ProcessedWaveform {
  // 使用统一的波形处理流程
  const pipelineConfig: WaveformPipelineConfig = {
    targetLength: 512,
    samplingRate: 500,
    restingBaseline: undefined,
    highPassCutoff: 20,
    adaptiveFilterParams: { windowSize: 50, mu: 0.01 },
  };

  const pipelineResult = processWaveformUnified(waveform, pipelineConfig);

  // 转换为ProcessedWaveform格式
  return {
    ch1: pipelineResult.processed.ch1,
    ch2: pipelineResult.processed.ch2,
    ch3: pipelineResult.processed.ch3,
    meta: {
      croppingMeta: {
        startIdx: pipelineResult.metadata.cropRange.startIdx,
        endIdx: pipelineResult.metadata.cropRange.endIdx,
        confidence: pipelineResult.metadata.qualityScore / 100,
        method: 'unified-pipeline',
        stage: pipelineResult.metadata.qualityScore > 70 ? 'success' : 'degraded',
        reason: pipelineResult.metadata.steps.join(' -> '),
      },
      normalizationMeta: {
        originalLength: waveform.ch1.length,
        targetLength: 512,
        timestamp: Date.now(),
      },
    },
  };
}

/**
 * 提取并融合特征
 */
export function extractAndFuseFeatures(
  processedWaveform: ProcessedWaveform,
  weights?: { ch1: number; ch2: number; ch3: number }
) {
  const features = extractFullFeatures(
    processedWaveform.ch1,
    processedWaveform.ch2,
    processedWaveform.ch3
  );

  // ✅ 修复：每个通道的特征向量做 Z-score 标准化（对每个维度独立处理）
  // 原因：不同特征的数值范围差异很大（例如波形长度是几千，ZCR是0-1）
  // 会导致低值特征被混没，余弦相似度计算时大值特征占主导
  // ✅ 任务5：替换单样本内部 z-score，改为按特征类型分别归一化
  // 原因：对整个特征向量做 z-score 会混淆不同物理含义的特征
  // 改为按特征类型分别归一化，保留每个特征的物理含义
  const normalizeFeatureGroup = (arr: number[]): number[] => {
    // 固定尺度归一化：除以特征的标准范围
    // 这样保留了特征的相对差异，但避免了极端值主导
    const max = Math.max(...arr.map(x => Math.abs(x)));
    if (max === 0) return arr;
    return arr.map(x => x / max);
  };

  // 为每个通道分别归一化时域和频域特征
  const ch1TimeDomainNorm = normalizeFeatureGroup(features.timeDomain.ch1);
  const ch1FreqDomainNorm = normalizeFeatureGroup(features.frequencyDomain.ch1);
  const ch1Normalized = [...ch1TimeDomainNorm, ...ch1FreqDomainNorm];

  const ch2TimeDomainNorm = normalizeFeatureGroup(features.timeDomain.ch2);
  const ch2FreqDomainNorm = normalizeFeatureGroup(features.frequencyDomain.ch2);
  const ch2Normalized = [...ch2TimeDomainNorm, ...ch2FreqDomainNorm];

  const ch3TimeDomainNorm = normalizeFeatureGroup(features.timeDomain.ch3);
  const ch3FreqDomainNorm = normalizeFeatureGroup(features.frequencyDomain.ch3);
  const ch3Normalized = [...ch3TimeDomainNorm, ...ch3FreqDomainNorm];
  
  // ✅ 任务8：通道权重保留 ch2 主导
  // ch2 权重最高（0.60），因为用户目测 ch2 波形最能区分指令
  const channelWeights = weights || { ch1: 0.30, ch2: 0.60, ch3: 0.10 };
  
  // 融合完整特征
  const fusedFeatures = fuseChannelFeatures(
    ch1Normalized,
    ch2Normalized,
    ch3Normalized,
    channelWeights
  );

  // ✅ 任务8：输出通道权重信息用于调试
  console.log(`[特征融合] 通道权重 - ch1=${channelWeights.ch1}, ch2=${channelWeights.ch2}, ch3=${channelWeights.ch3}`);

  return fusedFeatures;
}

/**
 * 计算两个特征向量的相似度
 * 使用余弦相似度计算，适合高维特征向量
 * @returns 相似度百分比 (0-100)
 */
export function calculateFeatureSimilarity(
  features1: number[],
  features2: number[]
): number {
  if (features1.length !== features2.length) {
    return 0;
  }

  // 使用余弦相似度（更适合高维特征向量）
  // 余弦相似度 = (A·B) / (||A|| * ||B||)
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < features1.length; i++) {
    dotProduct += features1[i] * features2[i];
    normA += features1[i] * features1[i];
    normB += features2[i] * features2[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  const cosineSimilarity = dotProduct / (normA * normB);
  // 余弦相似度范围 [-1, 1]，转换为 [0, 100]
  return Math.max(0, cosineSimilarity * 100);
}

/**
 * 检查处理结果是否可接受
 */
export function isProcessingAcceptable(processedWaveform: ProcessedWaveform): boolean {
  const croppingMeta = processedWaveform.meta.croppingMeta;
  
  // 最终降级时返回false
  if (croppingMeta.stage === 'final-fallback') {
    return false;
  }
  
  // 其他情况返回true（包括primary和fallback）
  return true;
}

/**
 * 获取处理状态描述
 */
export function getProcessingStatusDescription(processedWaveform: ProcessedWaveform): string {
  const croppingMeta = processedWaveform.meta.croppingMeta;
  const confidence = (croppingMeta.confidence * 100).toFixed(0);
  
  switch (croppingMeta.stage) {
    case 'primary':
      return `✅ 精确裁剪 (置信度: ${confidence}%)`;
    case 'fallback':
      return `⚠️ 降级裁剪 (置信度: ${confidence}%)`;
    case 'final-fallback':
      return `❌ 最终降级 (置信度: ${confidence}%)`;
    default:
      return `未知状态 (${croppingMeta.stage})`;
  }
}

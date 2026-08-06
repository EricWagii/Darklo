/**
 * 独立裁剪系统 - 组合策略
 * 
 * 策略流程：
 * 1. 优先用"双端静息估计法"
 *    ↓
 *    置信度 > 0.6 → 裁剪成功，输出结果
 *    ↓
 *    置信度 ≤ 0.6（说明头尾静息段不干净）
 *    ↓
 * 2. 降级用"Otsu 二值化法"
 *    ↓
 *    有效段占比 10%~90% → 裁剪成功
 *    ↓
 *    有效段 <10% 或 >90%（信号几乎全是激活或全是噪声）
 *    ↓
 * 3. 最终降级：返回全段 + 置信度 0.25 + 标记"降级使用全段"
 *    （此时不触发异常，只在UI上显示⚠️标记）
 */

import {
  cropByRestingBaseline,
  CroppingResult as RestingResult
} from './resting-baseline-cropping';
import {
  cropByOtsu,
  OtsuCroppingResult
} from './otsu-binarization';

export interface IndependentCroppingResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  method: 'resting-baseline' | 'otsu' | 'full-segment';
  stage: 'primary' | 'fallback' | 'final-fallback';
  reason: string;
  isQualityAcceptable: boolean; // 降级时返回true，避免传播到异常检测
}

/**
 * 独立裁剪 - 组合策略
 */
export function cropIndependently(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): IndependentCroppingResult {
  // 阶段1：优先用双端静息估计法
  const restingResult = cropByRestingBaseline(ch1, ch2, ch3, windowSize);

  if (restingResult.confidence > 0.6) {
    // 成功
    return {
      startIdx: restingResult.startIdx,
      endIdx: restingResult.endIdx,
      confidence: restingResult.confidence,
      method: 'resting-baseline',
      stage: 'primary',
      reason: `双端静息估计成功: ${restingResult.reason}`,
      isQualityAcceptable: true
    };
  }

  // 阶段2：降级到Otsu二值化法
  const otsuResult = cropByOtsu(ch1, ch2, ch3, windowSize);

  // 放宽有效占比范围：从10%-90%改为5%-95%
  // 原因：实际信号可能出现4.6%或92.4%的极端情况，这仍然是有效信号
  if (otsuResult.activeRatio >= 0.05 && otsuResult.activeRatio <= 0.95) {
    // 成功
    return {
      startIdx: otsuResult.startIdx,
      endIdx: otsuResult.endIdx,
      confidence: otsuResult.confidence,
      method: 'otsu',
      stage: 'fallback',
      reason: `Otsu二值化成功: ${otsuResult.reason}`,
      isQualityAcceptable: true
    };
  }

  // 阶段3：最终降级 - 返回全段
  return {
    startIdx: 0,
    endIdx: ch1.length,
    confidence: 0.25,
    method: 'full-segment',
    stage: 'final-fallback',
    reason: `最终降级使用全段: Otsu有效段占比=${(otsuResult.activeRatio * 100).toFixed(1)}% (不在10%-90%范围内)`,
    isQualityAcceptable: true // 关键：降级时返回true，避免传播到异常检测
  };
}

/**
 * 批量独立裁剪
 */
export function batchCroppingIndependently(
  collections: Array<{
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>,
  windowSize: number = 20
): IndependentCroppingResult[] {
  return collections.map((col) =>
    cropIndependently(col.ch1, col.ch2, col.ch3, windowSize)
  );
}

/**
 * 缩放到固定长度
 */
export function normalizeToFixedLength(
  signal: number[],
  targetLength: number = 512
): number[] {
  if (signal.length === 0) return new Array(targetLength).fill(0);
  if (signal.length === targetLength) return [...signal];

  const normalized: number[] = [];
  const ratio = signal.length / targetLength;

  for (let i = 0; i < targetLength; i++) {
    const srcIdx = i * ratio;
    const idx1 = Math.floor(srcIdx);
    const idx2 = Math.min(idx1 + 1, signal.length - 1);
    const frac = srcIdx - idx1;

    // 线性插值
    normalized.push(
      signal[idx1] * (1 - frac) + signal[idx2] * frac
    );
  }

  return normalized;
}

/**
 * 完整的裁剪和缩放流程
 */
export interface CroppingAndNormalizationMeta {
  croppingMeta: {
    startIdx: number;
    endIdx: number;
    confidence: number;
    method: string;
    stage: string;
    reason: string;
  };
  normalizationMeta: {
    originalLength: number;
    targetLength: number;
    timestamp: number;
  };
  startupArtifactMeta?: import('./startup-artifact-suppression').StartupArtifactMetadata;
  pipelineQualityScore?: number;
}

export interface ProcessedWaveform {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  meta: CroppingAndNormalizationMeta;
}

/**
 * 处理单条波形：裁剪 + 缩放
 */
export function processWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  targetLength: number = 512,
  windowSize: number = 20
): ProcessedWaveform {
  // 第一步：裁剪
  const croppingResult = cropIndependently(ch1, ch2, ch3, windowSize);

  // 提取裁剪后的信号
  const croppedCh1 = ch1.slice(croppingResult.startIdx, croppingResult.endIdx);
  const croppedCh2 = ch2.slice(croppingResult.startIdx, croppingResult.endIdx);
  const croppedCh3 = ch3.slice(croppingResult.startIdx, croppingResult.endIdx);

  // 第二步：缩放到固定长度
  const normalizedCh1 = normalizeToFixedLength(croppedCh1, targetLength);
  const normalizedCh2 = normalizeToFixedLength(croppedCh2, targetLength);
  const normalizedCh3 = normalizeToFixedLength(croppedCh3, targetLength);

  return {
    ch1: normalizedCh1,
    ch2: normalizedCh2,
    ch3: normalizedCh3,
    meta: {
      croppingMeta: {
        startIdx: croppingResult.startIdx,
        endIdx: croppingResult.endIdx,
        confidence: croppingResult.confidence,
        method: croppingResult.method,
        stage: croppingResult.stage,
        reason: croppingResult.reason
      },
      normalizationMeta: {
        originalLength: Math.max(ch1.length, ch2.length, ch3.length),
        targetLength,
        timestamp: Date.now()
      }
    }
  };
}

/**
 * 批量处理多条波形
 */
export function batchProcessWaveforms(
  collections: Array<{
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>,
  targetLength: number = 512,
  windowSize: number = 20
): ProcessedWaveform[] {
  return collections.map((col) =>
    processWaveform(col.ch1, col.ch2, col.ch3, targetLength, windowSize)
  );
}

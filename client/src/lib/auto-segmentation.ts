/**
 * 自动有效片段检测和质量评分模块
 * 
 * 功能：
 * - 自动检测多次采集中的共同高能量区间
 * - 自动裁剪到有效片段，去除前后等待时间
 * - 计算采集质量评分
 * - 检测异常采集
 */

import * as ss from 'simple-statistics';

export interface SegmentationResult {
  startIdx: number;
  endIdx: number;
  confidence: number;
  energyProfile: number[];
}

export interface QualityScore {
  overallScore: number; // 0-100
  energyConsistency: number; // 与其他采集的能量一致性
  alignmentScore: number; // 对齐质量
  isOutlier: boolean; // 是否为异常采集
  recommendation: string; // 建议
}

/**
 * 计算信号能量（使用 RMS）
 */
export function calculateEnergy(signal: number[]): number[] {
  const windowSize = 10; // 10 个采样点为一个窗口
  const energy: number[] = [];

  for (let i = 0; i <= signal.length - windowSize; i++) {
    const window = signal.slice(i, i + windowSize);
    const rms = Math.sqrt(ss.mean(window.map((x) => x * x)));
    energy.push(rms);
  }

  return energy;
}

/**
 * 检测有效片段（基于能量阈值）
 */
export function detectValidSegment(
  signal: number[],
  threshold: number = 0.3 // 能量阈值（相对于最大能量的百分比）
): SegmentationResult {
  const energy = calculateEnergy(signal);
  const maxEnergy = Math.max(...energy);
  const energyThreshold = maxEnergy * threshold;

  let startIdx = -1;
  let endIdx = -1;

  // 找到第一个超过阈值的点
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > energyThreshold) {
      startIdx = i;
      break;
    }
  }

  // 找到最后一个超过阈值的点
  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > energyThreshold) {
      endIdx = i + 10; // +10 是因为能量窗口大小
      break;
    }
  }

  if (startIdx === -1 || endIdx === -1) {
    startIdx = 0;
    endIdx = signal.length;
  }

  // 计算置信度（有效片段占总长度的比例）
  const confidence = (endIdx - startIdx) / signal.length;

  return {
    startIdx: Math.max(0, startIdx),
    endIdx: Math.min(signal.length, endIdx),
    confidence: Math.min(1, confidence),
    energyProfile: energy,
  };
}

/**
 * 多次采集对齐 - 找到共同的高能量区间
 * 用于自动检测有效片段
 */
export function alignMultipleCollections(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): SegmentationResult {
  if (collections.length === 0) {
    return { startIdx: 0, endIdx: 0, confidence: 0, energyProfile: [] };
  }

  // 计算每次采集的能量曲线
  const energyProfiles = collections.map((col) => calculateEnergy(col.ch2)); // 使用 CH2（主信号）

  // 标准化能量曲线到 [0, 1]
  const normalizedProfiles = energyProfiles.map((profile) => {
    const max = Math.max(...profile);
    return profile.map((e) => (max > 0 ? e / max : 0));
  });

  // 计算所有采集的平均能量曲线
  const avgProfile: number[] = [];
  const minLength = Math.min(...normalizedProfiles.map((p) => p.length));

  for (let i = 0; i < minLength; i++) {
    const values = normalizedProfiles.map((p) => p[i]);
    avgProfile.push(ss.mean(values));
  }

  // 计算标准差（用于检测共同区间）
  const stdProfile: number[] = [];
  for (let i = 0; i < minLength; i++) {
    const values = normalizedProfiles.map((p) => p[i]);
    stdProfile.push(ss.standardDeviation(values));
  }

  // 找到低标准差的区间（所有采集都有相似能量的区间）
  const consistencyThreshold = 0.2; // 标准差阈值
  const highEnergyThreshold = 0.3; // 能量阈值

  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < minLength; i++) {
    if (
      stdProfile[i] < consistencyThreshold &&
      avgProfile[i] > highEnergyThreshold
    ) {
      if (startIdx === -1) startIdx = i;
      endIdx = i;
    }
  }

  if (startIdx === -1) {
    startIdx = 0;
    endIdx = minLength;
  }

  // 扩展边界以包含过渡区域
  const margin = Math.floor(minLength * 0.05);
  startIdx = Math.max(0, startIdx - margin);
  endIdx = Math.min(minLength, endIdx + margin);

  const confidence =
    collections.length > 1
      ? 1 - ss.mean(stdProfile.slice(startIdx, endIdx))
      : 0.5;

  return {
    startIdx: startIdx * 10, // 转换回样本索引（能量窗口大小为 10）
    endIdx: endIdx * 10,
    confidence: Math.max(0, Math.min(1, confidence)),
    energyProfile: avgProfile,
  };
}

/**
 * 计算采集质量评分
 */
export function calculateQualityScore(
  signal: number[],
  allCollections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  collectionIndex: number
): QualityScore {
  const segment = detectValidSegment(signal);
  const alignment = alignMultipleCollections(allCollections);

  // 1. 能量一致性评分（与其他采集的对齐质量）
  const energyConsistency = alignment.confidence * 100;

  // 2. 对齐评分（有效片段占总长度的比例）
  const alignmentScore = segment.confidence * 100;

  // 3. 检测异常采集
  // 如果有效片段太短或太长，标记为异常
  const segmentLength = segment.endIdx - segment.startIdx;
  const totalLength = signal.length;
  const segmentRatio = segmentLength / totalLength;

  let isOutlier = false;
  let recommendation = '✓ 质量良好';

  if (segmentRatio < 0.3) {
    isOutlier = true;
    recommendation = '⚠ 有效信号过短，建议重录';
  } else if (segmentRatio > 0.9) {
    isOutlier = true;
    recommendation = '⚠ 有效信号过长，可能包含无用数据';
  } else if (energyConsistency < 50) {
    isOutlier = true;
    recommendation = '⚠ 与其他采集差异大，建议重录';
  }

  // 4. 综合评分
  const overallScore =
    (energyConsistency * 0.5 + alignmentScore * 0.5) * (isOutlier ? 0.7 : 1.0);

  return {
    overallScore: Math.round(overallScore),
    energyConsistency: Math.round(energyConsistency),
    alignmentScore: Math.round(alignmentScore),
    isOutlier,
    recommendation,
  };
}

/**
 * 批量评估所有采集
 */
export function evaluateAllCollections(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): Array<QualityScore & { index: number }> {
  return collections.map((col, idx) => ({
    index: idx,
    ...calculateQualityScore(col.ch2, collections, idx),
  }));
}

/**
 * 自动裁剪采集数据到有效片段
 */
export function autoCropCollection(
  collection: { ch1: number[]; ch2: number[]; ch3: number[] },
  allCollections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  const alignment = alignMultipleCollections(allCollections);

  return {
    ch1: collection.ch1.slice(alignment.startIdx, alignment.endIdx),
    ch2: collection.ch2.slice(alignment.startIdx, alignment.endIdx),
    ch3: collection.ch3.slice(alignment.startIdx, alignment.endIdx),
  };
}

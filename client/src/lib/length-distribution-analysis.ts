/**
 * 长度分布统计分析模块
 * 
 * 功能：
 * - 计算采集的时长分布
 * - 统计符合规范的采集百分比
 * - 生成直方图数据
 * - 计算统计指标（平均值、中位数、标准差）
 */

import { SAMPLE_RATE, INSTRUCTION_LENGTH_SPECS, calculateDurationMs, validateInstructionLength } from '@shared/instruction-length-spec';

export interface LengthDistributionStats {
  instructionName: string;
  totalCollections: number;
  validCollections: number;
  validPercentage: number;
  averageDurationMs: number;
  medianDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  stdDeviation: number;
  spec: any;
  histogram: HistogramBucket[];
  outliers: OutlierInfo[];
}

export interface HistogramBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
  percentage: number;
  isInSpec: boolean;
  label: string;
}

export interface OutlierInfo {
  index: number;
  durationMs: number;
  reason: string;
}

/**
 * 计算采集的长度分布统计
 */
export function analyzeLengthDistribution(
  instructionName: string,
  collections: Array<{ waveform: { ch1: number[] } }>
): LengthDistributionStats {
  if (collections.length === 0) {
    return {
      instructionName,
      totalCollections: 0,
      validCollections: 0,
      validPercentage: 0,
      averageDurationMs: 0,
      medianDurationMs: 0,
      minDurationMs: 0,
      maxDurationMs: 0,
      stdDeviation: 0,
      spec: null,
      histogram: [],
      outliers: [],
    };
  }

  // 计算每个采集的时长
  const durations = collections.map((col) => calculateDurationMs(col.waveform.ch1.length));

  // 计算统计指标
  const averageDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianDurationMs = sortedDurations[Math.floor(sortedDurations.length / 2)];
  const minDurationMs = Math.min(...durations);
  const maxDurationMs = Math.max(...durations);

  // 计算标准差
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - averageDurationMs, 2), 0) / durations.length;
  const stdDeviation = Math.sqrt(variance);

  // 获取指令规范
  const spec = INSTRUCTION_LENGTH_SPECS[instructionName];

  // 统计符合规范的采集
  let validCollections = 0;
  const outliers: OutlierInfo[] = [];

  durations.forEach((duration, index) => {
    const validation = validateInstructionLength(instructionName, duration);
    if (validation.isValid) {
      validCollections++;
    } else {
      outliers.push({
        index,
        durationMs: duration,
        reason: validation.message,
      });
    }
  });

  const validPercentage = (validCollections / collections.length) * 100;

  // 生成直方图数据
  const histogram = generateHistogram(durations, spec);

  return {
    instructionName,
    totalCollections: collections.length,
    validCollections,
    validPercentage,
    averageDurationMs,
    medianDurationMs,
    minDurationMs,
    maxDurationMs,
    stdDeviation,
    spec,
    histogram,
    outliers,
  };
}

/**
 * 生成直方图数据
 */
function generateHistogram(durations: number[], spec: any): HistogramBucket[] {
  if (!spec) {
    return [];
  }

  const { minDurationMs, maxDurationMs } = spec;
  const bucketWidth = 50; // 每个桶的宽度为 50ms
  const numBuckets = Math.ceil((maxDurationMs + 100 - (minDurationMs - 100)) / bucketWidth);

  const buckets: HistogramBucket[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const rangeStart = minDurationMs - 100 + i * bucketWidth;
    const rangeEnd = rangeStart + bucketWidth;

    const count = durations.filter((d) => d >= rangeStart && d < rangeEnd).length;
    const percentage = (count / durations.length) * 100;

    const isInSpec = rangeStart >= minDurationMs && rangeEnd <= maxDurationMs + 50;

    buckets.push({
      rangeStart,
      rangeEnd,
      count,
      percentage,
      isInSpec,
      label: `${rangeStart}-${rangeEnd}ms`,
    });
  }

  return buckets;
}

/**
 * 批量分析多个指令的长度分布
 */
export function analyzeMultipleInstructions(
  commands: Array<{ name: string; collections: Array<{ waveform: { ch1: number[] } }> }>
): LengthDistributionStats[] {
  return commands.map((cmd) => analyzeLengthDistribution(cmd.name, cmd.collections));
}

/**
 * 计算整体的数据质量评分
 */
export function calculateOverallQualityScore(stats: LengthDistributionStats[]): number {
  if (stats.length === 0) {
    return 0;
  }

  // 基于符合规范的百分比计算评分
  const avgValidPercentage = stats.reduce((sum, s) => sum + s.validPercentage, 0) / stats.length;

  // 基于标准差计算一致性评分（标准差越小越好）
  const avgStdDev = stats.reduce((sum, s) => sum + s.stdDeviation, 0) / stats.length;
  const consistencyScore = Math.max(0, 100 - avgStdDev * 2);

  // 综合评分：70% 符合规范 + 30% 一致性
  const overallScore = avgValidPercentage * 0.7 + consistencyScore * 0.3;

  return Math.round(overallScore);
}

/**
 * 生成长度分布的文本摘要
 */
export function generateLengthSummary(stats: LengthDistributionStats): string {
  const { instructionName, totalCollections, validCollections, validPercentage, averageDurationMs, medianDurationMs, spec } = stats;

  if (!spec) {
    return `${instructionName}: 无规范定义`;
  }

  const summary = `${instructionName}:
- 采集总数: ${totalCollections}
- 符合规范: ${validCollections}/${totalCollections} (${validPercentage.toFixed(1)}%)
- 平均时长: ${averageDurationMs.toFixed(0)}ms (推荐: ${spec.recommendedDurationMs}ms)
- 中位数: ${medianDurationMs.toFixed(0)}ms
- 规范范围: ${spec.minDurationMs}-${spec.maxDurationMs}ms`;

  return summary;
}

/**
 * 检测异常采集
 */
export function detectAnomalies(stats: LengthDistributionStats): string[] {
  const issues: string[] = [];

  if (stats.validPercentage < 80) {
    issues.push(`⚠️ ${stats.instructionName}: 仅 ${stats.validPercentage.toFixed(1)}% 的采集符合规范`);
  }

  if (stats.stdDeviation > 100) {
    issues.push(`⚠️ ${stats.instructionName}: 采集时长波动较大（标准差: ${stats.stdDeviation.toFixed(0)}ms）`);
  }

  if (stats.outliers.length > 0) {
    issues.push(`⚠️ ${stats.instructionName}: 存在 ${stats.outliers.length} 个异常采集`);
  }

  return issues;
}

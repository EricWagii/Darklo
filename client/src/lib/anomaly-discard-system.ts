/**
 * 异常波形舍弃系统
 * 
 * 功能：
 * - 自动标记异常波形
 * - 提示用户删除异常波形
 * - 在训练时排除异常波形
 * - 记录舍弃的波形信息
 */

export interface AnomalyRecord {
  collectionIndex: number;
  commandName: string;
  timestamp: number;
  reason: string;
  qualityScore: number;
  recommendation: string;
  isDiscarded: boolean;
  discardedAt?: number;
  discardReason?: string;
}

export interface DiscardStatistics {
  totalCollections: number;
  discardedCount: number;
  discardRate: number;
  discardReasons: Map<string, number>;
  averageQualityOfDiscarded: number;
  averageQualityOfKept: number;
}

/**
 * 异常波形舍弃系统
 */
export class AnomalyDiscardSystem {
  private anomalyRecords: AnomalyRecord[] = [];
  private discardedIndices: Set<number> = new Set();

  /**
   * 标记异常波形
   */
  markAnomaly(
    collectionIndex: number,
    commandName: string,
    reason: string,
    qualityScore: number,
    recommendation: string
  ): AnomalyRecord {
    const record: AnomalyRecord = {
      collectionIndex,
      commandName,
      timestamp: Date.now(),
      reason,
      qualityScore,
      recommendation,
      isDiscarded: false,
    };

    this.anomalyRecords.push(record);
    return record;
  }

  /**
   * 舍弃异常波形
   */
  discardAnomaly(collectionIndex: number, discardReason: string): boolean {
    const record = this.anomalyRecords.find(
      (r) => r.collectionIndex === collectionIndex
    );

    if (!record) {
      return false;
    }

    record.isDiscarded = true;
    record.discardedAt = Date.now();
    record.discardReason = discardReason;
    this.discardedIndices.add(collectionIndex);

    return true;
  }

  /**
   * 检查波形是否应该被舍弃
   */
  shouldDiscard(collectionIndex: number): boolean {
    return this.discardedIndices.has(collectionIndex);
  }

  /**
   * 获取所有异常记录
   */
  getAllAnomalies(): AnomalyRecord[] {
    return [...this.anomalyRecords];
  }

  /**
   * 获取已舍弃的异常记录
   */
  getDiscardedAnomalies(): AnomalyRecord[] {
    return this.anomalyRecords.filter((r) => r.isDiscarded);
  }

  /**
   * 获取未舍弃的异常记录
   */
  getUndiscardedAnomalies(): AnomalyRecord[] {
    return this.anomalyRecords.filter((r) => !r.isDiscarded);
  }

  /**
   * 获取舍弃统计信息
   */
  getDiscardStatistics(
    totalCollections: number,
    allQualityScores: number[]
  ): DiscardStatistics {
    const discardedRecords = this.getDiscardedAnomalies();
    const discardedCount = discardedRecords.length;
    const discardRate = (discardedCount / totalCollections) * 100;

    // 统计舍弃原因
    const discardReasons = new Map<string, number>();
    discardedRecords.forEach((record) => {
      const reason = record.discardReason || record.reason;
      discardReasons.set(reason, (discardReasons.get(reason) || 0) + 1);
    });

    // 计算舍弃波形的平均质量
    const discardedQualityScores = discardedRecords.map((r) => r.qualityScore);
    const averageQualityOfDiscarded =
      discardedQualityScores.length > 0
        ? discardedQualityScores.reduce((a, b) => a + b, 0) /
          discardedQualityScores.length
        : 0;

    // 计算保留波形的平均质量
    const keptIndices = Array.from({ length: totalCollections }, (_, i) => i)
      .filter((i) => !this.discardedIndices.has(i));
    const keptQualityScores = keptIndices.map((i) => allQualityScores[i] || 0);
    const averageQualityOfKept =
      keptQualityScores.length > 0
        ? keptQualityScores.reduce((a, b) => a + b, 0) / keptQualityScores.length
        : 0;

    return {
      totalCollections,
      discardedCount,
      discardRate,
      discardReasons,
      averageQualityOfDiscarded,
      averageQualityOfKept,
    };
  }

  /**
   * 过滤集合，移除已舍弃的波形
   */
  filterCollections<T extends { index?: number }>(
    collections: T[]
  ): T[] {
    return collections.filter((col, idx) => {
      const index = col.index ?? idx;
      return !this.discardedIndices.has(index);
    });
  }

  /**
   * 生成舍弃报告
   */
  generateReport(): string {
    const discarded = this.getDiscardedAnomalies();
    const undiscarded = this.getUndiscardedAnomalies();

    let report = `\n=== 异常波形舍弃报告 ===\n`;
    report += `总异常数: ${this.anomalyRecords.length}\n`;
    report += `已舍弃: ${discarded.length}\n`;
    report += `未舍弃: ${undiscarded.length}\n\n`;

    if (discarded.length > 0) {
      report += `已舍弃的波形:\n`;
      discarded.forEach((record) => {
        report += `  - 采集 #${record.collectionIndex + 1}: ${record.discardReason || record.reason} (质量评分: ${record.qualityScore.toFixed(1)})\n`;
      });
    }

    if (undiscarded.length > 0) {
      report += `\n未舍弃的异常波形:\n`;
      undiscarded.forEach((record) => {
        report += `  - 采集 #${record.collectionIndex + 1}: ${record.reason} (质量评分: ${record.qualityScore.toFixed(1)}, 建议: ${record.recommendation})\n`;
      });
    }

    return report;
  }

  /**
   * 清除所有记录
   */
  clear(): void {
    this.anomalyRecords = [];
    this.discardedIndices.clear();
  }

  /**
   * 获取舍弃指数集合
   */
  getDiscardedIndices(): Set<number> {
    return new Set(this.discardedIndices);
  }

  /**
   * 撤销舍弃
   */
  undiscardAnomaly(collectionIndex: number): boolean {
    const record = this.anomalyRecords.find(
      (r) => r.collectionIndex === collectionIndex
    );

    if (!record || !record.isDiscarded) {
      return false;
    }

    record.isDiscarded = false;
    record.discardedAt = undefined;
    record.discardReason = undefined;
    this.discardedIndices.delete(collectionIndex);

    return true;
  }

  /**
   * 批量舍弃异常波形
   */
  discardMultiple(indices: number[], reason: string): number {
    let count = 0;
    indices.forEach((idx) => {
      if (this.discardAnomaly(idx, reason)) {
        count++;
      }
    });
    return count;
  }

  /**
   * 自动舍弃低于阈值的异常波形
   */
  autoDiscardBelowThreshold(
    qualityThreshold: number,
    reason: string
  ): number {
    let count = 0;
    this.anomalyRecords.forEach((record) => {
      if (
        !record.isDiscarded &&
        record.qualityScore < qualityThreshold
      ) {
        if (this.discardAnomaly(record.collectionIndex, reason)) {
          count++;
        }
      }
    });
    return count;
  }
}

/**
 * 创建全局异常波形舍弃系统实例
 */
export const anomalyDiscardSystem = new AnomalyDiscardSystem();

/**
 * 辅助函数：生成舍弃建议
 */
export function generateDiscardRecommendation(
  reason: string,
  qualityScore: number
): string {
  if (qualityScore < 30) {
    return `质量极低 (${qualityScore.toFixed(1)}%), 强烈建议舍弃`;
  } else if (qualityScore < 50) {
    return `质量较低 (${qualityScore.toFixed(1)}%), 建议舍弃`;
  } else if (qualityScore < 70) {
    return `质量一般 (${qualityScore.toFixed(1)}%), 可选舍弃`;
  }
  return `质量可接受 (${qualityScore.toFixed(1)}%), 无需舍弃`;
}

/**
 * 辅助函数：判断是否应该自动舍弃
 */
export function shouldAutoDiscard(qualityScore: number): boolean {
  return qualityScore < 30;
}

/**
 * 辅助函数：生成用户提示信息
 */
export function generateUserPrompt(
  anomalies: AnomalyRecord[],
  stats: DiscardStatistics
): string {
  if (anomalies.length === 0) {
    return `✓ 所有波形质量良好，无异常波形需要处理`;
  }

  const autoDiscardCount = anomalies.filter(
    (a) => a.qualityScore < 30
  ).length;
  const manualReviewCount = anomalies.filter(
    (a) => a.qualityScore >= 30 && a.qualityScore < 70
  ).length;

  let prompt = `检测到 ${anomalies.length} 个异常波形:\n`;
  if (autoDiscardCount > 0) {
    prompt += `• ${autoDiscardCount} 个质量极低的波形 - 建议自动舍弃\n`;
  }
  if (manualReviewCount > 0) {
    prompt += `• ${manualReviewCount} 个质量一般的波形 - 需要手动审查\n`;
  }

  prompt += `\n异常舍弃率: ${stats.discardRate.toFixed(1)}%\n`;
  prompt += `保留波形平均质量: ${stats.averageQualityOfKept.toFixed(1)}%\n`;

  return prompt;
}

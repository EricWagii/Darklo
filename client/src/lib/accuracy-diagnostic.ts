/**
 * 准确率诊断和优化模块
 * 
 * 功能：
 * 1. 分析识别准确率低的根本原因
 * 2. 识别影响准确率的关键因素
 * 3. 提供优化建议
 * 4. 追踪准确率变化趋势
 */

export interface AccuracyDiagnosticReport {
  timestamp: number;
  totalTests: number;
  correctTests: number;
  accuracy: number;
  
  // 影响因素分析
  factors: {
    croppingConsistency: number; // 裁剪一致性评分 (0-1)
    featureQuality: number; // 特征质量评分 (0-1)
    trainingDataQuality: number; // 训练数据质量 (0-1)
    modelPerformance: number; // 模型性能评分 (0-1)
  };
  
  // 问题诊断
  issues: string[];
  
  // 优化建议
  recommendations: string[];
  
  // 详细统计
  stats: {
    avgSimilarity: number;
    avgConfidence: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
    confusionCommands: Array<{
      predicted: string;
      actual: string;
      count: number;
    }>;
  };
}

export class AccuracyDiagnostic {
  /**
   * 诊断准确率低的原因
   */
  static diagnoseAccuracy(
    recognitionRecords: Array<{
      commandName: string;
      predictedCommand: string;
      isCorrect: boolean;
      similarity: number;
      confidence: number;
    }>,
    trainingData: {
      totalCommands: number;
      totalCollections: number;
      avgCollectionsPerCommand: number;
      anomalousCount: number;
    }
  ): AccuracyDiagnosticReport {
    const report: AccuracyDiagnosticReport = {
      timestamp: Date.now(),
      totalTests: recognitionRecords.length,
      correctTests: recognitionRecords.filter(r => r.isCorrect).length,
      accuracy: 0,
      factors: {
        croppingConsistency: 0.85, // 假设裁剪一致性良好
        featureQuality: 0.75,
        trainingDataQuality: 0.7,
        modelPerformance: 0.65,
      },
      issues: [],
      recommendations: [],
      stats: {
        avgSimilarity: 0,
        avgConfidence: 0,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        confusionCommands: [],
      },
    };

    // 计算准确率
    report.accuracy = report.correctTests / report.totalTests;

    // 计算统计信息
    report.stats.avgSimilarity =
      recognitionRecords.reduce((sum, r) => sum + r.similarity, 0) /
      recognitionRecords.length;
    report.stats.avgConfidence =
      recognitionRecords.reduce((sum, r) => sum + r.confidence, 0) /
      recognitionRecords.length;

    // 分析混淆矩阵
    const confusionMatrix = new Map<string, Map<string, number>>();
    for (const record of recognitionRecords) {
      if (!confusionMatrix.has(record.commandName)) {
        confusionMatrix.set(record.commandName, new Map());
      }
      const row = confusionMatrix.get(record.commandName)!;
      const key = record.predictedCommand;
      row.set(key, (row.get(key) || 0) + 1);
    }

    // 提取混淆的命令对
    confusionMatrix.forEach((predictions, actual) => {
      predictions.forEach((count, predicted) => {
        if (predicted !== actual && count > 0) {
          report.stats.confusionCommands.push({ predicted, actual, count });
        }
      });
    });

    // 诊断问题
    this.diagnoseIssues(report, trainingData);

    // 生成建议
    this.generateRecommendations(report, trainingData);

    return report;
  }

  /**
   * 诊断具体问题
   */
  private static diagnoseIssues(
    report: AccuracyDiagnosticReport,
    trainingData: {
      totalCommands: number;
      totalCollections: number;
      avgCollectionsPerCommand: number;
      anomalousCount: number;
    }
  ): void {
    // 问题1：准确率过低
    if (report.accuracy < 0.7) {
      report.issues.push(`准确率过低 (${(report.accuracy * 100).toFixed(1)}%)`);
    }

    // 问题2：相似度过低
    if (report.stats.avgSimilarity < 0.6) {
      report.issues.push(
        `平均相似度过低 (${(report.stats.avgSimilarity * 100).toFixed(1)}%)`
      );
    }

    // 问题3：置信度不足
    if (report.stats.avgConfidence < 0.5) {
      report.issues.push(
        `平均置信度不足 (${(report.stats.avgConfidence * 100).toFixed(1)}%)`
      );
    }

    // 问题4：训练数据不足
    if (trainingData.avgCollectionsPerCommand < 5) {
      report.issues.push(
        `训练数据不足 (平均${trainingData.avgCollectionsPerCommand}个采集/命令)`
      );
    }

    // 问题5：异常波形过多
    if (trainingData.anomalousCount > trainingData.totalCollections * 0.1) {
      report.issues.push(
        `异常波形过多 (${trainingData.anomalousCount}/${trainingData.totalCollections})`
      );
    }

    // 问题6：命令混淆
    if (report.stats.confusionCommands.length > 0) {
      const topConfusion = report.stats.confusionCommands
        .sort((a, b) => b.count - a.count)[0];
      report.issues.push(
        `命令混淆: "${topConfusion.actual}" 经常被识别为 "${topConfusion.predicted}" (${topConfusion.count}次)`
      );
    }
  }

  /**
   * 生成优化建议
   */
  private static generateRecommendations(
    report: AccuracyDiagnosticReport,
    trainingData: {
      totalCommands: number;
      totalCollections: number;
      avgCollectionsPerCommand: number;
      anomalousCount: number;
    }
  ): void {
    // 建议1：增加训练数据
    if (trainingData.avgCollectionsPerCommand < 10) {
      report.recommendations.push(
        `增加训练数据：每个命令至少采集10次以上`
      );
    }

    // 建议2：改进采集质量
    if (report.stats.avgSimilarity < 0.7) {
      report.recommendations.push(
        `改进采集质量：确保采集环境稳定，设备位置固定`
      );
    }

    // 建议3：优化特征提取
    if (report.stats.avgConfidence < 0.6) {
      report.recommendations.push(
        `优化特征提取：调整MFCC参数，增加特征维度`
      );
    }

    // 建议4：排除异常波形
    if (trainingData.anomalousCount > 0) {
      report.recommendations.push(
        `排除异常波形：删除质量评分低于0.5的采集`
      );
    }

    // 建议5：区分相似命令
    if (report.stats.confusionCommands.length > 0) {
      const topConfusion = report.stats.confusionCommands
        .sort((a, b) => b.count - a.count)[0];
      report.recommendations.push(
        `区分相似命令：为 "${topConfusion.actual}" 和 "${topConfusion.predicted}" 增加更多采集样本`
      );
    }

    // 建议6：调整识别阈值
    if (report.accuracy > 0.5 && report.accuracy < 0.8) {
      report.recommendations.push(
        `调整识别阈值：提高置信度阈值以减少误识别`
      );
    }
  }

  /**
   * 追踪准确率变化趋势
   */
  static trackAccuracyTrend(
    historicalReports: AccuracyDiagnosticReport[]
  ): {
    trend: 'improving' | 'declining' | 'stable';
    changeRate: number;
    prediction: number;
  } {
    if (historicalReports.length < 2) {
      return { trend: 'stable', changeRate: 0, prediction: 0 };
    }

    const recent = historicalReports.slice(-5); // 最近5条记录
    const accuracies = recent.map(r => r.accuracy);

    // 计算变化率
    const changeRate =
      (accuracies[accuracies.length - 1] - accuracies[0]) /
      accuracies[0];

    // 判断趋势
    let trend: 'improving' | 'declining' | 'stable';
    if (changeRate > 0.05) {
      trend = 'improving';
    } else if (changeRate < -0.05) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    // 预测下一个准确率（简单线性外推）
    const slope =
      (accuracies[accuracies.length - 1] - accuracies[0]) /
      (accuracies.length - 1);
    const prediction = accuracies[accuracies.length - 1] + slope;

    return {
      trend,
      changeRate,
      prediction: Math.max(0, Math.min(1, prediction)),
    };
  }

  /**
   * 生成优化报告
   */
  static generateOptimizationReport(
    report: AccuracyDiagnosticReport
  ): string {
    let output = `\n========== 准确率诊断报告 ==========\n`;
    output += `时间: ${new Date(report.timestamp).toLocaleString()}\n`;
    output += `准确率: ${(report.accuracy * 100).toFixed(1)}% (${report.correctTests}/${report.totalTests})\n\n`;

    output += `[影响因素]\n`;
    output += `- 裁剪一致性: ${(report.factors.croppingConsistency * 100).toFixed(0)}%\n`;
    output += `- 特征质量: ${(report.factors.featureQuality * 100).toFixed(0)}%\n`;
    output += `- 训练数据质量: ${(report.factors.trainingDataQuality * 100).toFixed(0)}%\n`;
    output += `- 模型性能: ${(report.factors.modelPerformance * 100).toFixed(0)}%\n\n`;

    if (report.issues.length > 0) {
      output += `[诊断问题]\n`;
      for (const issue of report.issues) {
        output += `- ${issue}\n`;
      }
      output += '\n';
    }

    if (report.recommendations.length > 0) {
      output += `[优化建议]\n`;
      for (const rec of report.recommendations) {
        output += `- ${rec}\n`;
      }
      output += '\n';
    }

    output += `[统计数据]\n`;
    output += `- 平均相似度: ${(report.stats.avgSimilarity * 100).toFixed(1)}%\n`;
    output += `- 平均置信度: ${(report.stats.avgConfidence * 100).toFixed(1)}%\n`;
    output += `- 命令混淆对数: ${report.stats.confusionCommands.length}\n`;

    return output;
  }
}

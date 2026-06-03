import { describe, it, expect } from 'vitest';

/**
 * 准确率诊断和优化测试
 */

describe('准确率诊断和优化', () => {
  describe('准确率分析', () => {
    it('应该正确计算准确率', () => {
      const records = [
        { commandName: 'hello', predictedCommand: 'hello', isCorrect: true, similarity: 0.95, confidence: 0.9 },
        { commandName: 'world', predictedCommand: 'world', isCorrect: true, similarity: 0.92, confidence: 0.88 },
        { commandName: 'test', predictedCommand: 'hello', isCorrect: false, similarity: 0.65, confidence: 0.5 },
      ];

      const correctCount = records.filter(r => r.isCorrect).length;
      const accuracy = correctCount / records.length;

      expect(accuracy).toBeCloseTo(0.667, 2);
    });

    it('应该计算平均相似度', () => {
      const records = [
        { similarity: 0.9 },
        { similarity: 0.8 },
        { similarity: 0.7 },
      ];

      const avgSimilarity = records.reduce((sum, r) => sum + r.similarity, 0) / records.length;

      expect(avgSimilarity).toBeCloseTo(0.8, 1);
    });

    it('应该计算平均置信度', () => {
      const records = [
        { confidence: 0.95 },
        { confidence: 0.85 },
        { confidence: 0.75 },
      ];

      const avgConfidence = records.reduce((sum, r) => sum + r.confidence, 0) / records.length;

      expect(avgConfidence).toBeCloseTo(0.85, 1);
    });
  });

  describe('问题诊断', () => {
    it('应该诊断准确率过低的问题', () => {
      const accuracy = 0.45;
      const issues: string[] = [];

      if (accuracy < 0.7) {
        issues.push(`准确率过低 (${(accuracy * 100).toFixed(1)}%)`);
      }

      expect(issues).toContain('准确率过低 (45.0%)');
    });

    it('应该诊断相似度过低的问题', () => {
      const avgSimilarity = 0.55;
      const issues: string[] = [];

      if (avgSimilarity < 0.6) {
        issues.push(`平均相似度过低 (${(avgSimilarity * 100).toFixed(1)}%)`);
      }

      expect(issues).toContain('平均相似度过低 (55.0%)');
    });

    it('应该诊断置信度不足的问题', () => {
      const avgConfidence = 0.45;
      const issues: string[] = [];

      if (avgConfidence < 0.5) {
        issues.push(`平均置信度不足 (${(avgConfidence * 100).toFixed(1)}%)`);
      }

      expect(issues).toContain('平均置信度不足 (45.0%)');
    });

    it('应该诊断训练数据不足的问题', () => {
      const avgCollectionsPerCommand = 3;
      const issues: string[] = [];

      if (avgCollectionsPerCommand < 5) {
        issues.push(`训练数据不足 (平均${avgCollectionsPerCommand}个采集/命令)`);
      }

      expect(issues).toContain('训练数据不足 (平均3个采集/命令)');
    });

    it('应该诊断异常波形过多的问题', () => {
      const anomalousCount = 5;
      const totalCollections = 30;
      const issues: string[] = [];

      if (anomalousCount > totalCollections * 0.1) {
        issues.push(`异常波形过多 (${anomalousCount}/${totalCollections})`);
      }

      expect(issues).toContain('异常波形过多 (5/30)');
    });

    it('应该诊断命令混淆的问题', () => {
      const confusionCommands = [
        { predicted: 'world', actual: 'hello', count: 3 },
        { predicted: 'test', actual: 'hello', count: 1 },
      ];
      const issues: string[] = [];

      if (confusionCommands.length > 0) {
        const topConfusion = confusionCommands.sort((a, b) => b.count - a.count)[0];
        issues.push(
          `命令混淆: "${topConfusion.actual}" 经常被识别为 "${topConfusion.predicted}" (${topConfusion.count}次)`
        );
      }

      expect(issues).toContain('命令混淆: "hello" 经常被识别为 "world" (3次)');
    });
  });

  describe('优化建议', () => {
    it('应该建议增加训练数据', () => {
      const avgCollectionsPerCommand = 5;
      const recommendations: string[] = [];

      if (avgCollectionsPerCommand < 10) {
        recommendations.push(`增加训练数据：每个命令至少采集10次以上`);
      }

      expect(recommendations).toContain('增加训练数据：每个命令至少采集10次以上');
    });

    it('应该建议改进采集质量', () => {
      const avgSimilarity = 0.65;
      const recommendations: string[] = [];

      if (avgSimilarity < 0.7) {
        recommendations.push(`改进采集质量：确保采集环境稳定，设备位置固定`);
      }

      expect(recommendations).toContain('改进采集质量：确保采集环境稳定，设备位置固定');
    });

    it('应该建议优化特征提取', () => {
      const avgConfidence = 0.55;
      const recommendations: string[] = [];

      if (avgConfidence < 0.6) {
        recommendations.push(`优化特征提取：调整MFCC参数，增加特征维度`);
      }

      expect(recommendations).toContain('优化特征提取：调整MFCC参数，增加特征维度');
    });

    it('应该建议排除异常波形', () => {
      const anomalousCount = 3;
      const recommendations: string[] = [];

      if (anomalousCount > 0) {
        recommendations.push(`排除异常波形：删除质量评分低于0.5的采集`);
      }

      expect(recommendations).toContain('排除异常波形：删除质量评分低于0.5的采集');
    });
  });

  describe('准确率趋势追踪', () => {
    it('应该识别准确率上升趋势', () => {
      const accuracies = [0.4, 0.5, 0.6, 0.7, 0.8];
      const changeRate = (accuracies[accuracies.length - 1] - accuracies[0]) / accuracies[0];

      let trend: 'improving' | 'declining' | 'stable';
      if (changeRate > 0.05) {
        trend = 'improving';
      } else if (changeRate < -0.05) {
        trend = 'declining';
      } else {
        trend = 'stable';
      }

      expect(trend).toBe('improving');
    });

    it('应该识别准确率下降趋势', () => {
      const accuracies = [0.8, 0.7, 0.6, 0.5, 0.4];
      const changeRate = (accuracies[accuracies.length - 1] - accuracies[0]) / accuracies[0];

      let trend: 'improving' | 'declining' | 'stable';
      if (changeRate > 0.05) {
        trend = 'improving';
      } else if (changeRate < -0.05) {
        trend = 'declining';
      } else {
        trend = 'stable';
      }

      expect(trend).toBe('declining');
    });

    it('应该识别准确率稳定趋势', () => {
      const accuracies = [0.7, 0.71, 0.70, 0.71, 0.70];
      const changeRate = (accuracies[accuracies.length - 1] - accuracies[0]) / accuracies[0];

      let trend: 'improving' | 'declining' | 'stable';
      if (changeRate > 0.05) {
        trend = 'improving';
      } else if (changeRate < -0.05) {
        trend = 'declining';
      } else {
        trend = 'stable';
      }

      expect(trend).toBe('stable');
    });

    it('应该预测下一个准确率', () => {
      const accuracies = [0.5, 0.6, 0.7, 0.8];
      const slope = (accuracies[accuracies.length - 1] - accuracies[0]) / (accuracies.length - 1);
      const prediction = Math.max(0, Math.min(1, accuracies[accuracies.length - 1] + slope));

      expect(prediction).toBeGreaterThan(0.8);
      expect(prediction).toBeLessThanOrEqual(1.0);
    });
  });

  describe('报告生成', () => {
    it('应该生成完整的诊断报告', () => {
      const report = {
        timestamp: Date.now(),
        accuracy: 0.75,
        correctTests: 15,
        totalTests: 20,
        factors: {
          croppingConsistency: 0.85,
          featureQuality: 0.75,
          trainingDataQuality: 0.7,
          modelPerformance: 0.65,
        },
        issues: ['准确率过低 (75.0%)'],
        recommendations: ['增加训练数据'],
        stats: {
          avgSimilarity: 0.8,
          avgConfidence: 0.75,
          falsePositiveRate: 0.1,
          falseNegativeRate: 0.15,
          confusionCommands: [],
        },
      };

      expect(report.accuracy).toBe(0.75);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });
});

/**
 * 模型反馈和修正系统
 * 
 * 功能：
 * - 收集用户反馈（系统预测 vs 真实指令）
 * - 记录识别错误和正确情况
 * - 计算模型性能指标
 * - 生成改进建议
 * - 支持模型在线学习和增强
 */

/**
 * 单个测试反馈记录
 */
export interface TestFeedback {
  testId: string;
  timestamp: Date;
  predictedCommand: string;
  predictedSimilarity: number; // 系统预测的相似度
  predictedConfidence: number; // 系统预测的置信度
  trueCommand: string; // 用户选择的真实指令
  isCorrect: boolean; // 预测是否正确
  topMatches: Array<{ command: string; similarity: number }>; // 系统的前几个候选
  userFeedback?: string; // 用户的额外反馈
  signalQuality?: number; // 信号质量评分
}

/**
 * 模型性能指标
 */
export interface ModelPerformanceMetrics {
  totalTests: number;
  correctPredictions: number;
  accuracy: number; // 准确率 (0-100)
  
  // 按指令的性能
  commandMetrics: Record<string, {
    testCount: number;
    correctCount: number;
    accuracy: number;
    commonMisclassifications: Record<string, number>; // 常见的错误分类
  }>;
  
  // 按置信度的性能
  confidenceAnalysis: {
    highConfidence: { count: number; accuracy: number }; // >80%
    mediumConfidence: { count: number; accuracy: number }; // 50-80%
    lowConfidence: { count: number; accuracy: number }; // <50%
  };
  
  // 按相似度的性能
  similarityAnalysis: {
    highSimilarity: { count: number; accuracy: number }; // >80%
    mediumSimilarity: { count: number; accuracy: number }; // 50-80%
    lowSimilarity: { count: number; accuracy: number }; // <50%
  };
  
  // 趋势分析
  trend: {
    recentAccuracy: number; // 最近 10 次的准确率
    improvementRate: number; // 改进速率
  };
}

/**
 * 模型改进建议
 */
export interface ImprovementSuggestion {
  type: 'data-collection' | 'model-tuning' | 'feature-engineering' | 'threshold-adjustment';
  priority: 'high' | 'medium' | 'low';
  description: string;
  affectedCommands?: string[];
  expectedImprovement: number; // 预期改进百分比
  actionItems: string[];
}

/**
 * 反馈数据存储
 */
class FeedbackStore {
  private feedbackHistory: TestFeedback[] = [];
  private readonly storageKey = 'emg-model-feedback';
  private readonly maxHistorySize = 1000;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * 添加反馈记录
   */
  addFeedback(feedback: TestFeedback): void {
    this.feedbackHistory.push(feedback);

    // 保持历史记录大小
    if (this.feedbackHistory.length > this.maxHistorySize) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.maxHistorySize);
    }

    this.saveToStorage();
  }

  /**
   * 获取所有反馈记录
   */
  getAllFeedback(): TestFeedback[] {
    return [...this.feedbackHistory];
  }

  /**
   * 获取最近的反馈记录
   */
  getRecentFeedback(count: number = 10): TestFeedback[] {
    return this.feedbackHistory.slice(-count);
  }

  /**
   * 获取特定指令的反馈
   */
  getFeedbackByCommand(command: string): TestFeedback[] {
    return this.feedbackHistory.filter(
      (f) => f.trueCommand === command || f.predictedCommand === command
    );
  }

  /**
   * 清空反馈历史
   */
  clearHistory(): void {
    this.feedbackHistory = [];
    this.saveToStorage();
  }

  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      // 数据保存到IndexedDB（待实现）
      // 目前仅记录日志
      console.log('[反馈系统] 反馈已保存:', this.feedbackHistory.length, '条');
    } catch (err) {
      console.error('Failed to save feedback to storage:', err);
    }
  }

  /**
   * 从本地存储加载
   */
  private loadFromStorage(): void {
    try {
      // 数据从 IndexedDB 加载（待实现）
      console.log('[反馈系统] 反馈数据从 IndexedDB 加载');
    } catch (err) {
      console.error('Failed to load feedback from storage:', err);
    }
  }
}

// 全局反馈存储实例
const feedbackStore = new FeedbackStore();

/**
 * 创建测试反馈记录
 */
export function createTestFeedback(
  predictedCommand: string,
  predictedSimilarity: number,
  predictedConfidence: number,
  topMatches: Array<{ command: string; similarity: number }>,
  signalQuality?: number
): TestFeedback {
  return {
    testId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    predictedCommand,
    predictedSimilarity,
    predictedConfidence,
    trueCommand: '', // 待用户选择
    isCorrect: false, // 待计算
    topMatches,
    signalQuality,
  };
}

/**
 * 提交用户反馈
 */
export function submitUserFeedback(
  feedback: TestFeedback,
  trueCommand: string,
  userComment?: string
): TestFeedback {
  const updatedFeedback: TestFeedback = {
    ...feedback,
    trueCommand,
    isCorrect: feedback.predictedCommand === trueCommand,
    userFeedback: userComment,
  };

  feedbackStore.addFeedback(updatedFeedback);
  return updatedFeedback;
}

/**
 * 计算模型性能指标
 */
export function calculatePerformanceMetrics(
  feedbackList: TestFeedback[]
): ModelPerformanceMetrics {
  if (feedbackList.length === 0) {
    return {
      totalTests: 0,
      correctPredictions: 0,
      accuracy: 0,
      commandMetrics: {},
      confidenceAnalysis: {
        highConfidence: { count: 0, accuracy: 0 },
        mediumConfidence: { count: 0, accuracy: 0 },
        lowConfidence: { count: 0, accuracy: 0 },
      },
      similarityAnalysis: {
        highSimilarity: { count: 0, accuracy: 0 },
        mediumSimilarity: { count: 0, accuracy: 0 },
        lowSimilarity: { count: 0, accuracy: 0 },
      },
      trend: { recentAccuracy: 0, improvementRate: 0 },
    };
  }

  const totalTests = feedbackList.length;
  const correctPredictions = feedbackList.filter((f) => f.isCorrect).length;
  const accuracy = (correctPredictions / totalTests) * 100;

  // 按指令的性能
  const commandMetrics: Record<string, {
    testCount: number;
    correctCount: number;
    accuracy: number;
    commonMisclassifications: Record<string, number>;
  }> = {};

  for (const feedback of feedbackList) {
    const command = feedback.trueCommand;

    if (!commandMetrics[command]) {
      commandMetrics[command] = {
        testCount: 0,
        correctCount: 0,
        accuracy: 0,
        commonMisclassifications: {},
      };
    }

    commandMetrics[command].testCount++;
    if (feedback.isCorrect) {
      commandMetrics[command].correctCount++;
    } else {
      const misclassified = feedback.predictedCommand;
      commandMetrics[command].commonMisclassifications[misclassified] =
        (commandMetrics[command].commonMisclassifications[misclassified] || 0) + 1;
    }

    commandMetrics[command].accuracy =
      (commandMetrics[command].correctCount / commandMetrics[command].testCount) * 100;
  }

  // 按置信度的性能
  const highConfidenceFeedback = feedbackList.filter((f) => f.predictedConfidence > 80);
  const mediumConfidenceFeedback = feedbackList.filter(
    (f) => f.predictedConfidence >= 50 && f.predictedConfidence <= 80
  );
  const lowConfidenceFeedback = feedbackList.filter((f) => f.predictedConfidence < 50);

  const confidenceAnalysis = {
    highConfidence: {
      count: highConfidenceFeedback.length,
      accuracy:
        highConfidenceFeedback.length > 0
          ? (highConfidenceFeedback.filter((f) => f.isCorrect).length /
              highConfidenceFeedback.length) *
            100
          : 0,
    },
    mediumConfidence: {
      count: mediumConfidenceFeedback.length,
      accuracy:
        mediumConfidenceFeedback.length > 0
          ? (mediumConfidenceFeedback.filter((f) => f.isCorrect).length /
              mediumConfidenceFeedback.length) *
            100
          : 0,
    },
    lowConfidence: {
      count: lowConfidenceFeedback.length,
      accuracy:
        lowConfidenceFeedback.length > 0
          ? (lowConfidenceFeedback.filter((f) => f.isCorrect).length /
              lowConfidenceFeedback.length) *
            100
          : 0,
    },
  };

  // 按相似度的性能
  const highSimilarityFeedback = feedbackList.filter((f) => f.predictedSimilarity > 80);
  const mediumSimilarityFeedback = feedbackList.filter(
    (f) => f.predictedSimilarity >= 50 && f.predictedSimilarity <= 80
  );
  const lowSimilarityFeedback = feedbackList.filter((f) => f.predictedSimilarity < 50);

  const similarityAnalysis = {
    highSimilarity: {
      count: highSimilarityFeedback.length,
      accuracy:
        highSimilarityFeedback.length > 0
          ? (highSimilarityFeedback.filter((f) => f.isCorrect).length /
              highSimilarityFeedback.length) *
            100
          : 0,
    },
    mediumSimilarity: {
      count: mediumSimilarityFeedback.length,
      accuracy:
        mediumSimilarityFeedback.length > 0
          ? (mediumSimilarityFeedback.filter((f) => f.isCorrect).length /
              mediumSimilarityFeedback.length) *
            100
          : 0,
    },
    lowSimilarity: {
      count: lowSimilarityFeedback.length,
      accuracy:
        lowSimilarityFeedback.length > 0
          ? (lowSimilarityFeedback.filter((f) => f.isCorrect).length /
              lowSimilarityFeedback.length) *
            100
          : 0,
    },
  };

  // 趋势分析
  const recentFeedback = feedbackList.slice(-10);
  const recentAccuracy =
    recentFeedback.length > 0
      ? (recentFeedback.filter((f) => f.isCorrect).length / recentFeedback.length) * 100
      : 0;

  const improvementRate =
    feedbackList.length >= 20
      ? ((recentAccuracy -
          (feedbackList
            .slice(-20, -10)
            .filter((f) => f.isCorrect).length /
            Math.max(1, feedbackList.slice(-20, -10).length)) *
            100) /
          100) *
        100
      : 0;

  return {
    totalTests,
    correctPredictions,
    accuracy,
    commandMetrics,
    confidenceAnalysis,
    similarityAnalysis,
    trend: {
      recentAccuracy,
      improvementRate,
    },
  };
}

/**
 * 生成改进建议
 */
export function generateImprovementSuggestions(
  metrics: ModelPerformanceMetrics,
  allCommands: string[]
): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = [];

  // 1. 整体准确率过低
  if (metrics.accuracy < 60) {
    suggestions.push({
      type: 'data-collection',
      priority: 'high',
      description: '整体识别准确率过低（<60%），需要收集更多高质量的训练数据',
      expectedImprovement: 20,
      actionItems: [
        '为每个指令收集至少 10-20 个高质量采集',
        '确保采集环境一致',
        '检查电极放置位置',
      ],
    });
  }

  // 2. 特定指令准确率低
  const lowAccuracyCommands = Object.entries(metrics.commandMetrics)
    .filter(([_, data]) => data.accuracy < 70)
    .map(([cmd]) => cmd);

  if (lowAccuracyCommands.length > 0) {
    suggestions.push({
      type: 'data-collection',
      priority: 'high',
      description: `指令 ${lowAccuracyCommands.join(', ')} 的识别准确率低于 70%`,
      affectedCommands: lowAccuracyCommands,
      expectedImprovement: 15,
      actionItems: [
        `为以下指令补充采集：${lowAccuracyCommands.join(', ')}`,
        '检查这些指令是否容易混淆',
        '调整特征提取参数',
      ],
    });
  }

  // 3. 常见的误分类对
  const misclassificationPairs: Array<{
    from: string;
    to: string;
    count: number;
  }> = [];

  for (const [cmd, data] of Object.entries(metrics.commandMetrics)) {
    for (const [misclassified, count] of Object.entries(
      data.commonMisclassifications
    )) {
      if (count > 2) {
        misclassificationPairs.push({
          from: cmd,
          to: misclassified,
          count,
        });
      }
    }
  }

  if (misclassificationPairs.length > 0) {
    misclassificationPairs.sort((a, b) => b.count - a.count);
    const topPair = misclassificationPairs[0];

    suggestions.push({
      type: 'feature-engineering',
      priority: 'high',
      description: `指令 "${topPair.from}" 经常被误分类为 "${topPair.to}"（${topPair.count} 次）`,
      affectedCommands: [topPair.from, topPair.to],
      expectedImprovement: 10,
      actionItems: [
        `分析 "${topPair.from}" 和 "${topPair.to}" 的特征差异`,
        '调整特征权重或添加新的区分特征',
        '检查这两个指令的发音是否相似',
      ],
    });
  }

  // 4. 置信度与准确率不匹配
  if (
    metrics.confidenceAnalysis.highConfidence.accuracy <
    metrics.confidenceAnalysis.lowConfidence.accuracy
  ) {
    suggestions.push({
      type: 'model-tuning',
      priority: 'medium',
      description: '高置信度预测的准确率低于低置信度预测，表明置信度计算有问题',
      expectedImprovement: 5,
      actionItems: [
        '调整置信度计算公式',
        '检查相似度阈值设置',
        '验证特征向量的质量',
      ],
    });
  }

  // 5. 低相似度预测的准确率高
  if (
    metrics.similarityAnalysis.lowSimilarity.accuracy >
    metrics.similarityAnalysis.highSimilarity.accuracy
  ) {
    suggestions.push({
      type: 'threshold-adjustment',
      priority: 'medium',
      description: '低相似度预测的准确率高于高相似度预测，需要调整相似度阈值',
      expectedImprovement: 8,
      actionItems: [
        '降低相似度阈值',
        '检查特征归一化方法',
        '验证 DTW 距离计算',
      ],
    });
  }

  // 6. 改进趋势
  if (metrics.trend.improvementRate > 5) {
    suggestions.push({
      type: 'data-collection',
      priority: 'low',
      description: `系统正在改进（改进速率 ${metrics.trend.improvementRate.toFixed(1)}%/10次），继续收集反馈数据`,
      expectedImprovement: 10,
      actionItems: [
        '继续进行测试和反馈',
        '定期评估模型性能',
        '根据反馈调整参数',
      ],
    });
  }

  return suggestions;
}

/**
 * 获取全局反馈历史
 */
export function getFeedbackHistory(): TestFeedback[] {
  return feedbackStore.getAllFeedback();
}

/**
 * 获取全局最近反馈
 */
export function getRecentFeedback(count: number = 10): TestFeedback[] {
  return feedbackStore.getRecentFeedback(count);
}

/**
 * 清空全局反馈历史
 */
export function clearFeedbackHistory(): void {
  feedbackStore.clearHistory();
}

/**
 * 导出反馈数据为 JSON
 */
export function exportFeedbackAsJSON(): string {
  const feedback = feedbackStore.getAllFeedback();
  return JSON.stringify(feedback, null, 2);
}

/**
 * 导出反馈数据为 CSV
 */
export function exportFeedbackAsCSV(): string {
  const feedback = feedbackStore.getAllFeedback();

  if (feedback.length === 0) {
    return 'No feedback data';
  }

  const headers = [
    'Test ID',
    'Timestamp',
    'Predicted Command',
    'Predicted Similarity',
    'Predicted Confidence',
    'True Command',
    'Is Correct',
    'User Feedback',
  ];

  const rows = feedback.map((f) => [
    f.testId,
    f.timestamp.toISOString(),
    f.predictedCommand,
    f.predictedSimilarity,
    f.predictedConfidence,
    f.trueCommand,
    f.isCorrect ? 'Yes' : 'No',
    f.userFeedback || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ].join('\n');

  return csv;
}

/**
 * 模型自动纠偏系统
 * 
 * 功能：
 * - 根据用户反馈自动调整模型特征
 * - 强化正确识别的特征
 * - 纠偏错误识别的特征
 * - 跟踪特征演变过程
 */

import { emgDatabase } from './db';
// ✅ 修复问题5：CommandTemplate 类型定义
export interface CommandTemplate {
  commandName: string;
  features: number[];
  meanFeatureVector?: number[];
  metadata?: {
    createdAt?: number;
    updatedAt?: number;
    samples?: number;
  };
}

export interface CalibrationRecord {
  timestamp: number;
  predictedCommand: string;
  actualCommand: string;
  isCorrect: boolean;
  similarity: number;
  confidence: number;
  adjustmentApplied: string;
}

export interface FeatureAdjustment {
  commandName: string;
  adjustmentType: 'reinforce' | 'correct';
  reason: string;
  adjustmentStrength: number; // 0-1
  affectedFeatures: string[];
  timestamp: number;
}

/**
 * 获取所有纠偏记录
 */
export function getCalibrationRecords(): CalibrationRecord[] {
  // ✅ 修复21修正：不使用localStorage，改为IndexedDB
  // 保持同步接口，但数据来自缓存
  // 此函数为同步，但数据实际存储在IndexedDB中
  // 实时数据需要通过其他方式获取
  const cached: CalibrationRecord[] = [];
  
  // 从全局缓存中读取（如果存在）
  if (typeof window !== 'undefined' && (window as any).__calibrationCache) {
    return (window as any).__calibrationCache;
  }
  
  return cached;
}

/**
 * 保存纠偏记录
 */
export function saveCalibrationRecord(record: CalibrationRecord): void {
  // ✅ 修夅21修正：不使用localStorage，改为IndexedDB
  // 修复2修正：应写入 feedbackData 而不是 recognitionRecords
  if (typeof window !== 'undefined') {
    if (!(window as any).__calibrationCache) {
      (window as any).__calibrationCache = [];
    }
    (window as any).__calibrationCache.push(record);
    
    // 同时异步保存到 feedbackData 而不是 recognitionRecords
    emgDatabase.saveFeedbackData({
      key: `calib-${Date.now()}`,
      timestamp: record.timestamp,
      recordType: 'calibration',
      predictedCommand: record.predictedCommand,
      actualCommand: record.actualCommand,
      isCorrect: record.isCorrect,
      similarity: record.similarity,
      confidence: record.confidence,
      adjustmentApplied: record.adjustmentApplied,
      userId: (record as any).userId || 'unknown',
    }).catch((err: any) => {
      console.error('[saveCalibrationRecord] IndexedDB保存失败:', err);
    });
  }
}

/**
 * 获取所有特征调整记录
 */
export function getFeatureAdjustments(): FeatureAdjustment[] {
  // ✅ 修复21修正：不使用localStorage，改为IndexedDB
  // 保持同步接口，但数据来自缓存
  if (typeof window !== 'undefined' && (window as any).__featureAdjustmentsCache) {
    return (window as any).__featureAdjustmentsCache;
  }
  return [];
}

/**
 * 保存特征调整记录
 */
export async function saveFeatureAdjustment(adjustment: FeatureAdjustment): Promise<void> {
  // ✅ Codex修复：特征调整写入 feedbackData，不写入 auditLogs
  if (typeof window !== 'undefined') {
    if (!(window as any).__featureAdjustmentsCache) {
      (window as any).__featureAdjustmentsCache = [];
    }
    (window as any).__featureAdjustmentsCache.push(adjustment);
    
    // 异步保存到 feedbackData
    try {
      await emgDatabase.saveFeedbackData({
        key: `feat-adj-${Date.now()}`,
        timestamp: Date.now(),
        recordType: 'featureAdjustment',
        commandName: adjustment.commandName,
        adjustmentType: adjustment.adjustmentType,
        reason: adjustment.reason,
        adjustmentStrength: adjustment.adjustmentStrength,
        affectedFeatures: adjustment.affectedFeatures,
        userId: (adjustment as any).userId || 'unknown',
      });
    } catch (err: any) {
      console.error('[saveFeatureAdjustment] IndexedDB保存失败:', err);
    }
  }
}

/**
 * 处理识别结果反馈并进行纠偏
 */
export async function processRecognitionFeedback(
  predictedCommand: string,
  actualCommand: string,
  similarity: number,
  confidence: number,
  templates: CommandTemplate[]
): Promise<CalibrationRecord> {
  const isCorrect = predictedCommand === actualCommand;
  
  // 创建纠偏记录
  const record: CalibrationRecord = {
    timestamp: Date.now(),
    predictedCommand,
    actualCommand,
    isCorrect,
    similarity,
    confidence,
    adjustmentApplied: '',
  };

  // 根据是否正确进行不同的调整
  if (isCorrect) {
    // 识别正确：强化特征
    record.adjustmentApplied = 'reinforce';
    await reinforceFeatures(actualCommand, templates, similarity, confidence);
  } else {
    // 识别错误：纠偏特征
    record.adjustmentApplied = 'correct';
    await correctFeatures(
      predictedCommand,
      actualCommand,
      templates,
      similarity,
      confidence
    );
  }

  // 保存纠偏记录
  saveCalibrationRecord(record);

  return record;
}

/**
 * 强化正确识别的特征
 */
async function reinforceFeatures(
  commandName: string,
  templates: CommandTemplate[],
  similarity: number,
  confidence: number
): Promise<void> {
  const template = templates.find((t) => t.commandName === commandName);
  if (!template) return;

  // 计算强化强度（基于相似度和置信度）
  const reinforcementStrength = Math.min(
    1,
    (similarity + confidence) / 200 * 0.3 // 最多强化 30%
  );

  // 强化特征（更新平均特征向量）
  if (template.meanFeatureVector) {
    template.meanFeatureVector = template.meanFeatureVector.map(
      (f: number) => f * (1 + reinforcementStrength)
    );
  }

  // 记录特征调整
  const adjustment: FeatureAdjustment = {
    commandName,
    adjustmentType: 'reinforce',
    reason: `识别正确，相似度 ${similarity}%，置信度 ${confidence}%`,
    adjustmentStrength: reinforcementStrength,
    affectedFeatures: ['all'],
    timestamp: Date.now(),
  };

  await saveFeatureAdjustment(adjustment);

  // 保存更新后的模板
  saveUpdatedTemplate(template);
}

/**
 * 纠偏错误识别的特征
 */
async function correctFeatures(
  predictedCommand: string,
  actualCommand: string,
  templates: CommandTemplate[],
  similarity: number,
  confidence: number
): Promise<void> {
  const predictedTemplate = templates.find((t) => t.commandName === predictedCommand);
  const actualTemplate = templates.find((t) => t.commandName === actualCommand);

  if (!predictedTemplate || !actualTemplate) return;

  // 计算纠偏强度（基于错误的严重程度）
  // 相似度越高，说明特征越接近，需要更强的纠偏
  const correctionStrength = Math.min(
    1,
    (similarity / 100) * 0.5 // 最多纠偏 50%
  );

  // 调整预测命令的特征（减弱）
  if (predictedTemplate.meanFeatureVector) {
    predictedTemplate.meanFeatureVector = predictedTemplate.meanFeatureVector.map(
      (f: number) => f * (1 - correctionStrength * 0.5)
    );
  }

  // 调整实际命令的特征（增强）
  if (actualTemplate.meanFeatureVector) {
    actualTemplate.meanFeatureVector = actualTemplate.meanFeatureVector.map(
      (f: number) => f * (1 + correctionStrength * 0.5)
    );
  }

  // 记录特征调整
  const adjustment: FeatureAdjustment = {
    commandName: actualCommand,
    adjustmentType: 'correct',
    reason: `识别错误，误识别为 ${predictedCommand}，相似度 ${similarity}%`,
    adjustmentStrength: correctionStrength,
    affectedFeatures: ['all'],
    timestamp: Date.now(),
  };

  await saveFeatureAdjustment(adjustment);

  // 保存更新后的模板
  saveUpdatedTemplate(predictedTemplate);
  saveUpdatedTemplate(actualTemplate);
}

/**
 * 保存更新后的模板
 * 修复1修正：改为调用 saveCommandTemplate 而不是 saveModel
 */
async function saveUpdatedTemplate(template: CommandTemplate): Promise<void> {
  try {
    // 保存指令模板，不覆盖 CNN 模型
    await emgDatabase.saveCommandTemplate(template);
  } catch (err) {
    console.error('Failed to save updated template:', err);
  }
}

/**
 * 计算纠偏效果统计
 */
export function getCalibrationStatistics() {
  const records = getCalibrationRecords();
  const adjustments = getFeatureAdjustments();

  if (records.length === 0) {
    return {
      totalRecords: 0,
      correctCount: 0,
      accuracy: 0,
      reinforcementCount: 0,
      correctionCount: 0,
      averageSimilarity: 0,
      averageConfidence: 0,
      recentAccuracy: 0,
      improvementTrend: 0,
    };
  }

  // 计算总体准确率
  const correctCount = records.filter((r) => r.isCorrect).length;
  const accuracy = (correctCount / records.length) * 100;

  // 计算调整统计
  const reinforcementCount = adjustments.filter(
    (a) => a.adjustmentType === 'reinforce'
  ).length;
  const correctionCount = adjustments.filter(
    (a) => a.adjustmentType === 'correct'
  ).length;

  // 计算平均相似度和置信度
  const averageSimilarity =
    records.reduce((sum, r) => sum + r.similarity, 0) / records.length;
  const averageConfidence =
    records.reduce((sum, r) => sum + r.confidence, 0) / records.length;

  // 计算最近 10 条记录的准确率
  const recentRecords = records.slice(-10);
  const recentCorrectCount = recentRecords.filter((r) => r.isCorrect).length;
  const recentAccuracy = (recentCorrectCount / recentRecords.length) * 100;

  // 计算改进趋势（最近 10 条 vs 之前 10 条）
  let improvementTrend = 0;
  if (records.length >= 20) {
    const previousRecords = records.slice(-20, -10);
    const previousCorrectCount = previousRecords.filter((r) => r.isCorrect).length;
    const previousAccuracy = (previousCorrectCount / previousRecords.length) * 100;
    improvementTrend = recentAccuracy - previousAccuracy;
  }

  return {
    totalRecords: records.length,
    correctCount,
    accuracy,
    reinforcementCount,
    correctionCount,
    averageSimilarity: Math.round(averageSimilarity * 10) / 10,
    averageConfidence: Math.round(averageConfidence * 10) / 10,
    recentAccuracy,
    improvementTrend: Math.round(improvementTrend * 10) / 10,
  };
}

/**
 * 获取按指令的纠偏统计
 */
export function getCalibrationByCommand() {
  const records = getCalibrationRecords();
  const stats: Record<string, any> = {};

  records.forEach((record) => {
    if (!stats[record.actualCommand]) {
      stats[record.actualCommand] = {
        totalTests: 0,
        correctCount: 0,
        accuracy: 0,
        averageSimilarity: 0,
        averageConfidence: 0,
        reinforcements: 0,
        corrections: 0,
        commonMisclassifications: {} as Record<string, number>,
      };
    }

    stats[record.actualCommand].totalTests++;
    if (record.isCorrect) {
      stats[record.actualCommand].correctCount++;
    } else {
      // 记录常见的误分类
      const predicted = record.predictedCommand;
      stats[record.actualCommand].commonMisclassifications[predicted] =
        (stats[record.actualCommand].commonMisclassifications[predicted] || 0) + 1;
    }

    stats[record.actualCommand].averageSimilarity += record.similarity;
    stats[record.actualCommand].averageConfidence += record.confidence;
  });

  // 计算准确率和平均值
  Object.keys(stats).forEach((cmd) => {
    const stat = stats[cmd];
    stat.accuracy = (stat.correctCount / stat.totalTests) * 100;
    stat.averageSimilarity = Math.round((stat.averageSimilarity / stat.totalTests) * 10) / 10;
    stat.averageConfidence = Math.round((stat.averageConfidence / stat.totalTests) * 10) / 10;
  });

  // 统计调整数
  const adjustments = getFeatureAdjustments();
  adjustments.forEach((adj) => {
    if (stats[adj.commandName]) {
      if (adj.adjustmentType === 'reinforce') {
        stats[adj.commandName].reinforcements++;
      } else {
        stats[adj.commandName].corrections++;
      }
    }
  });

  return stats;
}

/**
 * 导出纠偏报告为 JSON
 */
export function exportCalibrationReportAsJSON(): string {
  const records = getCalibrationRecords();
  const adjustments = getFeatureAdjustments();
  const statistics = getCalibrationStatistics();
  const byCommand = getCalibrationByCommand();

  const report = {
    exportTime: new Date().toISOString(),
    statistics,
    byCommand,
    records,
    adjustments,
  };

  return JSON.stringify(report, null, 2);
}

/**
 * 导出纠偏报告为 CSV
 */
export function exportCalibrationReportAsCSV(): string {
  const records = getCalibrationRecords();
  
  if (records.length === 0) {
    return 'No calibration records';
  }

  // CSV 头
  const headers = [
    'Timestamp',
    'Predicted Command',
    'Actual Command',
    'Is Correct',
    'Similarity',
    'Confidence',
    'Adjustment Applied',
  ];

  // CSV 行
  const rows = records.map((record) => [
    new Date(record.timestamp).toISOString(),
    record.predictedCommand,
    record.actualCommand,
    record.isCorrect ? 'Yes' : 'No',
    record.similarity,
    record.confidence,
    record.adjustmentApplied,
  ]);

  // 合并
  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  return csv;
}

/**
 * 清除所有纠偏记录
 */
export function clearCalibrationData(): void {
  // ✅ 修复：只清除反馈/校准数据，不清除 recognitionRecords
  if (typeof window !== 'undefined') {
    (window as any).__calibrationCache = [];
    (window as any).__featureAdjustmentsCache = [];
    
    // 异步清除 IndexedDB 中的校准数据和反馈数据
    // 但不清除 recognitionRecords（识别历史）
    Promise.all([
      emgDatabase.clearCalibration(),
      // 清除 feedbackData 中的反馈记录
      (async () => {
        const db = emgDatabase.getDb();
        if (db) {
          return new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(['feedbackData'], 'readwrite');
            const store = transaction.objectStore('feedbackData');
            store.clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });
        }
      })()
    ]).catch((err: any) => {
      console.error('[clearCalibrationData] 清除校准/反馈数据失败:', err);
    });
  }
}

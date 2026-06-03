/**
 * 自适应阈值学习系统
 * 
 * 功能：
 * - 根据多次采集自动调整质量检测阈值
 * - 学习用户的信号特性
 * - 动态调整最小有效长度、置信度、峰值能量等阈值
 */

export interface ThresholdMetrics {
  validLength: number;      // 有效信号长度（样本数）
  confidence: number;       // 置信度（0-1）
  peakEnergy: number;       // 峰值能量
  timestamp: Date;
}

export interface AdaptiveThresholds {
  minValidLength: number;   // 最小有效长度
  minConfidence: number;    // 最小置信度
  minPeakEnergy: number;    // 最小峰值能量
  learningCount: number;    // 学习样本数
  lastUpdated: Date;
}

const DEFAULT_THRESHOLDS: AdaptiveThresholds = {
  minValidLength: 100,
  minConfidence: 0.2,
  minPeakEnergy: 0.1,
  learningCount: 0,
  lastUpdated: new Date(),
};

/**
 * 计算统计数据
 */
function calculateStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev };
}

/**
 * 根据收集的指标更新自适应阈值
 */
export function updateAdaptiveThresholds(
  metrics: ThresholdMetrics[],
  currentThresholds: AdaptiveThresholds
): AdaptiveThresholds {
  if (metrics.length < 5) {
    // 样本不足，不更新
    return currentThresholds;
  }

  // 提取各个指标
  const validLengths = metrics.map((m) => m.validLength);
  const confidences = metrics.map((m) => m.confidence);
  const peakEnergies = metrics.map((m) => m.peakEnergy);

  // 计算统计数据
  const lengthStats = calculateStats(validLengths);
  const confidenceStats = calculateStats(confidences);
  const energyStats = calculateStats(peakEnergies);

  // 使用平均值 - 1 标准差作为新阈值（保留 68% 的数据）
  // 或者使用 25 百分位数（保留 75% 的数据）
  const newThresholds: AdaptiveThresholds = {
    minValidLength: Math.max(
      50, // 最小不低于 50
      Math.round(lengthStats.mean - lengthStats.stdDev)
    ),
    minConfidence: Math.max(
      0.1, // 最小不低于 0.1
      Math.round((confidenceStats.mean - confidenceStats.stdDev) * 100) / 100
    ),
    minPeakEnergy: Math.max(
      0.05, // 最小不低于 0.05
      Math.round((energyStats.mean - energyStats.stdDev) * 1000) / 1000
    ),
    learningCount: metrics.length,
    lastUpdated: new Date(),
  };

  logger.log(
    `自适应阈值已更新: ` +
      `长度=${newThresholds.minValidLength}, ` +
      `置信度=${newThresholds.minConfidence}, ` +
      `能量=${newThresholds.minPeakEnergy}`
  );

  return newThresholds;
}

/**
 * 从 IndexedDB 加载自适应阈值
 */
export async function loadAdaptiveThresholds(
  commandName: string
): Promise<AdaptiveThresholds> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(['THRESHOLDS'], 'readonly');
    const store = tx.objectStore('THRESHOLDS');

    return new Promise((resolve) => {
      const request = store.get(commandName);
      request.onsuccess = () => {
        if (request.result) {
          resolve({
            ...request.result,
            lastUpdated: new Date(request.result.lastUpdated),
          });
        } else {
          resolve(DEFAULT_THRESHOLDS);
        }
      };
      request.onerror = () => {
        logger.warn(`无法加载自适应阈值`);
        resolve(DEFAULT_THRESHOLDS);
      };
    });
  } catch (error) {
    logger.warn(`无法加载自适应阈值: ${error}`);
    return DEFAULT_THRESHOLDS;
  }
}

/**
 * 保存自适应阈值到 IndexedDB
 */
export async function saveAdaptiveThresholds(
  commandName: string,
  thresholds: AdaptiveThresholds
): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction([DB_CONFIG.STORES.ADAPTIVE_THRESHOLDS], 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORES.ADAPTIVE_THRESHOLDS);
    
    // ✅ 修改4：补充key字段并包装Promise
    await new Promise<void>((resolve, reject) => {
      const request = store.put({
        key: commandName,
        ...thresholds,
        commandName,
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    logger.log(`自适应阈值已保存: ${commandName}`);
  } catch (error) {
    logger.error(`无法保存自适应阈值: ${error}`);
  }
}

/**
 * 打开数据库
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // ✅ 修改4：使用DB_CONFIG中的数据库版本
    const request = indexedDB.open(DB_CONFIG.DB_NAME, DB_CONFIG.DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建 ADAPTIVE_THRESHOLDS 表
      if (!db.objectStoreNames.contains(DB_CONFIG.STORES.ADAPTIVE_THRESHOLDS)) {
        db.createObjectStore(DB_CONFIG.STORES.ADAPTIVE_THRESHOLDS, { keyPath: 'key' });
      }
    };
  });
}

// 导入 logger
import { logger } from './logger';
import { DB_CONFIG } from '@/../../shared/const';

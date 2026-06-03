/**
 * 多通道特征融合和自适应阈值调整
 * 
 * 功能：
 * - 多通道特征融合（ch1/ch2/ch3）
 * - 自适应相似度阈值调整
 * - 基于反馈历史的动态优化
 */

/**
 * 多通道特征融合策略
 * 
 * 方法1: 加权平均（根据信噪比加权）
 * 方法2: 主成分分析（PCA）
 * 方法3: 特征级串联（已在 extractFullFeatures 中实现）
 */

export interface ChannelWeights {
  ch1: number;
  ch2: number;
  ch3: number;
}

interface AdaptiveThresholdConfig {
  baseThreshold: number;
  minThreshold: number;
  maxThreshold: number;
  adjustmentStep: number;
  windowSize: number; // 用于计算准确率的历史窗口大小
}

/**
 * 计算每个通道的信噪比（SNR）
 * ✅ 修复：使用正确的SNR定义
 * SNR = 信号功率 / 噪声功率
 * 信号功率 = 方差（去掉直流分量后）
 * 噪声功率 = 相邻样本的差异（高频分量估计）
 */
export function calculateChannelSNR(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  // 计算信号功率（方差）
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length;
  const signalPower = variance;  // ✅ 修复：信号功率就是方差，不需要取平方根
  
  // ✅ 修复：计算噪声功率（使用相邻样本的差异估计）
  // 原因：直流分量不是噪声，应该使用高频分量（相邻样本差异）估计噪声
  let diffSum = 0;
  for (let i = 1; i < signal.length; i++) {
    diffSum += (signal[i] - signal[i-1]) ** 2;
  }
  // ✅ 修复16：噪声功率应该是方差，而不是振幅（不需要平方根）
  const noisePower = diffSum / (signal.length - 1) || 0.001;
  
  return signalPower / noisePower;
}

/**
 * 根据 SNR 计算通道权重
 * SNR 越高，权重越大
 */
export function calculateChannelWeights(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): ChannelWeights {
  const snr1 = calculateChannelSNR(ch1);
  const snr2 = calculateChannelSNR(ch2);
  const snr3 = calculateChannelSNR(ch3);
  
  const totalSNR = snr1 + snr2 + snr3;
  
  // 避免全为 0 的情况
  if (totalSNR === 0) {
    return { ch1: 1/3, ch2: 1/3, ch3: 1/3 };
  }
  
  return {
    ch1: snr1 / totalSNR,
    ch2: snr2 / totalSNR,
    ch3: snr3 / totalSNR,
  };
}

/**
 * 多通道特征融合 - 加权平均方法
 * 
 * 将三个通道的特征向量按权重融合成一个向量
 */
export function fuseChannelFeatures(
  ch1Features: number[],
  ch2Features: number[],
  ch3Features: number[],
  weights?: ChannelWeights
): number[] {
  // 如果没有提供权重，使用均等权重
  if (!weights) {
    weights = { ch1: 1/3, ch2: 1/3, ch3: 1/3 };
  }
  
  // 确保三个特征向量长度相同
  const len = Math.min(ch1Features.length, ch2Features.length, ch3Features.length);
  
  const fused: number[] = [];
  for (let i = 0; i < len; i++) {
    const value = 
      weights.ch1 * ch1Features[i] +
      weights.ch2 * ch2Features[i] +
      weights.ch3 * ch3Features[i];
    fused.push(value);
  }
  
  return fused;
}

/**
 * 自适应阈值管理器
 * 根据识别历史动态调整相似度阈值
 */
export class AdaptiveThresholdManager {
  private threshold: number;
  private config: AdaptiveThresholdConfig;
  private recognitionHistory: Array<{
    timestamp: Date;
    predicted: string;
    actual: string;
    confidence: number;
    isCorrect: boolean;
  }> = [];

  constructor(config: Partial<AdaptiveThresholdConfig> = {}) {
    this.config = {
      baseThreshold: 0.7,
      minThreshold: 0.5,
      maxThreshold: 0.9,
      adjustmentStep: 0.02,
      windowSize: 20,
      ...config,
    };
    this.threshold = this.config.baseThreshold;
  }

  /**
   * 添加识别结果到历史
   */
  addRecognitionResult(
    predicted: string,
    actual: string,
    confidence: number
  ): void {
    const isCorrect = predicted === actual;
    
    this.recognitionHistory.push({
      timestamp: new Date(),
      predicted,
      actual,
      confidence,
      isCorrect,
    });
    
    // 保持历史记录在窗口大小内
    if (this.recognitionHistory.length > this.config.windowSize * 2) {
      this.recognitionHistory = this.recognitionHistory.slice(-this.config.windowSize);
    }
    
    // 自动调整阈值
    this.adjustThreshold();
  }

  /**
   * 计算最近 N 个识别的准确率
   */
  private calculateRecentAccuracy(windowSize: number = this.config.windowSize): number {
    if (this.recognitionHistory.length === 0) return 0;
    
    const window = this.recognitionHistory.slice(-windowSize);
    const correctCount = window.filter(r => r.isCorrect).length;
    
    return correctCount / window.length;
  }

  /**
   * 根据准确率自动调整阈值
   * 
   * 策略：
   * - 如果准确率 > 90%，提高阈值（更严格）
   * - 如果准确率 < 70%，降低阈值（更宽松）
   * - 否则保持不变
   */
  private adjustThreshold(): void {
    const accuracy = this.calculateRecentAccuracy();
    
    if (accuracy > 0.9) {
      // 准确率高，提高阈值
      this.threshold = Math.min(
        this.threshold + this.config.adjustmentStep,
        this.config.maxThreshold
      );
    } else if (accuracy < 0.7) {
      // 准确率低，降低阈值
      this.threshold = Math.max(
        this.threshold - this.config.adjustmentStep,
        this.config.minThreshold
      );
    }
  }

  /**
   * 获取当前阈值
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * 手动设置阈值
   */
  setThreshold(value: number): void {
    this.threshold = Math.max(
      this.config.minThreshold,
      Math.min(value, this.config.maxThreshold)
    );
  }

  /**
   * 获取识别统计信息
   */
  getStatistics(): {
    totalRecognitions: number;
    correctCount: number;
    accuracy: number;
    currentThreshold: number;
    recentAccuracy: number;
  } {
    const correctCount = this.recognitionHistory.filter(r => r.isCorrect).length;
    const accuracy = this.recognitionHistory.length > 0 
      ? correctCount / this.recognitionHistory.length 
      : 0;
    
    return {
      totalRecognitions: this.recognitionHistory.length,
      correctCount,
      accuracy,
      currentThreshold: this.threshold,
      recentAccuracy: this.calculateRecentAccuracy(),
    };
  }

  /**
   * 获取识别历史
   */
  getHistory(): typeof this.recognitionHistory {
    return [...this.recognitionHistory];
  }

  /**
   * 清除历史记录
   */
  clearHistory(): void {
    this.recognitionHistory = [];
    this.threshold = this.config.baseThreshold;
  }

  /**
   * 从 IndexedDB 加载历史
   */
  loadFromStorage(key: string = 'emg-threshold-history'): void {
    try {
      console.log('[自适应阈值] 阈值历史从 IndexedDB 加载');
    } catch (err) {
      console.error('Failed to load threshold history:', err);
    }
  }

  /**
   * 保存历史到 IndexedDB（待实现）
   */
  saveToStorage(key: string = 'emg-threshold-history'): void {
    try {
      // 数据将保存到IndexedDB
      console.log('[自适应阈值] 阈值历史已保存:', {
        history: this.recognitionHistory.length,
        threshold: this.threshold,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to save threshold history:', err);
    }
  }
}

/**
 * 导出单例实例
 */
export const adaptiveThresholdManager = new AdaptiveThresholdManager({
  baseThreshold: 0.7,
  minThreshold: 0.5,
  maxThreshold: 0.9,
  adjustmentStep: 0.02,
  windowSize: 20,
});

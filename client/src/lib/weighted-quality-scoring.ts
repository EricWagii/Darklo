/**
 * 四维加权质量评分模块
 * 
 * 基于四个关键维度计算波形质量评分：
 * 1. 裁剪置信度（40%）- 裁剪算法对结果的信心
 * 2. 信号能量（20%）- 信号强度（RMS）
 * 3. 信号方差（20%）- 信号变化性
 * 4. 信噪比（20%）- 信号与噪声的比率
 * 
 * 设计原则：
 * - 每个维度都有明确的物理意义
 * - 权重基于实验数据和专家意见
 * - 支持配置调整权重
 * - 评分范围 0-1，便于比较
 */

/**
 * 四维加权评分配置
 * 
 * 权重说明：
 * - croppingConfidence (0.4): 最重要，决定了裁剪的可靠性
 * - signalEnergy (0.2): 信号强度，反映肌电信号的幅度
 * - signalVariance (0.2): 信号变化性，反映肌肉活动的复杂度
 * - snr (0.2): 信噪比，反映信号质量
 * 
 * 总权重 = 1.0
 */
export const WEIGHTED_QUALITY_CONFIG = {
  // 权重配置
  weights: {
    croppingConfidence: 0.4,  // 裁剪置信度权重
    signalEnergy: 0.2,        // 信号能量权重
    signalVariance: 0.2,      // 信号方差权重
    snr: 0.2,                 // 信噪比权重
  },

  // 归一化参考值（用于将原始值转换为 0-1 范围）
  normalization: {
    // 信号能量参考值（RMS）
    // 基于实验数据：典型肌电信号 RMS 在 50-150 微伏之间
    maxEnergy: 150,
    minEnergy: 10,

    // 信号方差参考值
    // 基于实验数据：典型肌电信号方差在 1000-5000 之间
    maxVariance: 5000,
    minVariance: 100,

    // 信噪比参考值（dB）
    // 基于实验数据：典型肌电信号 SNR 在 5-20 dB 之间
    maxSNR: 20,
    minSNR: 0,
  },
};

/**
 * 计算信号能量（RMS）
 */
function calculateSignalEnergy(signal: number[]): number {
  if (signal.length === 0) return 0;
  const sumSquares = signal.reduce((sum, val) => sum + val * val, 0);
  return Math.sqrt(sumSquares / signal.length);
}

/**
 * 计算信号方差
 */
function calculateSignalVariance(signal: number[]): number {
  if (signal.length === 0) return 0;
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((sum, val) => sum + (val - mean) ** 2, 0) / signal.length;
  return variance;
}

/**
 * 计算信噪比（SNR）
 * 
 * SNR = 信号功率 / 噪声功率 (dB)
 * 
 * 估算方法：
 * - 信号功率 = 整个信号的方差
 * - 噪声功率 = 信号起始和结束部分的方差（假设为静息段）
 */
function calculateSNR(signal: number[]): number {
  if (signal.length < 10) return 0;

  // 假设前 10% 和后 10% 是静息段
  const quietLength = Math.floor(signal.length * 0.1);
  const quietStart = signal.slice(0, quietLength);
  const quietEnd = signal.slice(-quietLength);

  // 计算静息段的平均方差（噪声功率）
  const quietStartVar = calculateSignalVariance(quietStart);
  const quietEndVar = calculateSignalVariance(quietEnd);
  const noisePower = (quietStartVar + quietEndVar) / 2;

  // 计算整个信号的方差（信号功率）
  const signalPower = calculateSignalVariance(signal);

  // 避免除以零
  if (noisePower === 0) return 20; // 返回最大 SNR

  // 计算 SNR（dB）
  const snrDb = 10 * Math.log10(signalPower / noisePower);
  return Math.max(0, snrDb);
}

/**
 * 归一化值到 0-1 范围
 */
function normalizeValue(
  value: number,
  min: number,
  max: number
): number {
  if (max <= min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * 四维加权质量评分
 * 
 * @param croppingConfidence 裁剪置信度（0-1）
 * @param waveform 波形数据（三通道）
 * @returns 加权评分（0-1）
 * 
 * @example
 * const score = calculateWeightedQualityScore(0.85, {
 *   ch1: [...],
 *   ch2: [...],
 *   ch3: [...]
 * });
 * // score = 0.75 (75%)
 */
export function calculateWeightedQualityScore(
  croppingConfidence: number,
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] }
): number {
  // 第一维：裁剪置信度（已经是 0-1 范围）
  const croppingScore = croppingConfidence;

  // 第二维：信号能量（三通道平均）
  const energyCh1 = calculateSignalEnergy(waveform.ch1);
  const energyCh2 = calculateSignalEnergy(waveform.ch2);
  const energyCh3 = calculateSignalEnergy(waveform.ch3);
  const avgEnergy = (energyCh1 + energyCh2 + energyCh3) / 3;
  const normalizedEnergy = normalizeValue(
    avgEnergy,
    WEIGHTED_QUALITY_CONFIG.normalization.minEnergy,
    WEIGHTED_QUALITY_CONFIG.normalization.maxEnergy
  );

  // 第三维：信号方差（三通道平均）
  const varianceCh1 = calculateSignalVariance(waveform.ch1);
  const varianceCh2 = calculateSignalVariance(waveform.ch2);
  const varianceCh3 = calculateSignalVariance(waveform.ch3);
  const avgVariance = (varianceCh1 + varianceCh2 + varianceCh3) / 3;
  const normalizedVariance = normalizeValue(
    avgVariance,
    WEIGHTED_QUALITY_CONFIG.normalization.minVariance,
    WEIGHTED_QUALITY_CONFIG.normalization.maxVariance
  );

  // 第四维：信噪比（三通道平均）
  const snrCh1 = calculateSNR(waveform.ch1);
  const snrCh2 = calculateSNR(waveform.ch2);
  const snrCh3 = calculateSNR(waveform.ch3);
  const avgSNR = (snrCh1 + snrCh2 + snrCh3) / 3;
  const normalizedSNR = normalizeValue(
    avgSNR,
    WEIGHTED_QUALITY_CONFIG.normalization.minSNR,
    WEIGHTED_QUALITY_CONFIG.normalization.maxSNR
  );

  // 计算加权评分
  const { weights } = WEIGHTED_QUALITY_CONFIG;
  const overallScore =
    weights.croppingConfidence * croppingScore +
    weights.signalEnergy * normalizedEnergy +
    weights.signalVariance * normalizedVariance +
    weights.snr * normalizedSNR;

  return Math.max(0, Math.min(1, overallScore));
}

/**
 * 获取评分等级
 * 
 * @param score 评分（0-1）
 * @returns 等级（'优秀' | '良好' | '一般' | '较差' | '不可用'）
 */
export function getQualityGrade(score: number): string {
  if (score >= 0.9) return '优秀';
  if (score >= 0.75) return '良好';
  if (score >= 0.6) return '一般';
  if (score >= 0.4) return '较差';
  return '不可用';
}

/**
 * 获取评分对应的颜色
 * 
 * @param score 评分（0-1）
 * @returns 颜色代码
 */
export function getScoreColor(score: number): string {
  if (score >= 0.9) return '#10b981';  // 绿色 - 优秀
  if (score >= 0.75) return '#3b82f6'; // 蓝色 - 良好
  if (score >= 0.6) return '#f59e0b';  // 橙色 - 一般
  if (score >= 0.4) return '#ef5350';  // 浅红 - 较差
  return '#9ca3af';                     // 灰色 - 不可用
}

/**
 * 获取评分对应的建议
 * 
 * @param score 评分（0-1）
 * @returns 建议文本
 */
export function getScoreSuggestion(score: number): string {
  if (score >= 0.9) return '质量优秀，可用于训练';
  if (score >= 0.75) return '质量良好，推荐使用';
  if (score >= 0.6) return '质量一般，可以使用但建议多采集几条';
  if (score >= 0.4) return '质量较差，建议重新采集';
  return '质量不可用，请重新采集';
}

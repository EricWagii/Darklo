/**
 * 特征维度配置模块
 * 
 * 统一定义所有特征的维度，确保代码和文档的一致性
 * 
 * 特征提取流程：
 * 1. 时域特征（8维）：MAV, RMS, ZCR, MAL, IEMG, VAR, WL, SSC
 * 2. 频域特征（30维）：0-250Hz频带，10Hz间隔 = 26个 + 4个统计
 * 3. MFCC特征（13维）：标准MFCC系数
 * 
 * 总维度 = 8 + 30 + 13 = 51维/通道 × 3通道 = 153维
 */

/**
 * 每个通道的特征维度定义
 */
export const FEATURE_DIMS_PER_CHANNEL = {
  // 时域特征（8维）
  TIME_DOMAIN: {
    MAV: 1,           // Mean Absolute Value - 平均绝对值
    RMS: 1,           // Root Mean Square - 均方根
    ZCR: 1,           // Zero Crossing Rate - 过零率
    MAL: 1,           // Mean Absolute Level - 平均绝对水平
    IEMG: 1,          // Integrated EMG - 积分肌电
    VAR: 1,           // Variance - 方差
    WL: 1,            // Waveform Length - 波形长度
    SSC: 1,           // Slope Sign Changes - 斜率符号变化
    TOTAL: 8,
  },

  // 频域特征（30维）
  FREQUENCY_DOMAIN: {
    FREQUENCY_BANDS: 26,  // 0-250Hz，10Hz间隔 = 26个频带
    STATISTICS: 4,        // 统计特征：均值、方差、峰值、能量
    TOTAL: 30,
  },

  // MFCC特征（13维）
  MFCC: {
    COEFFICIENTS: 13,  // 标准MFCC系数
    TOTAL: 13,
  },

  // 每通道总维度
  TOTAL_PER_CHANNEL: 51,  // 8 + 30 + 13
};

/**
 * 三通道总维度
 */
export const TOTAL_FEATURE_DIMS = FEATURE_DIMS_PER_CHANNEL.TOTAL_PER_CHANNEL * 3;  // 153

/**
 * 特征维度索引范围
 */
export const FEATURE_INDEX_RANGES = {
  // 通道1（CH1）
  CH1: {
    TIME_DOMAIN_START: 0,
    TIME_DOMAIN_END: 8,
    FREQUENCY_DOMAIN_START: 8,
    FREQUENCY_DOMAIN_END: 38,
    MFCC_START: 38,
    MFCC_END: 51,
  },

  // 通道2（CH2）
  CH2: {
    TIME_DOMAIN_START: 51,
    TIME_DOMAIN_END: 59,
    FREQUENCY_DOMAIN_START: 59,
    FREQUENCY_DOMAIN_END: 89,
    MFCC_START: 89,
    MFCC_END: 102,
  },

  // 通道3（CH3）
  CH3: {
    TIME_DOMAIN_START: 102,
    TIME_DOMAIN_END: 110,
    FREQUENCY_DOMAIN_START: 110,
    FREQUENCY_DOMAIN_END: 140,
    MFCC_START: 140,
    MFCC_END: 153,
  },
};

/**
 * 时域特征名称
 */
export const TIME_DOMAIN_FEATURE_NAMES = [
  'MAV',      // Mean Absolute Value
  'RMS',      // Root Mean Square
  'ZCR',      // Zero Crossing Rate
  'MAL',      // Mean Absolute Level
  'IEMG',     // Integrated EMG
  'VAR',      // Variance
  'WL',       // Waveform Length
  'SSC',      // Slope Sign Changes
];

/**
 * 频域特征名称
 */
export const FREQUENCY_DOMAIN_FEATURE_NAMES = [
  // 26个频带（0-250Hz，10Hz间隔）
  ...Array.from({ length: 26 }, (_, i) => `FB${i * 10}-${(i + 1) * 10}`),
  // 4个统计特征
  'FREQ_MEAN',
  'FREQ_VAR',
  'FREQ_PEAK',
  'FREQ_ENERGY',
];

/**
 * MFCC特征名称
 */
export const MFCC_FEATURE_NAMES = Array.from(
  { length: 13 },
  (_, i) => `MFCC${i}`
);

/**
 * 获取特征名称
 * 
 * @param index 特征索引（0-152）
 * @returns 特征名称
 */
export function getFeatureName(index: number): string {
  if (index < 0 || index >= TOTAL_FEATURE_DIMS) {
    return 'UNKNOWN';
  }

  // 确定通道
  let channelIndex = Math.floor(index / FEATURE_DIMS_PER_CHANNEL.TOTAL_PER_CHANNEL);
  let localIndex = index % FEATURE_DIMS_PER_CHANNEL.TOTAL_PER_CHANNEL;
  const channelName = ['CH1', 'CH2', 'CH3'][channelIndex];

  // 确定特征类型
  if (localIndex < 8) {
    return `${channelName}_${TIME_DOMAIN_FEATURE_NAMES[localIndex]}`;
  } else if (localIndex < 38) {
    return `${channelName}_${FREQUENCY_DOMAIN_FEATURE_NAMES[localIndex - 8]}`;
  } else {
    return `${channelName}_${MFCC_FEATURE_NAMES[localIndex - 38]}`;
  }
}

/**
 * 获取特征类型
 * 
 * @param index 特征索引（0-152）
 * @returns 特征类型：'TIME_DOMAIN' | 'FREQUENCY_DOMAIN' | 'MFCC'
 */
export function getFeatureType(index: number): string {
  const localIndex = index % FEATURE_DIMS_PER_CHANNEL.TOTAL_PER_CHANNEL;
  if (localIndex < 8) return 'TIME_DOMAIN';
  if (localIndex < 38) return 'FREQUENCY_DOMAIN';
  return 'MFCC';
}

/**
 * 获取特征所属的通道
 * 
 * @param index 特征索引（0-152）
 * @returns 通道号：1 | 2 | 3
 */
export function getFeatureChannel(index: number): number {
  return Math.floor(index / FEATURE_DIMS_PER_CHANNEL.TOTAL_PER_CHANNEL) + 1;
}

/**
 * 验证特征向量维度
 * 
 * @param features 特征向量
 * @returns 是否有效
 */
export function isValidFeatureVector(features: number[]): boolean {
  return features.length === TOTAL_FEATURE_DIMS;
}

/**
 * 打印特征维度摘要
 */
export function printFeatureDimensionsSummary(): void {
  console.log('=== 特征维度配置摘要 ===');
  console.log(`时域特征维度：${FEATURE_DIMS_PER_CHANNEL.TIME_DOMAIN.TOTAL}`);
  console.log(`频域特征维度：${FEATURE_DIMS_PER_CHANNEL.FREQUENCY_DOMAIN.TOTAL}`);
  console.log(`MFCC特征维度：${FEATURE_DIMS_PER_CHANNEL.MFCC.TOTAL}`);
  console.log(`每通道总维度：${FEATURE_DIMS_PER_CHANNEL.TOTAL_PER_CHANNEL}`);
  console.log(`三通道总维度：${TOTAL_FEATURE_DIMS}`);
  console.log('========================');
}

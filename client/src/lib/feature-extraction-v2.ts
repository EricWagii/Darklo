/**
 * 特征提取 V2 - 用于异常检测
 * 
 * 提取8维特征向量用于Mahalanobis距离计算
 */

/**
 * 8维特征向量
 */
export interface FeatureVector {
  // 时域特征
  rmsEnergy: number;           // RMS能量
  peakValue: number;           // 峰值
  zeroCrossingRate: number;    // 过零率
  
  // 频域特征
  spectralCentroid: number;    // 频谱中心
  spectralBandwidth: number;   // 频谱带宽
  
  // 时频特征
  waveformSymmetry: number;    // 波形对称性
  energyDistribution: number;  // 能量分布均匀度
  peakPosition: number;        // 峰值位置（0-1）
}

/**
 * 计算RMS能量
 */
export function computeRMSEnergy(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  const sumSquares = signal.reduce((sum, val) => sum + val * val, 0);
  return Math.sqrt(sumSquares / signal.length);
}

/**
 * 计算峰值
 */
export function computePeakValue(signal: number[]): number {
  if (signal.length === 0) return 0;
  return Math.max(...signal.map(v => Math.abs(v)));
}

/**
 * 计算过零率
 */
export function computeZeroCrossingRate(signal: number[]): number {
  if (signal.length < 2) return 0;
  
  let crossings = 0;
  for (let i = 1; i < signal.length; i++) {
    if ((signal[i] >= 0 && signal[i - 1] < 0) || (signal[i] < 0 && signal[i - 1] >= 0)) {
      crossings++;
    }
  }
  
  return crossings / (signal.length - 1);
}

/**
 * 计算频谱中心（基于简单FFT近似）
 */
export function computeSpectralCentroid(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  // 简单的频域近似：使用能量加权的频率
  let weightedSum = 0;
  let totalEnergy = 0;
  
  for (let i = 0; i < signal.length; i++) {
    const energy = signal[i] * signal[i];
    weightedSum += i * energy;
    totalEnergy += energy;
  }
  
  if (totalEnergy === 0) return 0;
  return weightedSum / totalEnergy / signal.length; // 归一化到0-1
}

/**
 * 计算频谱带宽
 */
export function computeSpectralBandwidth(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  const centroid = computeSpectralCentroid(signal);
  
  let sumSquaredDiff = 0;
  let totalEnergy = 0;
  
  for (let i = 0; i < signal.length; i++) {
    const energy = signal[i] * signal[i];
    const freq = i / signal.length;
    sumSquaredDiff += energy * (freq - centroid) * (freq - centroid);
    totalEnergy += energy;
  }
  
  if (totalEnergy === 0) return 0;
  return Math.sqrt(sumSquaredDiff / totalEnergy);
}

/**
 * 计算波形对称性
 */
export function computeWaveformSymmetry(signal: number[]): number {
  if (signal.length < 2) return 1;
  
  const mid = signal.length / 2;
  let sumDiff = 0;
  let sumAbs = 0;
  
  const halfLen = Math.floor(signal.length / 2);
  for (let i = 0; i < halfLen; i++) {
    const left = signal[i];
    const right = signal[signal.length - 1 - i];
    sumDiff += Math.abs(left - right);
    sumAbs += Math.abs(left) + Math.abs(right);
  }
  
  if (sumAbs === 0) return 1;
  return 1 - (sumDiff / sumAbs);
}

/**
 * 计算能量分布均匀度
 */
export function computeEnergyDistribution(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  // 将信号分成4个段，计算每段的能量
  const segmentLen = Math.ceil(signal.length / 4);
  const energies: number[] = [];
  
  for (let i = 0; i < 4; i++) {
    const start = i * segmentLen;
    const end = Math.min((i + 1) * segmentLen, signal.length);
    
    let segmentEnergy = 0;
    for (let j = start; j < end; j++) {
      segmentEnergy += signal[j] * signal[j];
    }
    
    energies.push(segmentEnergy);
  }
  
  // 计算能量的方差系数（越小越均匀）
  const meanEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  if (meanEnergy === 0) return 0;
  
  const variance = energies.reduce((sum, e) => sum + (e - meanEnergy) * (e - meanEnergy), 0) / energies.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / meanEnergy;
  
  // 转换为0-1的均匀度指标（cv越小，均匀度越高）
  return Math.exp(-cv);
}

/**
 * 计算峰值位置
 */
export function computePeakPosition(signal: number[]): number {
  if (signal.length === 0) return 0.5;
  
  let maxIdx = 0;
  let maxVal = Math.abs(signal[0]);
  
  for (let i = 1; i < signal.length; i++) {
    const absVal = Math.abs(signal[i]);
    if (absVal > maxVal) {
      maxVal = absVal;
      maxIdx = i;
    }
  }
  
  return maxIdx / signal.length;
}

/**
 * 提取单个通道的8维特征
 */
export function extractChannelFeatures(signal: number[]): Partial<FeatureVector> {
  return {
    rmsEnergy: computeRMSEnergy(signal),
    peakValue: computePeakValue(signal),
    zeroCrossingRate: computeZeroCrossingRate(signal),
    spectralCentroid: computeSpectralCentroid(signal),
    spectralBandwidth: computeSpectralBandwidth(signal),
    waveformSymmetry: computeWaveformSymmetry(signal),
    energyDistribution: computeEnergyDistribution(signal),
    peakPosition: computePeakPosition(signal)
  };
}

/**
 * 提取三通道融合的8维特征
 * 
 * 使用SNR加权融合三个通道的特征
 */
export function extractFusedFeatures(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): FeatureVector {
  // 提取各通道特征
  const feat1 = extractChannelFeatures(ch1);
  const feat2 = extractChannelFeatures(ch2);
  const feat3 = extractChannelFeatures(ch3);
  
  // 计算SNR作为权重
  const snr1 = computeRMSEnergy(ch1) / (computeRMSEnergy(ch1) * 0.1 + 1e-6);
  const snr2 = computeRMSEnergy(ch2) / (computeRMSEnergy(ch2) * 0.1 + 1e-6);
  const snr3 = computeRMSEnergy(ch3) / (computeRMSEnergy(ch3) * 0.1 + 1e-6);
  
  const totalSNR = snr1 + snr2 + snr3;
  const w1 = snr1 / totalSNR;
  const w2 = snr2 / totalSNR;
  const w3 = snr3 / totalSNR;
  
  // 融合特征
  return {
    rmsEnergy: (feat1.rmsEnergy! * w1 + feat2.rmsEnergy! * w2 + feat3.rmsEnergy! * w3),
    peakValue: (feat1.peakValue! * w1 + feat2.peakValue! * w2 + feat3.peakValue! * w3),
    zeroCrossingRate: (feat1.zeroCrossingRate! * w1 + feat2.zeroCrossingRate! * w2 + feat3.zeroCrossingRate! * w3),
    spectralCentroid: (feat1.spectralCentroid! * w1 + feat2.spectralCentroid! * w2 + feat3.spectralCentroid! * w3),
    spectralBandwidth: (feat1.spectralBandwidth! * w1 + feat2.spectralBandwidth! * w2 + feat3.spectralBandwidth! * w3),
    waveformSymmetry: (feat1.waveformSymmetry! * w1 + feat2.waveformSymmetry! * w2 + feat3.waveformSymmetry! * w3),
    energyDistribution: (feat1.energyDistribution! * w1 + feat2.energyDistribution! * w2 + feat3.energyDistribution! * w3),
    peakPosition: (feat1.peakPosition! * w1 + feat2.peakPosition! * w2 + feat3.peakPosition! * w3)
  };
}

/**
 * 计算两个特征向量之间的欧氏距离
 */
export function computeFeatureDistance(feat1: FeatureVector, feat2: FeatureVector): number {
  const keys: (keyof FeatureVector)[] = [
    'rmsEnergy',
    'peakValue',
    'zeroCrossingRate',
    'spectralCentroid',
    'spectralBandwidth',
    'waveformSymmetry',
    'energyDistribution',
    'peakPosition'
  ];
  
  let sumSquaredDiff = 0;
  for (const key of keys) {
    const diff = feat1[key] - feat2[key];
    sumSquaredDiff += diff * diff;
  }
  
  return Math.sqrt(sumSquaredDiff);
}

/**
 * 计算特征向量的统计信息
 */
export interface FeatureStats {
  mean: FeatureVector;
  stdDev: FeatureVector;
  min: FeatureVector;
  max: FeatureVector;
}

export function computeFeatureStats(features: FeatureVector[]): FeatureStats {
  if (features.length === 0) {
    throw new Error('需要至少一个特征向量');
  }
  
  const keys: (keyof FeatureVector)[] = [
    'rmsEnergy',
    'peakValue',
    'zeroCrossingRate',
    'spectralCentroid',
    'spectralBandwidth',
    'waveformSymmetry',
    'energyDistribution',
    'peakPosition'
  ];
  
  // 计算均值
  const mean: FeatureVector = {} as FeatureVector;
  for (const key of keys) {
    const sum = features.reduce((acc, f) => acc + f[key], 0);
    (mean as any)[key] = sum / features.length;
  }
  
  // 计算标准差
  const stdDev: FeatureVector = {} as FeatureVector;
  for (const key of keys) {
    const variance = features.reduce((acc, f) => {
      const diff = f[key] - (mean as any)[key];
      return acc + diff * diff;
    }, 0) / features.length;
    (stdDev as any)[key] = Math.sqrt(variance);
  }
  
  // 计算最小值和最大值
  const min: FeatureVector = {} as FeatureVector;
  const max: FeatureVector = {} as FeatureVector;
  
  for (const key of keys) {
    const values = features.map(f => f[key]);
    (min as any)[key] = Math.min(...values);
    (max as any)[key] = Math.max(...values);
  }
  
  return { mean, stdDev, min, max };
}

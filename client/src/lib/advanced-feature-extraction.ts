/**
 * 高级特征提取模块 - 多维特征提取
 * 
 * 特征类型：
 * - 时域特征（6 维）：MAV, RMS, VAR, WL, ZCR, MAL
 * - 频域特征（4 维）：CF, BW, SE, PSD
 * - 小波特征（20 维）：多尺度分解系数
 * 
 * 总计：30 维特征向量
 */

/**
 * 时域特征接口
 */
export interface TimeDomainFeatures {
  mav: number; // 均值绝对值 (Mean Absolute Value)
  rms: number; // 均方根值 (Root Mean Square)
  var: number; // 方差 (Variance)
  wl: number;  // 波形长度 (Waveform Length)
  zcr: number; // 零交叉率 (Zero Crossing Rate)
  mal: number; // 肌肉激活水平 (Muscle Activation Level)
}

/**
 * 频域特征接口
 */
export interface FrequencyDomainFeatures {
  cf: number;  // 中心频率 (Center Frequency)
  bw: number;  // 带宽 (Bandwidth)
  se: number;  // 频谱熵 (Spectral Entropy)
  psd: number; // 功率谱密度峰值 (Peak Power Spectral Density)
}

/**
 * 小波特征接口
 */
export interface WaveletFeatures {
  coefficients: number[]; // 小波分解系数（20 维）
  energies: number[];     // 各层能量
  entropy: number;        // 小波熵
}

/**
 * 完整特征向量接口
 */
export interface AdvancedFeatureVector {
  timeDomain: TimeDomainFeatures;
  frequencyDomain: FrequencyDomainFeatures;
  wavelet: WaveletFeatures;
  vector: number[]; // 30 维特征向量
}

/**
 * 计算时域特征
 */
export function extractTimeDomainFeatures(signal: number[]): TimeDomainFeatures {
  if (signal.length === 0) {
    return { mav: 0, rms: 0, var: 0, wl: 0, zcr: 0, mal: 0 };
  }

  const n = signal.length;

  // 1. 均值绝对值 (MAV)
  const mav = signal.reduce((sum, val) => sum + Math.abs(val), 0) / n;

  // 2. 均方根值 (RMS)
  const rms = Math.sqrt(signal.reduce((sum, val) => sum + val * val, 0) / n);

  // 3. 方差 (VAR)
  const mean = signal.reduce((sum, val) => sum + val, 0) / n;
  const variance = signal.reduce((sum, val) => sum + (val - mean) ** 2, 0) / n;

  // 4. 波形长度 (WL) - 相邻样本差的绝对值之和
  let wl = 0;
  for (let i = 1; i < n; i++) {
    wl += Math.abs(signal[i] - signal[i - 1]);
  }

  // 4. 过零率 (ZCR)
  // 问题5.3修复：统一公式和实现
  // 公式： ZCR = (1/(N-1)) × Σ 1(sign(x[i]) ≠ sign(x[i-1]))
  // 实现：检测相邻两个采样点符号是否相反
  let zcr = 0;
  for (let i = 1; i < n; i++) {
    // 相邻两个采样点的乘积 < 0 表示符号相反（过零点）
    if (signal[i] * signal[i - 1] < 0) {
      zcr++;
    }
  }
  zcr = zcr / (n - 1);

  // 6. 肌肉激活水平 (MAL) - 高于阈值的样本比例
  // 问题5.2修复：使用双端静息估计而不是简单的均值+方差阈值
  // 原因：简单阈值对弱信号失效，双端静息估计更能适应不同信号强度
  const quietLength = Math.floor(n * 0.08);  // 前8%和后8%作为静息段
  const restingSegment = signal.slice(0, quietLength).concat(signal.slice(n - quietLength));
  const restingMean = restingSegment.reduce((a, b) => a + b, 0) / restingSegment.length;
  const restingVariance = restingSegment.reduce((sum, val) => sum + (val - restingMean) ** 2, 0) / restingSegment.length;
  const restingStd = Math.sqrt(restingVariance);
  const threshold = restingMean + 3.5 * restingStd;  // 使用3.5倍标准差作为阈值
  const mal = signal.filter((val) => Math.abs(val) > threshold).length / n;

  return { mav, rms, var: variance, wl, zcr, mal };
}

/**
 * 计算频域特征（使用 FFT）
 */
// 注意：此函数已被 frequency-domain-features-v2.ts 中的高效实现替代
// 该旧实现使用 O(n²) 的 DFT 算法，会导致 UI 卡顿
// 请改用 extractFrequencyDomainFeaturesV2() 函数，它使用 fft.js 库（O(n log n)）
// 此函数保留仅供向后兼容性
// 导入高效的频域特征提取函数
import { extractFrequencyDomainFeaturesV2 } from './frequency-domain-features-v2';

// 已弃用的低效实现 - 保留仅供向后兼容性
export function extractFrequencyDomainFeatures(
  signal: number[],
  samplingRate: number = 1000
): FrequencyDomainFeatures {
  if (signal.length === 0) {
    return { cf: 0, bw: 0, se: 0, psd: 0 };
  }

  // 警告：这是旧的低效实现，仅用于向后兼容
  // 新代码应该使用 extractFrequencyDomainFeaturesV2()
  console.warn(
    '⚠️ 警告：使用了低效的 extractFrequencyDomainFeatures()，' +
    '请改用 extractFrequencyDomainFeaturesV2() 以获得更好的性能'
  );

  const n = signal.length;
  const freqResolution = samplingRate / n;

  // 计算功率谱（简化版：使用 Welch 方法的近似）
  const psdValues: number[] = [];
  const frequencies: number[] = [];

  // 计算频率分量能量（使用离散傅里叶变换的近似）
  // 注意：这是 O(n²) 算法，仅在信号长度较小时使用
  for (let k = 0; k < n / 2; k++) {
    let realPart = 0;
    let imagPart = 0;

    for (let i = 0; i < n; i++) {
      const angle = (-2 * Math.PI * k * i) / n;
      realPart += signal[i] * Math.cos(angle);
      imagPart += signal[i] * Math.sin(angle);
    }

    const magnitude = Math.sqrt(realPart * realPart + imagPart * imagPart);
    const power = (magnitude * magnitude) / n;
    psdValues.push(power);
    frequencies.push(k * freqResolution);
  }

  // 1. 中心频率 (CF)
  const totalPower = psdValues.reduce((a, b) => a + b, 0);
  const cf = totalPower > 0
    ? psdValues.reduce((sum, p, i) => sum + p * frequencies[i], 0) / totalPower
    : 0;

  // 2. 带宽 (BW) - 功率从最大值下降 50% 的频率范围
  const maxPower = Math.max(...psdValues);
  const threshold = maxPower * 0.5;
  const validIndices = psdValues
    .map((p, i) => (p >= threshold ? i : -1))
    .filter((i) => i !== -1);
  const bw = validIndices.length > 0
    ? (validIndices[validIndices.length - 1] - validIndices[0]) * freqResolution
    : 0;

  // 3. 频谱熵 (SE)
  const normalizedPsd = psdValues.map((p) => p / totalPower);
  let se = 0;
  for (const p of normalizedPsd) {
    if (p > 0) {
      se -= p * Math.log2(p);
    }
  }

  // 4. 功率谱密度峰值 (PSD)
  const psd = maxPower;

  return { cf, bw, se, psd };
}

/**
 * 简化的小波变换特征提取
 * 使用 Haar 小波进行多尺度分解
 */
export function extractWaveletFeatures(signal: number[]): WaveletFeatures {
  if (signal.length === 0) {
    return {
      coefficients: Array(20).fill(0),
      energies: Array(6).fill(0),
      entropy: 0,
    };
  }

  // 简化的小波分解（Haar 小波）
  const coefficients: number[] = [];
  const energies: number[] = [];

  let currentSignal = [...signal];
  let level = 0;
  const maxLevels = 6;

  while (level < maxLevels && currentSignal.length > 1) {
    const nextSignal: number[] = [];
    const details: number[] = [];

    // 一层小波分解
    for (let i = 0; i < currentSignal.length - 1; i += 2) {
      const approx = (currentSignal[i] + currentSignal[i + 1]) / 2;
      const detail = (currentSignal[i] - currentSignal[i + 1]) / 2;

      nextSignal.push(approx);
      details.push(detail);
    }

    // 存储细节系数（最多 20 个）
    const detailsToStore = Math.min(details.length, 20 - coefficients.length);
    for (let i = 0; i < detailsToStore; i++) {
      coefficients.push(Math.abs(details[i]));
    }

    // 计算能量
    const energy = details.reduce((sum, d) => sum + d * d, 0);
    energies.push(energy);

    currentSignal = nextSignal;
    level++;
  }

  // 填充到 20 维
  while (coefficients.length < 20) {
    coefficients.push(0);
  }

  // 计算小波熵
  let totalEnergy = energies.reduce((a, b) => a + b, 0);
  let entropy = 0;
  if (totalEnergy > 0) {
    for (const e of energies) {
      const p = e / totalEnergy;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
  }

  return {
    coefficients: coefficients.slice(0, 20),
    energies,
    entropy,
  };
}

/**
 * 提取完整的 30 维特征向量
 */
export function extractAdvancedFeatures(
  signal: number[],
  samplingRate: number = 1000
): AdvancedFeatureVector {
  // 提取各类特征
  const timeDomain = extractTimeDomainFeatures(signal);
  const frequencyDomain = extractFrequencyDomainFeatures(signal, samplingRate);
  const wavelet = extractWaveletFeatures(signal);

  // 组合成 30 维特征向量
  const vector: number[] = [
    // 时域特征（6 维）
    timeDomain.mav,
    timeDomain.rms,
    timeDomain.var,
    timeDomain.wl,
    timeDomain.zcr,
    timeDomain.mal,
    // 频域特征（4 维）
    frequencyDomain.cf,
    frequencyDomain.bw,
    frequencyDomain.se,
    frequencyDomain.psd,
    // 小波特征（20 维）
    ...wavelet.coefficients,
  ];

  return {
    timeDomain,
    frequencyDomain,
    wavelet,
    vector,
  };
}

/**
 * 特征向量归一化
 */
export function normalizeFeatureVector(vector: number[]): number[] {
  // Z-score 归一化
  const mean = vector.reduce((a, b) => a + b, 0) / vector.length;
  const variance = vector.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vector.length;
  const std = Math.sqrt(variance);

  if (std === 0) {
    return vector;
  }

  return vector.map((v) => (v - mean) / std);
}

/**
 * 百分位数归一化（对异常值更鲁棒）
 */
export function percentileNormalizeFeatureVector(vector: number[]): number[] {
  const sorted = [...vector].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = p75 - p25;

  if (iqr === 0) {
    return vector;
  }

  return vector.map((v) => (v - p25) / iqr);
}

/**
 * 计算两个特征向量之间的 Mahalanobis 距离
 */
export function mahalanobisDistance(
  v1: number[],
  v2: number[],
  covarianceMatrix?: number[][]
): number {
  if (v1.length !== v2.length) {
    throw new Error('Feature vectors must have the same length');
  }

  const diff = v1.map((val, i) => val - v2[i]);

  // 如果没有提供协方差矩阵，使用简化版本（对角线协方差）
  if (!covarianceMatrix) {
    // 计算特征的方差
    const variances = new Array(v1.length).fill(0);
    for (let i = 0; i < v1.length; i++) {
      variances[i] = 1; // 假设方差为 1（标准化后）
    }

    // Mahalanobis 距离 = sqrt(diff^T * Cov^-1 * diff)
    let distance = 0;
    for (let i = 0; i < diff.length; i++) {
      distance += (diff[i] * diff[i]) / variances[i];
    }
    return Math.sqrt(distance);
  }

  // 使用提供的协方差矩阵
  // 注意：原实现使用了原矩阵而非逆矩阵，这在数学上是错误的
  // Mahalanobis 距离正确公式为: sqrt(diff^T * Cov^-1 * diff)
  // 但这里直接用了 Cov 而非 Cov^-1，导致计算结果错误
  
  console.warn(
    '⚠️ 警告：Mahalanobis 距离实现不完整，需要矩阵求逆。' +
    '当前改用欧氏距离作为替代方案。'
  );
  
  // 临时方案：改用欧氏距离（这在数学上是正确的）
  // 如需完整的 Mahalanobis 距离，需要实现矩阵求逆（LU 分解或使用 math.js）
  let distance = 0;
  for (let i = 0; i < diff.length; i++) {
    distance += diff[i] * diff[i];
  }

  return Math.sqrt(distance);
}

/**
 * 计算特征向量的相似度（0-100）
 */
export function calculateFeatureSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) {
    return 0;
  }

  // 使用余弦相似度
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  const cosineSimilarity = dotProduct / (norm1 * norm2);
  // 转换为 0-100 的相似度评分
  return Math.max(0, Math.min(100, (cosineSimilarity + 1) * 50));
}

/**
 * 计算特征向量组的协方差矩阵
 */
export function calculateCovarianceMatrix(vectors: number[][]): number[][] {
  if (vectors.length === 0 || vectors[0].length === 0) {
    return [];
  }

  const n = vectors.length;
  const m = vectors[0].length;

  // 计算均值
  const means = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      means[i] += vectors[j][i];
    }
    means[i] /= n;
  }

  // 计算协方差矩阵
  const cov: number[][] = Array(m)
    .fill(null)
    .map(() => Array(m).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < n; k++) {
        cov[i][j] += (vectors[k][i] - means[i]) * (vectors[k][j] - means[j]);
      }
      cov[i][j] /= n;
    }
  }

  return cov;
}

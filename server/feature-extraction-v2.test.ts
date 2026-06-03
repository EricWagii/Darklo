import { describe, it, expect } from 'vitest';
import {
  computeRMSEnergy,
  computePeakValue,
  computeZeroCrossingRate,
  computeSpectralCentroid,
  computeSpectralBandwidth,
  computeWaveformSymmetry,
  computeEnergyDistribution,
  computePeakPosition,
  extractChannelFeatures,
  extractFusedFeatures,
  computeFeatureDistance,
  computeFeatureStats
} from '../client/src/lib/feature-extraction-v2';

// 生成模拟信号
function generateSignal(
  length: number,
  noiseLevel: number = 0.1,
  signalStart: number = 0.3,
  signalEnd: number = 0.7,
  signalAmplitude: number = 1.0
): number[] {
  const signal: number[] = [];
  for (let i = 0; i < length; i++) {
    const ratio = i / length;
    let value = Math.random() * noiseLevel;

    if (ratio >= signalStart && ratio <= signalEnd) {
      value += signalAmplitude * Math.sin((ratio - signalStart) * Math.PI / (signalEnd - signalStart));
    }

    signal.push(value);
  }
  return signal;
}

describe('特征提取 V2', () => {
  describe('基础特征计算', () => {
    it('应该计算RMS能量', () => {
      const signal = [1, 2, 3, 4, 5];
      const rms = computeRMSEnergy(signal);
      
      expect(rms).toBeGreaterThan(0);
      expect(rms).toBeLessThanOrEqual(5);
    });

    it('应该计算峰值', () => {
      const signal = [1, -3, 2, -5, 4];
      const peak = computePeakValue(signal);
      
      expect(peak).toBe(5);
    });

    it('应该计算过零率', () => {
      const signal = [1, -1, 1, -1, 1];
      const zcr = computeZeroCrossingRate(signal);
      
      expect(zcr).toBeGreaterThan(0);
      expect(zcr).toBeLessThanOrEqual(1);
    });

    it('应该计算频谱中心', () => {
      const signal = generateSignal(1000);
      const centroid = computeSpectralCentroid(signal);
      
      expect(centroid).toBeGreaterThanOrEqual(0);
      expect(centroid).toBeLessThanOrEqual(1);
    });

    it('应该计算频谱带宽', () => {
      const signal = generateSignal(1000);
      const bandwidth = computeSpectralBandwidth(signal);
      
      expect(bandwidth).toBeGreaterThanOrEqual(0);
      expect(bandwidth).toBeLessThanOrEqual(1);
    });

    it('应该计算波形对称性', () => {
      const signal = new Array(100).fill(1);
      const symmetry = computeWaveformSymmetry(signal);
      
      expect(symmetry).toBeCloseTo(1, 1); // 完全对称
    });

    it('应该计算能量分布均匀度', () => {
      const signal = generateSignal(1000);
      const distribution = computeEnergyDistribution(signal);
      
      expect(distribution).toBeGreaterThanOrEqual(0);
      expect(distribution).toBeLessThanOrEqual(1);
    });

    it('应该计算峰值位置', () => {
      const signal = new Array(100).fill(0);
      signal[50] = 10; // 峰值在中间
      const position = computePeakPosition(signal);
      
      expect(position).toBeCloseTo(0.5, 1);
    });
  });

  describe('通道特征提取', () => {
    it('应该提取完整的8维特征', () => {
      const signal = generateSignal(1000);
      const features = extractChannelFeatures(signal);
      
      expect(features.rmsEnergy).toBeDefined();
      expect(features.peakValue).toBeDefined();
      expect(features.zeroCrossingRate).toBeDefined();
      expect(features.spectralCentroid).toBeDefined();
      expect(features.spectralBandwidth).toBeDefined();
      expect(features.waveformSymmetry).toBeDefined();
      expect(features.energyDistribution).toBeDefined();
      expect(features.peakPosition).toBeDefined();
    });

    it('所有特征值应该在合理范围内', () => {
      const signal = generateSignal(1000);
      const features = extractChannelFeatures(signal);
      
      expect(features.rmsEnergy!).toBeGreaterThanOrEqual(0);
      expect(features.peakValue!).toBeGreaterThanOrEqual(0);
      expect(features.zeroCrossingRate!).toBeGreaterThanOrEqual(0);
      expect(features.zeroCrossingRate!).toBeLessThanOrEqual(1);
      expect(features.waveformSymmetry!).toBeGreaterThanOrEqual(0);
      expect(features.waveformSymmetry!).toBeLessThanOrEqual(1);
      expect(features.energyDistribution!).toBeGreaterThanOrEqual(0);
      expect(features.energyDistribution!).toBeLessThanOrEqual(1);
      expect(features.peakPosition!).toBeGreaterThanOrEqual(0);
      expect(features.peakPosition!).toBeLessThanOrEqual(1);
    });
  });

  describe('融合特征提取', () => {
    it('应该融合三个通道的特征', () => {
      const ch1 = generateSignal(1000);
      const ch2 = generateSignal(1000);
      const ch3 = generateSignal(1000);
      
      const features = extractFusedFeatures(ch1, ch2, ch3);
      
      expect(features.rmsEnergy).toBeDefined();
      expect(features.peakValue).toBeDefined();
      expect(features.zeroCrossingRate).toBeDefined();
    });

    it('融合特征应该是各通道特征的加权平均', () => {
      const ch1 = new Array(1000).fill(1);
      const ch2 = new Array(1000).fill(2);
      const ch3 = new Array(1000).fill(3);
      
      const features = extractFusedFeatures(ch1, ch2, ch3);
      
      // RMS能量应该在1-3之间
      expect(features.rmsEnergy).toBeGreaterThanOrEqual(1);
      expect(features.rmsEnergy).toBeLessThanOrEqual(3);
    });
  });

  describe('特征距离计算', () => {
    it('应该计算两个特征向量之间的距离', () => {
      const feat1 = extractFusedFeatures(
        generateSignal(1000),
        generateSignal(1000),
        generateSignal(1000)
      );
      const feat2 = extractFusedFeatures(
        generateSignal(1000),
        generateSignal(1000),
        generateSignal(1000)
      );
      
      const distance = computeFeatureDistance(feat1, feat2);
      
      expect(distance).toBeGreaterThanOrEqual(0);
    });

    it('相同的特征向量距离应该为0', () => {
      const feat1 = extractFusedFeatures(
        new Array(1000).fill(1),
        new Array(1000).fill(1),
        new Array(1000).fill(1)
      );
      const feat2 = extractFusedFeatures(
        new Array(1000).fill(1),
        new Array(1000).fill(1),
        new Array(1000).fill(1)
      );
      
      const distance = computeFeatureDistance(feat1, feat2);
      
      expect(distance).toBeCloseTo(0, 5);
    });
  });

  describe('特征统计', () => {
    it('应该计算特征的统计信息', () => {
      const features = Array(5).fill(null).map(() =>
        extractFusedFeatures(
          generateSignal(1000),
          generateSignal(1000),
          generateSignal(1000)
        )
      );
      
      const stats = computeFeatureStats(features);
      
      expect(stats.mean).toBeDefined();
      expect(stats.stdDev).toBeDefined();
      expect(stats.min).toBeDefined();
      expect(stats.max).toBeDefined();
    });

    it('最小值应该小于等于最大值', () => {
      const features = Array(5).fill(null).map(() =>
        extractFusedFeatures(
          generateSignal(1000),
          generateSignal(1000),
          generateSignal(1000)
        )
      );
      
      const stats = computeFeatureStats(features);
      
      expect(stats.min.rmsEnergy).toBeLessThanOrEqual(stats.max.rmsEnergy);
      expect(stats.min.peakValue).toBeLessThanOrEqual(stats.max.peakValue);
    });

    it('均值应该在最小值和最大值之间', () => {
      const features = Array(5).fill(null).map(() =>
        extractFusedFeatures(
          generateSignal(1000),
          generateSignal(1000),
          generateSignal(1000)
        )
      );
      
      const stats = computeFeatureStats(features);
      
      expect(stats.mean.rmsEnergy).toBeGreaterThanOrEqual(stats.min.rmsEnergy);
      expect(stats.mean.rmsEnergy).toBeLessThanOrEqual(stats.max.rmsEnergy);
    });
  });
});

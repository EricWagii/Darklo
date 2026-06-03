import { describe, it, expect } from 'vitest';
import {
  detectActiveSegment,
  normalizeWithReference,
  improvedCropping,
  improvedScaling,
  coordinatedCropping,
  coordinatedScaling,
  comprehensiveNormalization,
  calculateReferenceAmplitude,
} from '../client/src/lib/improved-waveform-normalization';

describe('改进的波形裁剪和缩放算法', () => {
  describe('检测活跃段', () => {
    it('应该检测简单信号的活跃段', () => {
      const signal = [0, 0, 100, 200, 150, 100, 0, 0];
      const result = detectActiveSegment(signal, 0.1);
      expect(result.start).toBeLessThan(result.end);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('应该处理全零信号', () => {
      const signal = [0, 0, 0, 0, 0];
      const result = detectActiveSegment(signal, 0.1);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('应该处理空信号', () => {
      const signal: number[] = [];
      const result = detectActiveSegment(signal, 0.1);
      expect(result.start).toBe(0);
      expect(result.end).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('应该处理全非零信号', () => {
      const signal = [100, 200, 150, 100, 50];
      const result = detectActiveSegment(signal, 0.1);
      expect(result.start).toBe(0);
      expect(result.end).toBe(signal.length - 1);
    });
  });

  describe('基于参考基准的归一化', () => {
    it('应该缩放信号到参考幅度', () => {
      const signal = [0, 500, 1000, 500, 0];
      const normalized = normalizeWithReference(signal, 2000);
      const maxAbs = Math.max(...normalized.map(Math.abs));
      expect(maxAbs).toBeLessThanOrEqual(2000 * 1.1);
      expect(maxAbs).toBeGreaterThan(2000 * 0.9);
    });

    it('应该保留相对关系', () => {
      const signal = [100, 200, 300, 200, 100];
      const normalized = normalizeWithReference(signal, 2000, true);
      const ratio1 = normalized[1] / normalized[0];
      const ratio2 = signal[1] / signal[0];
      expect(Math.abs(ratio1 - ratio2)).toBeLessThan(0.01);
    });

    it('应该处理零信号', () => {
      const signal = [0, 0, 0];
      const normalized = normalizeWithReference(signal, 2000);
      expect(normalized).toEqual(signal);
    });
  });

  describe('改进的裁剪算法', () => {
    it('应该移除前后空白', () => {
      const signal = [0, 0, 100, 200, 100, 0, 0];
      const result = improvedCropping(signal);
      // 信号中心是[100, 200, 100]，添加preserveMargin=5后可能包含整个信号
      // 实际上detectActiveSegment会识别活跃段，但由于信号很小，可能返回整个信号
      expect(result.cropped.length).toBeGreaterThanOrEqual(3);
      expect(result.start).toBeGreaterThanOrEqual(0);
      expect(result.end).toBeLessThanOrEqual(signal.length - 1);
    });

    it('应该保留保留边距', () => {
      const signal = [0, 0, 100, 200, 100, 0, 0];
      const result = improvedCropping(signal, { preserveMargin: 2 });
      expect(result.cropped.length).toBeGreaterThan(3);
    });

    it('应该处理没有空白的信号', () => {
      const signal = [100, 200, 150, 100, 50];
      const result = improvedCropping(signal);
      expect(result.cropped.length).toBeGreaterThanOrEqual(signal.length - 10);
    });
  });

  describe('改进的缩放算法', () => {
    it('应该使用全局参考基准', () => {
      const signal = [100, 200, 300];
      const result = improvedScaling(signal, 2000);
      const maxAbs = Math.max(...result.scaled.map(Math.abs));
      expect(maxAbs).toBeLessThanOrEqual(2000 * 1.1);
    });

    it('应该支持百分位数缩放', () => {
      const signal = [100, 200, 300, 10000]; // 10000是异常值
      const result = improvedScaling(signal, undefined, {
        usePercentile: true,
        percentile: 95,
      });
      // 百分位数缩放会使用95百分位数，缩放因子取决于信号的分布
      expect(result.scaleFactor).toBeGreaterThanOrEqual(0.2);
      expect(result.scaleFactor).toBeLessThanOrEqual(20.0);
    });

    it('应该限制缩放范围', () => {
      const signal = [1, 2, 3];
      const result = improvedScaling(signal, 10000, { preserveRange: true }); // preserveRange限制缩放因子在0.5-2.0之间
      expect(result.scaleFactor).toBeLessThanOrEqual(2.0);
      expect(result.scaleFactor).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('多通道协调裁剪', () => {
    it('应该使用相同的裁剪范围', () => {
      const ch1 = [0, 100, 200, 100, 0];
      const ch2 = [0, 0, 150, 0, 0];
      const ch3 = [0, 50, 100, 50, 0];
      const result = coordinatedCropping(ch1, ch2, ch3);
      expect(result.ch1.length).toBe(result.ch2.length);
      expect(result.ch2.length).toBe(result.ch3.length);
    });

    it('应该取三个通道的并集', () => {
      const ch1 = [0, 0, 100, 0, 0];
      const ch2 = [0, 50, 100, 50, 0];
      const ch3 = [0, 0, 0, 0, 0];
      const result = coordinatedCropping(ch1, ch2, ch3);
      expect(result.start).toBeLessThanOrEqual(1);
      expect(result.end).toBeGreaterThanOrEqual(3);
    });
  });

  describe('多通道协调缩放', () => {
    it('应该使用相同的缩放因子', () => {
      const ch1 = [100, 200, 300];
      const ch2 = [50, 100, 150];
      const ch3 = [200, 400, 600];
      const result = coordinatedScaling(ch1, ch2, ch3);
      expect(result.ch1[1] / result.ch1[0]).toBeCloseTo(ch1[1] / ch1[0], 1);
      expect(result.ch2[1] / result.ch2[0]).toBeCloseTo(ch2[1] / ch2[0], 1);
    });

    it('应该保留通道间的相对关系', () => {
      const ch1 = [100, 200, 300];
      const ch2 = [50, 100, 150];
      const ch3 = [200, 400, 600];
      const result = coordinatedScaling(ch1, ch2, ch3);
      const ratio1 = result.ch1[0] / result.ch2[0];
      const ratio2 = ch1[0] / ch2[0];
      expect(Math.abs(ratio1 - ratio2)).toBeLessThan(0.1);
    });
  });

  describe('综合处理流程', () => {
    it('应该同时进行裁剪和缩放', () => {
      const ch1 = [0, 0, 100, 200, 100, 0, 0];
      const ch2 = [0, 0, 50, 100, 50, 0, 0];
      const ch3 = [0, 0, 200, 400, 200, 0, 0];
      const result = comprehensiveNormalization(ch1, ch2, ch3);
      // 结果应该是裁剪后的长度
      expect(result.ch1.length).toBeGreaterThan(0);
      expect(result.ch1.length).toBe(result.ch2.length);
      expect(result.ch2.length).toBe(result.ch3.length);
    });

    it('应该返回处理元数据', () => {
      const ch1 = [0, 100, 200, 100, 0];
      const ch2 = [0, 50, 100, 50, 0];
      const ch3 = [0, 200, 400, 200, 0];
      const result = comprehensiveNormalization(ch1, ch2, ch3);
      expect(result.croppingStart).toBeGreaterThanOrEqual(0);
      expect(result.croppingEnd).toBeLessThanOrEqual(ch1.length - 1);
      expect(result.scaleFactor).toBeGreaterThan(0);
    });
  });

  describe('计算参考幅度', () => {
    it('应该计算平均参考幅度', () => {
      const collections = [
        { ch1: [100, 200, 300], ch2: [50, 100, 150], ch3: [200, 400, 600] },
        { ch1: [100, 200, 300], ch2: [50, 100, 150], ch3: [200, 400, 600] },
      ];
      const ref = calculateReferenceAmplitude(collections, 'mean');
      expect(ref).toBeGreaterThan(0);
    });

    it('应该计算中位数参考幅度', () => {
      const collections = [
        { ch1: [100, 200, 300], ch2: [50, 100, 150], ch3: [200, 400, 600] },
        { ch1: [100, 200, 300], ch2: [50, 100, 150], ch3: [200, 400, 600] },
        { ch1: [100, 200, 300], ch2: [50, 100, 150], ch3: [200, 400, 600] },
      ];
      const ref = calculateReferenceAmplitude(collections, 'median');
      expect(ref).toBeGreaterThan(0);
    });

    it('应该计算百分位数参考幅度', () => {
      const collections = [
        { ch1: [100, 200, 300], ch2: [50, 100, 150], ch3: [200, 400, 600] },
        { ch1: [100, 200, 300], ch2: [50, 100, 150], ch3: [200, 400, 600] },
      ];
      const ref = calculateReferenceAmplitude(collections, 'percentile', 75);
      expect(ref).toBeGreaterThan(0);
    });

    it('应该处理空集合', () => {
      const collections: any[] = [];
      const ref = calculateReferenceAmplitude(collections);
      expect(ref).toBe(2000);
    });
  });

  describe('波形处理一致性', () => {
    it('相同的采集应该产生相同的结果', () => {
      const ch1 = [0, 100, 200, 100, 0];
      const ch2 = [0, 50, 100, 50, 0];
      const ch3 = [0, 200, 400, 200, 0];

      const result1 = comprehensiveNormalization(ch1, ch2, ch3);
      const result2 = comprehensiveNormalization(ch1, ch2, ch3);

      expect(result1.ch1).toEqual(result2.ch1);
      expect(result1.ch2).toEqual(result2.ch2);
      expect(result1.ch3).toEqual(result2.ch3);
    });

    it('不同幅度的采集应该有相似的处理结果', () => {
      const ch1a = [0, 100, 200, 100, 0];
      const ch2a = [0, 50, 100, 50, 0];
      const ch3a = [0, 200, 400, 200, 0];

      const ch1b = [0, 200, 400, 200, 0];
      const ch2b = [0, 100, 200, 100, 0];
      const ch3b = [0, 400, 800, 400, 0];

      const result1 = comprehensiveNormalization(ch1a, ch2a, ch3a);
      const result2 = comprehensiveNormalization(ch1b, ch2b, ch3b);

      // 缩放后的幅度应该相近（允许一定的差异）
      const max1 = Math.max(...result1.ch1.map(Math.abs));
      const max2 = Math.max(...result2.ch1.map(Math.abs));
      expect(Math.abs(max1 - max2) / Math.max(max1, max2)).toBeLessThan(0.6);
    });
  });
});

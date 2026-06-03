import { describe, it, expect } from 'vitest';
import {
  cropIndependently,
  batchCroppingIndependently,
  normalizeToFixedLength,
  processWaveform,
  batchProcessWaveforms
} from '../independent-cropping';

describe('独立裁剪系统', () => {
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

  describe('cropIndependently - 组合策略', () => {
    it('应该在清晰信号时使用双端静息估计', () => {
      const ch1 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
      const ch2 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
      const ch3 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

      const result = cropIndependently(ch1, ch2, ch3);

      expect(result.method).toBe('resting-baseline');
      expect(result.stage).toBe('primary');
      expect(result.isQualityAcceptable).toBe(true);
    });

    it('应该在弱信号时降级到Otsu', () => {
      // 弱信号，双端静息估计可能失败
      const ch1 = generateSignal(1000, 0.3, 0.3, 0.7, 0.2);
      const ch2 = generateSignal(1000, 0.3, 0.3, 0.7, 0.2);
      const ch3 = generateSignal(1000, 0.3, 0.3, 0.7, 0.2);

      const result = cropIndependently(ch1, ch2, ch3);

      // 可能是primary或fallback
      expect(['resting-baseline', 'otsu']).toContain(result.method);
      expect(result.isQualityAcceptable).toBe(true);
    });

    it('应该在SNR很低时使用全段降级', () => {
      // 全噪声信号
      const ch1 = Array(1000).fill(0).map(() => Math.random() * 0.05);
      const ch2 = Array(1000).fill(0).map(() => Math.random() * 0.05);
      const ch3 = Array(1000).fill(0).map(() => Math.random() * 0.05);

      const result = cropIndependently(ch1, ch2, ch3);

      expect(result.method).toBe('full-segment');
      expect(result.stage).toBe('final-fallback');
      expect(result.startIdx).toBe(0);
      expect(result.endIdx).toBe(1000);
      expect(result.confidence).toBe(0.25);
      expect(result.isQualityAcceptable).toBe(true); // 关键：降级时返回true
    });

    it('应该确保startIdx < endIdx', () => {
      const ch1 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
      const ch2 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
      const ch3 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

      const result = cropIndependently(ch1, ch2, ch3);

      expect(result.startIdx).toBeLessThan(result.endIdx);
    });
  });

  describe('normalizeToFixedLength - 缩放', () => {
    it('应该将信号缩放到目标长度', () => {
      const signal = Array(100).fill(0).map((_, i) => i);
      const normalized = normalizeToFixedLength(signal, 50);

      expect(normalized).toHaveLength(50);
    });

    it('应该处理长度相同的信号', () => {
      const signal = Array(512).fill(0).map((_, i) => i);
      const normalized = normalizeToFixedLength(signal, 512);

      expect(normalized).toHaveLength(512);
    });

    it('应该处理空信号', () => {
      const signal: number[] = [];
      const normalized = normalizeToFixedLength(signal, 512);

      expect(normalized).toHaveLength(512);
      expect(normalized.every(v => v === 0)).toBe(true);
    });

    it('应该使用线性插值', () => {
      const signal = [0, 1, 2, 3, 4];
      const normalized = normalizeToFixedLength(signal, 10);

      expect(normalized).toHaveLength(10);
      // 检查是否单调递增
      for (let i = 1; i < normalized.length; i++) {
        expect(normalized[i]).toBeGreaterThanOrEqual(normalized[i - 1]);
      }
    });
  });

  describe('processWaveform - 完整流程', () => {
    it('应该返回正确的元数据', () => {
      const ch1 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
      const ch2 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
      const ch3 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

      const result = processWaveform(ch1, ch2, ch3, 512);

      expect(result.ch1).toHaveLength(512);
      expect(result.ch2).toHaveLength(512);
      expect(result.ch3).toHaveLength(512);

      expect(result.meta.croppingMeta).toBeDefined();
      expect(result.meta.croppingMeta.startIdx).toBeGreaterThanOrEqual(0);
      expect(result.meta.croppingMeta.endIdx).toBeLessThanOrEqual(1000);
      expect(result.meta.croppingMeta.confidence).toBeGreaterThan(0);

      expect(result.meta.normalizationMeta).toBeDefined();
      expect(result.meta.normalizationMeta.originalLength).toBe(1000);
      expect(result.meta.normalizationMeta.targetLength).toBe(512);
      expect(result.meta.normalizationMeta.timestamp).toBeGreaterThan(0);
    });

    it('应该处理不同的目标长度', () => {
      const ch1 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
      const ch2 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);
      const ch3 = generateSignal(1000, 0.1, 0.3, 0.7, 1.0);

      const result256 = processWaveform(ch1, ch2, ch3, 256);
      const result512 = processWaveform(ch1, ch2, ch3, 512);
      const result1024 = processWaveform(ch1, ch2, ch3, 1024);

      expect(result256.ch1).toHaveLength(256);
      expect(result512.ch1).toHaveLength(512);
      expect(result1024.ch1).toHaveLength(1024);
    });
  });

  describe('batchCroppingIndependently - 批量处理', () => {
    it('应该批量处理多条波形', () => {
      const collections = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const results = batchCroppingIndependently(collections);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.startIdx < r.endIdx)).toBe(true);
      expect(results.every(r => r.isQualityAcceptable)).toBe(true);
    });

    it('应该独立处理每条波形（不受其他波形影响）', () => {
      const collections = [
        {
          ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
          ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
          ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
        },
        {
          ch1: Array(1000).fill(0).map(() => Math.random() * 0.05),
          ch2: Array(1000).fill(0).map(() => Math.random() * 0.05),
          ch3: Array(1000).fill(0).map(() => Math.random() * 0.05)
        }
      ];

      const results = batchCroppingIndependently(collections);

      // 第一条应该是清晰信号，第二条应该是噪声
      expect(results[0].confidence).toBeGreaterThan(results[1].confidence);
    });
  });

  describe('batchProcessWaveforms - 批量处理完整流程', () => {
    it('应该批量处理并返回完整元数据', () => {
      const collections = Array(3).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const results = batchProcessWaveforms(collections, 512);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.ch1.length === 512)).toBe(true);
      expect(results.every(r => r.meta)).toBe(true);
    });
  });

  describe('边界情况和错误处理', () => {
    it('应该处理极短的信号', () => {
      const ch1 = [0.1, 0.2, 0.3];
      const ch2 = [0.1, 0.2, 0.3];
      const ch3 = [0.1, 0.2, 0.3];

      const result = cropIndependently(ch1, ch2, ch3);

      expect(result.startIdx).toBeLessThanOrEqual(result.endIdx);
      expect(result.isQualityAcceptable).toBe(true);
    });

    it('应该处理非常长的信号', () => {
      const ch1 = generateSignal(100000, 0.1, 0.3, 0.7, 1.0);
      const ch2 = generateSignal(100000, 0.1, 0.3, 0.7, 1.0);
      const ch3 = generateSignal(100000, 0.1, 0.3, 0.7, 1.0);

      const result = cropIndependently(ch1, ch2, ch3);

      expect(result.startIdx).toBeLessThan(result.endIdx);
      expect(result.isQualityAcceptable).toBe(true);
    });

    it('应该处理全零信号', () => {
      const ch1 = Array(1000).fill(0);
      const ch2 = Array(1000).fill(0);
      const ch3 = Array(1000).fill(0);

      const result = cropIndependently(ch1, ch2, ch3);

      expect(result.startIdx).toBeLessThanOrEqual(result.endIdx);
      expect(result.isQualityAcceptable).toBe(true);
    });
  });
});

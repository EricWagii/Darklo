import { describe, it, expect } from 'vitest';
import {
  processRecognitionWaveform,
  batchProcessRecognitionWaveforms,
  getRecognitionCroppingStatus,
  isRecognitionWaveformQualityAcceptable,
  getRecognitionWaveformQualityScore
} from '../recognition-integration';

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

describe('识别集成层 (Recognition Integration)', () => {
  describe('processRecognitionWaveform', () => {
    it('应该处理单个波形并返回带元数据的结果', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 512);

      expect(result.ch1).toHaveLength(512);
      expect(result.ch2).toHaveLength(512);
      expect(result.ch3).toHaveLength(512);
      expect(result.meta).toBeDefined();
      expect(result.meta.croppingMeta).toBeDefined();
      expect(result.meta.normalizationMeta).toBeDefined();
    });

    it('应该返回正确的元数据', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 512);

      expect(result.meta.croppingMeta.stage).toMatch(/primary|fallback/);
      expect(result.meta.croppingMeta.confidence).toBeGreaterThanOrEqual(0);
      expect(result.meta.croppingMeta.confidence).toBeLessThanOrEqual(1);
      expect(result.meta.croppingMeta.startIdx).toBeGreaterThanOrEqual(0);
      expect(result.meta.croppingMeta.endIdx).toBeGreaterThan(result.meta.croppingMeta.startIdx);
      expect(result.meta.normalizationMeta.targetLength).toBe(512);
      expect(result.meta.normalizationMeta.originalLength).toBe(1000);
    });

    it('应该使用自定义目标长度', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 256);

      expect(result.ch1).toHaveLength(256);
      expect(result.ch2).toHaveLength(256);
      expect(result.ch3).toHaveLength(256);
      expect(result.meta.normalizationMeta.targetLength).toBe(256);
    });

    it('应该处理短波形', () => {
      const waveform = {
        ch1: generateSignal(100),
        ch2: generateSignal(100),
        ch3: generateSignal(100)
      };

      const result = processRecognitionWaveform(waveform, 512);

      expect(result.ch1).toHaveLength(512);
      expect(result.ch2).toHaveLength(512);
      expect(result.ch3).toHaveLength(512);
    });

    it('应该处理长波形', () => {
      const waveform = {
        ch1: generateSignal(5000),
        ch2: generateSignal(5000),
        ch3: generateSignal(5000)
      };

      const result = processRecognitionWaveform(waveform, 512);

      expect(result.ch1).toHaveLength(512);
      expect(result.ch2).toHaveLength(512);
      expect(result.ch3).toHaveLength(512);
    });
  });

  describe('batchProcessRecognitionWaveforms', () => {
    it('应该批量处理多个波形', () => {
      const waveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));

      const results = batchProcessRecognitionWaveforms(waveforms, 512);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.ch1).toHaveLength(512);
        expect(result.ch2).toHaveLength(512);
        expect(result.ch3).toHaveLength(512);
      });
    });

    it('应该保留波形顺序', () => {
      const waveforms = Array(3).fill(null).map((_, idx) => ({
        ch1: new Array(1000).fill(idx),
        ch2: new Array(1000).fill(idx),
        ch3: new Array(1000).fill(idx)
      }));

      const results = batchProcessRecognitionWaveforms(waveforms, 512);

      expect(results[0].ch1[0]).toBe(0);
      expect(results[1].ch1[0]).toBe(1);
      expect(results[2].ch1[0]).toBe(2);
    });
  });

  describe('getRecognitionCroppingStatus', () => {
    it('应该返回有效的状态描述', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 512);
      const status = getRecognitionCroppingStatus(result);

      expect(status).toBeDefined();
      expect(status.length).toBeGreaterThan(0);
      expect(status).toMatch(/✅|⚠️/);
    });

    it('应该包含长度信息', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 512);
      const status = getRecognitionCroppingStatus(result);

      expect(status).toMatch(/1000/); // 原始长度
      expect(status).toMatch(/512/); // 目标长度
    });
  });

  describe('isRecognitionWaveformQualityAcceptable', () => {
    it('应该总是返回true（测试模式下接受所有波形）', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 512);
      const isAcceptable = isRecognitionWaveformQualityAcceptable(result);

      expect(isAcceptable).toBe(true);
    });

    it('应该对降级波形也返回true', () => {
      // 即使是降级算法，也应该返回true
      const waveform = {
        ch1: generateSignal(100), // 很短的波形，可能导致降级
        ch2: generateSignal(100),
        ch3: generateSignal(100)
      };

      const result = processRecognitionWaveform(waveform, 512);
      const isAcceptable = isRecognitionWaveformQualityAcceptable(result);

      expect(isAcceptable).toBe(true);
    });
  });

  describe('getRecognitionWaveformQualityScore', () => {
    it('应该返回0-100之间的评分', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 512);
      const score = getRecognitionWaveformQualityScore(result);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('应该对主算法给予更高的评分', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 512);

      if (result.meta.croppingMeta.stage === 'primary') {
        const score = getRecognitionWaveformQualityScore(result);
        // 主算法的评分应该比较高
        expect(score).toBeGreaterThan(30);
      }
    });

    it('应该基于置信度计算评分', () => {
      const waveform = {
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      };

      const result = processRecognitionWaveform(waveform, 512);
      const score = getRecognitionWaveformQualityScore(result);
      const expectedScore = result.meta.croppingMeta.confidence * 100 * 
        (result.meta.croppingMeta.stage === 'primary' ? 1 : 0.5);

      expect(score).toBeCloseTo(Math.min(100, Math.max(0, expectedScore)), 0);
    });
  });
});

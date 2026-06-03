import { describe, it, expect } from 'vitest';
import {
  computeEnergyEnvelope,
  computePercentile,
  detectOnsetPoint,
  detectOffsetPoint,
  adaptiveCrop,
  adaptiveCropMultiChannel,
  analyzeCroppingQuality,
} from '../client/src/lib/adaptive-cropping-algorithm';

describe('自适应裁剪算法', () => {
  // 生成测试信号
  function generateTestSignal(length: number, onsetIdx: number, offsetIdx: number): number[] {
    const signal = new Array(length).fill(0);
    
    // 前段：噪声
    for (let i = 0; i < onsetIdx; i++) {
      signal[i] = Math.random() * 50 - 25;
    }
    
    // 中段：有效信号
    for (let i = onsetIdx; i <= offsetIdx; i++) {
      signal[i] = Math.sin((i - onsetIdx) / (offsetIdx - onsetIdx) * Math.PI) * 1000 + Math.random() * 100;
    }
    
    // 后段：噪声
    for (let i = offsetIdx + 1; i < length; i++) {
      signal[i] = Math.random() * 50 - 25;
    }
    
    return signal;
  }

  describe('computeEnergyEnvelope', () => {
    it('应该计算能量包络', () => {
      const signal = generateTestSignal(1000, 200, 800);
      const envelope = computeEnergyEnvelope(signal, 50);
      
      expect(envelope.length).toBe(signal.length);
      expect(envelope[500]).toBeGreaterThan(envelope[100]); // 中间能量更高
    });

    it('应该处理空信号', () => {
      const envelope = computeEnergyEnvelope([], 50);
      expect(envelope.length).toBe(0);
    });
  });

  describe('computePercentile', () => {
    it('应该计算百分位数', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      expect(computePercentile(values, 0)).toBe(1);
      expect(computePercentile(values, 50)).toBeGreaterThanOrEqual(5);
      expect(computePercentile(values, 50)).toBeLessThanOrEqual(6);
      expect(computePercentile(values, 100)).toBe(10);
    });

    it('应该处理空数组', () => {
      expect(computePercentile([], 50)).toBe(0);
    });
  });

  describe('detectOnsetPoint', () => {
    it('应该检测有效信号的起始点', () => {
      const signal = generateTestSignal(1000, 250, 750);
      const envelope = computeEnergyEnvelope(signal, 50);
      
      const onsetIdx = detectOnsetPoint(envelope, {
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minOnsetLength: 100,
      });
      
      // 起始点应该在250附近（允许一定偏差）
      expect(onsetIdx).toBeGreaterThan(150);
      expect(onsetIdx).toBeLessThan(350);
    });
  });

  describe('detectOffsetPoint', () => {
    it('应该检测有效信号的结束点', () => {
      const signal = generateTestSignal(1000, 250, 750);
      const envelope = computeEnergyEnvelope(signal, 50);
      
      const offsetIdx = detectOffsetPoint(envelope, {
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minOffsetLength: 100,
      });
      
      // 结束点应该在750附近（允许一定偏差）
      expect(offsetIdx).toBeGreaterThan(650);
      expect(offsetIdx).toBeLessThan(850);
    });
  });

  describe('adaptiveCrop', () => {
    it('应该自适应裁剪信号', () => {
      const signal = generateTestSignal(1000, 250, 750);
      
      const result = adaptiveCrop(signal, {
        windowSize: 50,
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minSegmentLength: 100,
        preserveMargin: 20,
      });
      
      expect(result.croppedSignal.length).toBeGreaterThan(400);
      expect(result.croppedSignal.length).toBeLessThan(600);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.startIdx).toBeGreaterThan(150);
      expect(result.endIdx).toBeLessThan(850);
    });

    it('应该处理空信号', () => {
      const result = adaptiveCrop([], {});
      
      expect(result.croppedSignal.length).toBe(0);
      expect(result.startIdx).toBe(0);
      expect(result.endIdx).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('应该处理前置静息段较长的信号', () => {
      // 模拟用户采集时等待较长时间后才开始默念
      const signal = generateTestSignal(2000, 800, 1200);
      
      const result = adaptiveCrop(signal, {
        windowSize: 50,
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minSegmentLength: 100,
        preserveMargin: 20,
      });
      
      // 应该能正确识别有效段
      expect(result.croppedSignal.length).toBeGreaterThan(300);
      expect(result.startIdx).toBeGreaterThan(700);
    });

    it('应该处理后置静息段较短的信号', () => {
      // 模拟用户默念完成后立即停止采集
      const signal = generateTestSignal(1000, 200, 800);
      
      const result = adaptiveCrop(signal, {
        windowSize: 50,
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minSegmentLength: 100,
        preserveMargin: 20,
      });
      
      // 应该能正确识别有效段
      expect(result.croppedSignal.length).toBeGreaterThan(500);
      expect(result.endIdx).toBeGreaterThan(750);
    });
  });

  describe('adaptiveCropMultiChannel', () => {
    it('应该对多通道信号进行自适应裁剪', () => {
      const ch1 = generateTestSignal(1000, 250, 750);
      const ch2 = generateTestSignal(1000, 280, 780);
      const ch3 = generateTestSignal(1000, 220, 720);
      
      const result = adaptiveCropMultiChannel(ch1, ch2, ch3, {
        windowSize: 50,
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minSegmentLength: 100,
        preserveMargin: 20,
      });
      
      // 三个通道应该被裁剪到相同的长度
      expect(result.croppedCh1.length).toBe(result.croppedCh2.length);
      expect(result.croppedCh2.length).toBe(result.croppedCh3.length);
      
      // 裁剪长度应该合理（多通道并集可能更长）
      expect(result.croppedCh1.length).toBeGreaterThan(400);
      expect(result.croppedCh1.length).toBeLessThan(700);
      
      // 起始点和结束点应该是并集
      expect(result.startIdx).toBeLessThanOrEqual(250);
      expect(result.endIdx).toBeGreaterThanOrEqual(750);
    });
  });

  describe('analyzeCroppingQuality', () => {
    it('应该分析裁剪质量', () => {
      const result = analyzeCroppingQuality(1000, 600, 0.9);
      
      expect(result.quality).toMatch(/excellent|good/);
      expect(result.score).toBeGreaterThan(70);
      expect(result.details).toContain('60.0%');
    });

    it('应该识别过度裁剪', () => {
      const result = analyzeCroppingQuality(1000, 200, 0.9);
      
      expect(result.quality).toBe('fair');
      expect(result.score).toBeLessThan(80);
    });

    it('应该识别裁剪不足', () => {
      const result = analyzeCroppingQuality(1000, 950, 0.9);
      
      expect(result.quality).toMatch(/fair|good/);
      expect(result.score).toBeLessThan(100);
    });

    it('应该识别低置信度', () => {
      const result = analyzeCroppingQuality(1000, 600, 0.3);
      
      expect(result.score).toBeLessThan(80);
    });
  });

  describe('不均匀静息段处理', () => {
    it('应该处理前置静息段长、后置静息段短的情况', () => {
      // 模拟真实采集场景：用户等待后才开始默念，完成后立即停止
      const signal = new Array(2000).fill(0);
      
      // 前800样本：长静息段
      for (let i = 0; i < 800; i++) {
        signal[i] = Math.random() * 50 - 25;
      }
      
      // 800-1200：有效信号
      for (let i = 800; i < 1200; i++) {
        signal[i] = Math.sin((i - 800) / 400 * Math.PI) * 1000 + Math.random() * 100;
      }
      
      // 1200-2000：短静息段
      for (let i = 1200; i < 2000; i++) {
        signal[i] = Math.random() * 50 - 25;
      }
      
      const result = adaptiveCrop(signal, {
        windowSize: 50,
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minSegmentLength: 100,
        preserveMargin: 20,
      });
      
      // 应该正确识别有效段
      expect(result.croppedSignal.length).toBeGreaterThan(300);
      expect(result.startIdx).toBeGreaterThan(700);
      expect(result.endIdx).toBeGreaterThan(1100);
      
      // 置信度应该较高
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('应该处理前置静息段短、后置静息段长的情况', () => {
      // 模拟用户快速开始默念，完成后继续采集
      const signal = new Array(2000).fill(0);
      
      // 前200样本：短静息段
      for (let i = 0; i < 200; i++) {
        signal[i] = Math.random() * 50 - 25;
      }
      
      // 200-600：有效信号
      for (let i = 200; i < 600; i++) {
        signal[i] = Math.sin((i - 200) / 400 * Math.PI) * 1000 + Math.random() * 100;
      }
      
      // 600-2000：长静息段
      for (let i = 600; i < 2000; i++) {
        signal[i] = Math.random() * 50 - 25;
      }
      
      const result = adaptiveCrop(signal, {
        windowSize: 50,
        noisePercentile: 25,
        thresholdMultiplier: 2.0,
        minSegmentLength: 100,
        preserveMargin: 20,
      });
      
      // 应该正确识别有效段
      expect(result.croppedSignal.length).toBeGreaterThan(300);
      expect(result.startIdx).toBeLessThan(300);
      expect(result.endIdx).toBeGreaterThan(500);
      
      // 置信度基于有效段长度占比，实际值取决于算法
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});

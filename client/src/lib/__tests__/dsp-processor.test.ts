/**
 * DSP 处理模块单元测试
 * 
 * 测试覆盖：
 * - 信号预处理（滤波、去趋势）
 * - 特征提取（时域、频域）
 * - 波形裁剪和对齐
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractFullFeatures,
  detectValidSegment,
  cropWaveform,
  normalizeFeatures,
} from '../dsp-processor';

describe('DSP Processor', () => {
  let testWaveform: { ch1: number[]; ch2: number[]; ch3: number[] };

  beforeEach(() => {
    // 生成测试波形：正弦波 + 噪声
    const length = 500;
    testWaveform = {
      ch1: Array.from({ length }, (_, i) => Math.sin(i * 0.1) * 100 + Math.random() * 10),
      ch2: Array.from({ length }, (_, i) => Math.sin(i * 0.1 + 1) * 100 + Math.random() * 10),
      ch3: Array.from({ length }, (_, i) => Math.sin(i * 0.1 + 2) * 100 + Math.random() * 10),
    };
  });

  describe('extractFullFeatures', () => {
    it('应该提取 180 维特征向量', () => {
      const features = extractFullFeatures(testWaveform, 500);
      expect(features).toBeDefined();
      expect(features.length).toBe(180);
      expect(features.every(f => typeof f === 'number')).toBe(true);
    });

    it('特征向量应该包含有限值', () => {
      const features = extractFullFeatures(testWaveform, 500);
      expect(features.every(f => isFinite(f))).toBe(true);
    });

    it('不同波形应该产生不同特征', () => {
      const features1 = extractFullFeatures(testWaveform, 500);
      
      // 修改波形
      const modifiedWaveform = {
        ch1: testWaveform.ch1.map(v => v * 2),
        ch2: testWaveform.ch2,
        ch3: testWaveform.ch3,
      };
      const features2 = extractFullFeatures(modifiedWaveform, 500);
      
      // 特征应该不同
      const diff = features1.reduce((sum, f, i) => sum + Math.abs(f - features2[i]), 0);
      expect(diff).toBeGreaterThan(0);
    });
  });

  describe('detectValidSegment', () => {
    it('应该检测有效的信号段', () => {
      const segment = detectValidSegment(testWaveform.ch1);
      expect(segment).toBeDefined();
      expect(segment.start).toBeGreaterThanOrEqual(0);
      expect(segment.end).toBeLessThanOrEqual(testWaveform.ch1.length);
      expect(segment.end).toBeGreaterThan(segment.start);
    });

    it('应该处理全零信号', () => {
      const zeroSignal = Array(100).fill(0);
      const segment = detectValidSegment(zeroSignal);
      expect(segment).toBeDefined();
      // 全零信号应该返回整个范围或空范围
      expect(segment.end - segment.start).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cropWaveform', () => {
    it('应该正确裁剪波形', () => {
      const cropped = cropWaveform(testWaveform, 100, 300);
      expect(cropped.ch1.length).toBe(200);
      expect(cropped.ch2.length).toBe(200);
      expect(cropped.ch3.length).toBe(200);
    });

    it('裁剪后的波形应该是原波形的子集', () => {
      const cropped = cropWaveform(testWaveform, 50, 150);
      for (let i = 0; i < cropped.ch1.length; i++) {
        expect(cropped.ch1[i]).toBe(testWaveform.ch1[i + 50]);
      }
    });
  });

  describe('normalizeFeatures', () => {
    it('应该正规化特征向量', () => {
      const features = extractFullFeatures(testWaveform, 500);
      const normalized = normalizeFeatures(features);
      
      expect(normalized.length).toBe(features.length);
      expect(normalized.every(f => isFinite(f))).toBe(true);
    });

    it('正规化后的特征应该有较小的方差', () => {
      const features = extractFullFeatures(testWaveform, 500);
      const normalized = normalizeFeatures(features);
      
      // 计算方差
      const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length;
      const variance = normalized.reduce((sum, f) => sum + (f - mean) ** 2, 0) / normalized.length;
      
      expect(variance).toBeLessThan(1);
    });
  });
});

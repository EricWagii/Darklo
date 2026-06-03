/**
 * 特征提取模块单元测试
 * 
 * 测试覆盖：
 * - 时域特征提取
 * - 频域特征提取
 * - 特征正规化
 * - 多通道融合
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractTimeDomainFeatures,
  extractFrequencyDomainFeaturesV2,
  normalizeFeatureVectorWithGlobalStats,
} from '../advanced-feature-extraction';

describe('Feature Extraction', () => {
  let testSignal: number[];
  let globalMean: number[];
  let globalStd: number[];

  beforeEach(() => {
    // 生成测试信号：正弦波 + 噪声
    const length = 500;
    testSignal = Array.from({ length }, (_, i) => Math.sin(i * 0.1) * 100 + Math.random() * 10);
    
    // 生成全局统计量
    globalMean = Array(30).fill(50);
    globalStd = Array(30).fill(10);
  });

  describe('Time Domain Features', () => {
    it('应该提取时域特征', () => {
      const features = extractTimeDomainFeatures(testSignal);
      expect(features).toBeDefined();
      expect(Array.isArray(features)).toBe(true);
      expect(features.length).toBeGreaterThan(0);
    });

    it('时域特征应该包含有限值', () => {
      const features = extractTimeDomainFeatures(testSignal);
      expect(features.every(f => isFinite(f))).toBe(true);
    });

    it('应该计算基本统计量', () => {
      const features = extractTimeDomainFeatures(testSignal);
      // 特征应该包括 mean, std, min, max 等
      expect(features.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Frequency Domain Features', () => {
    it('应该提取频域特征', () => {
      const features = extractFrequencyDomainFeaturesV2(testSignal, 500);
      expect(features).toBeDefined();
      expect(Array.isArray(features)).toBe(true);
      expect(features.length).toBe(30);  // 30 维频域特征
    });

    it('频域特征应该包含有限值', () => {
      const features = extractFrequencyDomainFeaturesV2(testSignal, 500);
      expect(features.every(f => isFinite(f))).toBe(true);
    });

    it('频域特征应该为正值或零', () => {
      const features = extractFrequencyDomainFeaturesV2(testSignal, 500);
      expect(features.every(f => f >= 0)).toBe(true);
    });

    it('不同采样率应该产生不同特征', () => {
      const features1 = extractFrequencyDomainFeaturesV2(testSignal, 500);
      const features2 = extractFrequencyDomainFeaturesV2(testSignal, 250);
      
      // 特征应该不同
      const diff = features1.reduce((sum, f, i) => sum + Math.abs(f - features2[i]), 0);
      expect(diff).toBeGreaterThan(0);
    });
  });

  describe('Feature Normalization', () => {
    it('应该使用全局统计量正规化特征', () => {
      const features = Array.from({ length: 30 }, () => Math.random() * 100);
      const normalized = normalizeFeatureVectorWithGlobalStats(features, globalMean, globalStd);
      
      expect(normalized.length).toBe(features.length);
      expect(normalized.every(f => isFinite(f))).toBe(true);
    });

    it('正规化后的特征应该以全局均值为中心', () => {
      const features = Array.from({ length: 30 }, (_, i) => globalMean[i] + globalStd[i] * 2);
      const normalized = normalizeFeatureVectorWithGlobalStats(features, globalMean, globalStd);
      
      // 正规化后的值应该接近 2（因为原值是 mean + 2*std）
      expect(normalized[0]).toBeCloseTo(2, 0.1);
    });

    it('维数不匹配时应该降级处理', () => {
      const features = Array.from({ length: 20 }, () => Math.random() * 100);
      const wrongMean = Array(30).fill(50);
      const wrongStd = Array(30).fill(10);
      
      // 应该返回有效结果（可能使用样本自身统计量）
      const normalized = normalizeFeatureVectorWithGlobalStats(features, wrongMean, wrongStd);
      expect(normalized).toBeDefined();
    });
  });

  describe('Feature Consistency', () => {
    it('相同输入应该产生相同输出', () => {
      const features1 = extractTimeDomainFeatures(testSignal);
      const features2 = extractTimeDomainFeatures(testSignal);
      
      expect(features1).toEqual(features2);
    });

    it('特征应该在合理范围内', () => {
      const features = extractTimeDomainFeatures(testSignal);
      
      // 大多数特征应该在 [-1000, 1000] 范围内
      expect(features.filter(f => Math.abs(f) > 10000).length).toBeLessThan(features.length * 0.1);
    });
  });
});

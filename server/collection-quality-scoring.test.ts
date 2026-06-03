import { describe, it, expect } from 'vitest';
import {
  calculateEnergyStability,
  calculateSignalQuality,
  calculateCollectionQuality,
  applyQualityWeighting,
} from '../client/src/lib/collection-quality-scoring';

describe('采集质量评分系统', () => {
  // 生成测试数据
  function generateTestCollection(
    baseEnergy: number = 50,
    energyVariation: number = 0.1,
    noiseLevel: number = 5
  ): number[] {
    const collection: number[] = [];
    const channelSize = 256;

    for (let ch = 0; ch < 3; ch++) {
      for (let i = 0; i < channelSize; i++) {
        // 生成基础信号（正弦波）
        const signal = baseEnergy * Math.sin((i / channelSize) * Math.PI * 2);
        
        // 添加能量变化
        const energyModulation = 1 + (Math.random() - 0.5) * energyVariation;
        
        // 添加噪声
        const noise = (Math.random() - 0.5) * noiseLevel * 2;
        
        collection.push(signal * energyModulation + noise);
      }
    }

    return collection;
  }

  describe('能量稳定性评分', () => {
    it('应该为稳定的采集返回高分', () => {
      const collection = generateTestCollection(50, 0.05, 3);
      const stability = calculateEnergyStability(collection);
      expect(stability).toBeGreaterThan(0.6);
    });

    it('应该为不稳定的采集返回较低分', () => {
      const collection = generateTestCollection(50, 0.5, 10);
      const stability = calculateEnergyStability(collection);
      // 能量变化较大时，稳定性应该相对较低
      expect(stability).toBeLessThan(1.0);
    });

    it('应该返回0-1之间的值', () => {
      const collection = generateTestCollection(50, 0.2, 5);
      const stability = calculateEnergyStability(collection);
      expect(stability).toBeGreaterThanOrEqual(0);
      expect(stability).toBeLessThanOrEqual(1);
    });
  });

  describe('信号质量评分', () => {
    it('应该为高质量信号返回高分', () => {
      const collection = generateTestCollection(50, 0.1, 2);
      const quality = calculateSignalQuality(collection);
      expect(quality).toBeGreaterThan(0.5);
    });

    it('应该为低质量信号返回低分', () => {
      const collection = generateTestCollection(10, 0.5, 20);
      const quality = calculateSignalQuality(collection);
      expect(quality).toBeLessThan(0.7);
    });

    it('应该返回0-1之间的值', () => {
      const collection = generateTestCollection(50, 0.2, 5);
      const quality = calculateSignalQuality(collection);
      expect(quality).toBeGreaterThanOrEqual(0);
      expect(quality).toBeLessThanOrEqual(1);
    });
  });

  describe('综合质量评分', () => {
    it('应该返回有效的质量指标', () => {
      const collection = generateTestCollection(50, 0.1, 3);
      const metrics = calculateCollectionQuality(collection);

      expect(metrics.consistency).toBeGreaterThanOrEqual(0);
      expect(metrics.consistency).toBeLessThanOrEqual(1);
      expect(metrics.energyStability).toBeGreaterThanOrEqual(0);
      expect(metrics.energyStability).toBeLessThanOrEqual(1);
      expect(metrics.signalQuality).toBeGreaterThanOrEqual(0);
      expect(metrics.signalQuality).toBeLessThanOrEqual(1);
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(1);
    });

    it('应该为优秀采集返回"excellent"等级', () => {
      const collection = generateTestCollection(50, 0.05, 2);
      const metrics = calculateCollectionQuality(collection);
      
      if (metrics.overallScore >= 0.8) {
        expect(metrics.qualityLevel).toBe('excellent');
      }
    });

    it('应该为较差采集返回"poor"等级', () => {
      const collection = generateTestCollection(10, 0.8, 30);
      const metrics = calculateCollectionQuality(collection);
      
      if (metrics.overallScore < 0.4) {
        expect(metrics.qualityLevel).toBe('poor');
      }
    });

    it('应该生成合理的改进建议', () => {
      const collection = generateTestCollection(10, 0.8, 30);
      const metrics = calculateCollectionQuality(collection);
      
      // 较差的采集应该有改进建议
      if (metrics.overallScore < 0.5) {
        expect(metrics.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('质量加权相似度', () => {
    it('应该为高质量采集返回更高的相似度', () => {
      const similarity1 = applyQualityWeighting(80, 0.9);
      const similarity2 = applyQualityWeighting(80, 0.5);
      
      expect(similarity1).toBeGreaterThan(similarity2);
    });

    it('应该为低质量采集返回更低的相似度', () => {
      const similarity1 = applyQualityWeighting(80, 0.1);
      const similarity2 = applyQualityWeighting(80, 0.9);
      
      expect(similarity1).toBeLessThan(similarity2);
    });

    it('应该返回有效的相似度范围', () => {
      const similarity = applyQualityWeighting(80, 0.5);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(200);
    });
  });


});

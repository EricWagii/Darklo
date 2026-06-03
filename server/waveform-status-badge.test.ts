import { describe, it, expect } from 'vitest';
import {
  getStatusPriority,
  determineProcessingStatus,
  calculateStatusStats,
  WaveformStatusStats
} from '../client/src/components/WaveformStatusBadge';

describe('WaveformStatusBadge', () => {
  describe('状态优先级', () => {
    it('应该返回正确的优先级', () => {
      expect(getStatusPriority('processed')).toBe(1);
      expect(getStatusPriority('degraded')).toBe(2);
      expect(getStatusPriority('raw')).toBe(3);
    });

    it('优先级应该用于排序', () => {
      const statuses = ['raw', 'processed', 'degraded'] as const;
      const sorted = statuses.sort((a, b) => getStatusPriority(a) - getStatusPriority(b));
      
      expect(sorted[0]).toBe('processed');
      expect(sorted[1]).toBe('degraded');
      expect(sorted[2]).toBe('raw');
    });
  });

  describe('处理状态判断', () => {
    it('没有croppingMeta时应该返回raw状态', () => {
      const result = determineProcessingStatus(undefined);
      
      expect(result.status).toBe('raw');
      expect(result.confidence).toBe(0);
    });

    it('双端静息估计且置信度高时应该返回processed状态', () => {
      const croppingMeta = {
        method: 'resting-baseline',
        confidence: 0.8
      };
      
      const result = determineProcessingStatus(croppingMeta);
      
      expect(result.status).toBe('processed');
      expect(result.confidence).toBe(0.8);
    });

    it('Otsu二值化应该返回degraded状态', () => {
      const croppingMeta = {
        method: 'otsu',
        confidence: 0.5
      };
      
      const result = determineProcessingStatus(croppingMeta);
      
      expect(result.status).toBe('degraded');
      expect(result.confidence).toBe(0.5);
    });

    it('置信度大于0.25时应该返回degraded状态', () => {
      const croppingMeta = {
        method: 'unknown',
        confidence: 0.3
      };
      
      const result = determineProcessingStatus(croppingMeta);
      
      expect(result.status).toBe('degraded');
      expect(result.confidence).toBe(0.3);
    });

    it('置信度低于0.25时应该返回raw状态', () => {
      const croppingMeta = {
        method: 'unknown',
        confidence: 0.1
      };
      
      const result = determineProcessingStatus(croppingMeta);
      
      expect(result.status).toBe('raw');
      expect(result.confidence).toBe(0);
    });
  });

  describe('状态统计', () => {
    it('应该正确统计采集记录的状态', () => {
      const collections = [
        { croppingMeta: { method: 'resting-baseline', confidence: 0.8 } },
        { croppingMeta: { method: 'resting-baseline', confidence: 0.7 } },
        { croppingMeta: { method: 'otsu', confidence: 0.5 } },
        { croppingMeta: { method: 'otsu', confidence: 0.4 } },
        { croppingMeta: { method: 'otsu', confidence: 0.3 } },
        { croppingMeta: undefined }
      ];
      
      const stats = calculateStatusStats(collections);
      
      expect(stats.total).toBe(6);
      expect(stats.processed).toBe(2);
      expect(stats.degraded).toBe(3);
      expect(stats.raw).toBe(1);
    });

    it('空列表应该返回零统计', () => {
      const stats = calculateStatusStats([]);
      
      expect(stats.total).toBe(0);
      expect(stats.processed).toBe(0);
      expect(stats.degraded).toBe(0);
      expect(stats.raw).toBe(0);
    });

    it('全部已处理的列表应该返回正确统计', () => {
      const collections = [
        { croppingMeta: { method: 'resting-baseline', confidence: 0.8 } },
        { croppingMeta: { method: 'resting-baseline', confidence: 0.9 } },
        { croppingMeta: { method: 'resting-baseline', confidence: 0.7 } }
      ];
      
      const stats = calculateStatusStats(collections);
      
      expect(stats.total).toBe(3);
      expect(stats.processed).toBe(3);
      expect(stats.degraded).toBe(0);
      expect(stats.raw).toBe(0);
    });

    it('全部未处理的列表应该返回正确统计', () => {
      const collections = [
        { croppingMeta: undefined },
        { croppingMeta: undefined },
        { croppingMeta: undefined }
      ];
      
      const stats = calculateStatusStats(collections);
      
      expect(stats.total).toBe(3);
      expect(stats.processed).toBe(0);
      expect(stats.degraded).toBe(0);
      expect(stats.raw).toBe(3);
    });
  });

  describe('混合场景', () => {
    it('应该处理复杂的采集列表', () => {
      const collections = [
        // 高质量采集
        { id: '1', croppingMeta: { method: 'resting-baseline', confidence: 0.95 } },
        { id: '2', croppingMeta: { method: 'resting-baseline', confidence: 0.85 } },
        
        // 中等质量采集
        { id: '3', croppingMeta: { method: 'otsu', confidence: 0.6 } },
        { id: '4', croppingMeta: { method: 'otsu', confidence: 0.5 } },
        { id: '5', croppingMeta: { method: 'otsu', confidence: 0.4 } },
        
        // 低质量采集
        { id: '6', croppingMeta: { method: 'unknown', confidence: 0.2 } },
        { id: '7', croppingMeta: undefined }
      ];
      
      const stats = calculateStatusStats(collections);
      
      expect(stats.total).toBe(7);
      expect(stats.processed).toBe(2);
      expect(stats.degraded).toBe(3);
      expect(stats.raw).toBe(2);
    });

    it('应该计算正确的百分比', () => {
      const collections = Array(10).fill(null).map((_, i) => ({
        croppingMeta: i < 5 
          ? { method: 'resting-baseline', confidence: 0.8 }
          : { method: 'otsu', confidence: 0.5 }
      }));
      
      const stats = calculateStatusStats(collections);
      
      expect(stats.total).toBe(10);
      expect(stats.processed).toBe(5);
      expect(stats.degraded).toBe(5);
      expect(stats.raw).toBe(0);
      
      // 验证百分比计算
      const processedPercent = (stats.processed / stats.total) * 100;
      const degradedPercent = (stats.degraded / stats.total) * 100;
      
      expect(processedPercent).toBe(50);
      expect(degradedPercent).toBe(50);
    });
  });
});

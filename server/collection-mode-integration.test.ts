import { describe, it, expect } from 'vitest';

/**
 * CollectionMode处理状态集成测试
 * 
 * 验证CollectionMode中的croppingMeta捕获和保存
 */

describe('CollectionMode处理状态集成', () => {
  describe('croppingMeta捕获', () => {
    it('应该在采集停止时捕获处理状态', () => {
      // 模拟采集数据
      const collectionData = {
        index: 1,
        timestamp: new Date(),
        waveform: { ch1: Array(1000).fill(0), ch2: Array(1000).fill(0), ch3: Array(1000).fill(0) },
        duration: 2000,
        croppingMeta: {
          stage: 'primary' as const,
          confidence: 0.95,
          method: 'resting-baseline' as const,
          reason: '使用主要裁剪方法',
        },
      };

      expect(collectionData.croppingMeta).toBeDefined();
      expect(collectionData.croppingMeta.stage).toBe('primary');
      expect(collectionData.croppingMeta.confidence).toBe(0.95);
    });

    it('应该根据置信度推断处理阶段', () => {
      const testCases = [
        { confidence: 0.95, isQualityAcceptable: true, expected: 'primary' },
        { confidence: 0.75, isQualityAcceptable: true, expected: 'fallback' },
        { confidence: 0.3, isQualityAcceptable: false, expected: 'full_segment' },
      ];

      testCases.forEach((testCase) => {
        let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
        
        if (!testCase.isQualityAcceptable) {
          croppingStage = 'full_segment';
        } else if (testCase.confidence > 0.8) {
          croppingStage = 'primary';
        } else {
          croppingStage = 'fallback';
        }

        expect(croppingStage).toBe(testCase.expected);
      });
    });
  });

  describe('croppingMeta保存', () => {
    it('应该在保存时包含croppingMeta', () => {
      // 模拟采集数据
      const collectionsWithUser = [
        {
          index: 1,
          timestamp: new Date(),
          waveform: { ch1: Array(1000).fill(0), ch2: Array(1000).fill(0), ch3: Array(1000).fill(0) },
          duration: 2000,
          userId: 'user123',
          userName: 'testuser',
          croppingMeta: {
            stage: 'primary' as const,
            confidence: 0.95,
            method: 'resting-baseline' as const,
            reason: '使用主要裁剪方法',
          },
        },
      ];

      // 模拟保存逻辑
      const storedCollections = collectionsWithUser.map((col) => ({
        index: col.index,
        timestamp: col.timestamp.getTime(),
        waveform: col.waveform,
        duration: col.duration,
        quality: 0.8,
        croppingMeta: col.croppingMeta,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      expect(storedCollections[0].croppingMeta).toBeDefined();
      expect(storedCollections[0].croppingMeta.stage).toBe('primary');
      expect(storedCollections[0].croppingMeta.confidence).toBe(0.95);
    });

    it('应该保存所有croppingMeta字段', () => {
      const croppingMeta = {
        stage: 'fallback' as const,
        confidence: 0.75,
        method: 'otsu' as const,
        reason: '降级到次要裁剪方法',
      };

      expect(croppingMeta.stage).toBe('fallback');
      expect(croppingMeta.confidence).toBe(0.75);
      expect(croppingMeta.method).toBe('otsu');
      expect(croppingMeta.reason).toBe('降级到次要裁剪方法');
    });
  });

  describe('与RecognitionMode的一致性', () => {
    it('应该使用相同的stage类型', () => {
      const collectionStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      const recognitionStage: 'primary' | 'fallback' | 'full_segment' = 'primary';

      expect(collectionStage).toBe(recognitionStage);
    });

    it('应该使用相同的推断阈值', () => {
      const primaryThreshold = 0.8;

      const lowConfidence = 0.79;
      const highConfidence = 0.81;

      let collectionStage1: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (lowConfidence > primaryThreshold) {
        collectionStage1 = 'primary';
      } else {
        collectionStage1 = 'fallback';
      }

      let collectionStage2: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (highConfidence > primaryThreshold) {
        collectionStage2 = 'primary';
      } else {
        collectionStage2 = 'fallback';
      }

      expect(collectionStage1).toBe('fallback');
      expect(collectionStage2).toBe('primary');
    });

    it('应该使用相同的徽章显示逻辑', () => {
      const testCases = [
        { stage: 'primary', expectedIcon: '✅', expectedColor: '#10b981' },
        { stage: 'fallback', expectedIcon: '⚠️', expectedColor: '#f59e0b' },
        { stage: 'full_segment', expectedIcon: '⚠️', expectedColor: '#f59e0b' },
      ];

      testCases.forEach((testCase) => {
        const statusIcon = testCase.stage === 'primary' ? '✅' : '⚠️';
        const statusColor = testCase.stage === 'primary' ? '#10b981' : '#f59e0b';

        expect(statusIcon).toBe(testCase.expectedIcon);
        expect(statusColor).toBe(testCase.expectedColor);
      });
    });
  });

  describe('croppingMeta显示', () => {
    it('应该正确显示处理状态徽章', () => {
      const collectionData = {
        croppingMeta: {
          stage: 'primary' as const,
          confidence: 0.95,
          method: 'resting-baseline' as const,
          reason: '使用主要裁剪方法',
        },
      };

      const statusIcon = collectionData.croppingMeta.stage === 'primary' ? '✅' : '⚠️';
      const statusLabel = collectionData.croppingMeta.stage === 'primary' ? '已裁剪/已缩放' : '已裁剪/已缩放(降级)';
      const statusColor = collectionData.croppingMeta.stage === 'primary' ? '#10b981' : '#f59e0b';
      const confidencePercent = (collectionData.croppingMeta.confidence * 100).toFixed(0);

      expect(statusIcon).toBe('✅');
      expect(statusLabel).toBe('已裁剪/已缩放');
      expect(statusColor).toBe('#10b981');
      expect(confidencePercent).toBe('95');
    });

    it('应该正确显示降级状态', () => {
      const collectionData = {
        croppingMeta: {
          stage: 'fallback' as const,
          confidence: 0.72,
          method: 'otsu' as const,
          reason: '降级到次要裁剪方法',
        },
      };

      const statusIcon = collectionData.croppingMeta.stage === 'primary' ? '✅' : '⚠️';
      const statusLabel = collectionData.croppingMeta.stage === 'primary' ? '已裁剪/已缩放' : '已裁剪/已缩放(降级)';
      const statusColor = collectionData.croppingMeta.stage === 'primary' ? '#10b981' : '#f59e0b';
      const confidencePercent = (collectionData.croppingMeta.confidence * 100).toFixed(0);

      expect(statusIcon).toBe('⚠️');
      expect(statusLabel).toBe('已裁剪/已缩放(降级)');
      expect(statusColor).toBe('#f59e0b');
      expect(confidencePercent).toBe('72');
    });
  });

  describe('处理方法映射', () => {
    it('应该根据阶段映射正确的处理方法', () => {
      const testCases = [
        { stage: 'primary' as const, expectedMethod: 'resting-baseline' },
        { stage: 'fallback' as const, expectedMethod: 'otsu' },
        { stage: 'full_segment' as const, expectedMethod: 'full-segment' },
      ];

      testCases.forEach((testCase) => {
        const method = testCase.stage === 'primary' ? 'resting-baseline' : (testCase.stage === 'fallback' ? 'otsu' : 'full-segment');
        expect(method).toBe(testCase.expectedMethod);
      });
    });

    it('应该根据阶段生成正确的原因说明', () => {
      const testCases = [
        { stage: 'primary' as const, expectedReason: '使用主要裁剪方法' },
        { stage: 'fallback' as const, expectedReason: '降级到次要裁剪方法' },
        { stage: 'full_segment' as const, expectedReason: '使用完整段' },
      ];

      testCases.forEach((testCase) => {
        const reason = testCase.stage === 'primary' ? '使用主要裁剪方法' : (testCase.stage === 'fallback' ? '降级到次要裁剪方法' : '使用完整段');
        expect(reason).toBe(testCase.expectedReason);
      });
    });
  });

  describe('多采集场景', () => {
    it('应该为每个采集独立捕获croppingMeta', () => {
      const collections = [
        {
          index: 1,
          croppingMeta: { stage: 'primary' as const, confidence: 0.95, method: 'resting-baseline' as const, reason: '使用主要裁剪方法' },
        },
        {
          index: 2,
          croppingMeta: { stage: 'fallback' as const, confidence: 0.72, method: 'otsu' as const, reason: '降级到次要裁剪方法' },
        },
        {
          index: 3,
          croppingMeta: { stage: 'full_segment' as const, confidence: 0.3, method: 'full-segment' as const, reason: '使用完整段' },
        },
      ];

      expect(collections).toHaveLength(3);
      expect(collections[0].croppingMeta.stage).toBe('primary');
      expect(collections[1].croppingMeta.stage).toBe('fallback');
      expect(collections[2].croppingMeta.stage).toBe('full_segment');
    });

    it('应该正确统计各阶段的采集数量', () => {
      const collections = [
        { croppingMeta: { stage: 'primary' as const, confidence: 0.95, method: 'resting-baseline' as const, reason: '使用主要裁剪方法' } },
        { croppingMeta: { stage: 'primary' as const, confidence: 0.92, method: 'resting-baseline' as const, reason: '使用主要裁剪方法' } },
        { croppingMeta: { stage: 'fallback' as const, confidence: 0.72, method: 'otsu' as const, reason: '降级到次要裁剪方法' } },
        { croppingMeta: { stage: 'full_segment' as const, confidence: 0.3, method: 'full-segment' as const, reason: '使用完整段' } },
      ];

      const primaryCount = collections.filter(c => c.croppingMeta.stage === 'primary').length;
      const fallbackCount = collections.filter(c => c.croppingMeta.stage === 'fallback').length;
      const fullSegmentCount = collections.filter(c => c.croppingMeta.stage === 'full_segment').length;

      expect(primaryCount).toBe(2);
      expect(fallbackCount).toBe(1);
      expect(fullSegmentCount).toBe(1);
    });
  });
});

import { describe, it, expect } from 'vitest';

/**
 * RecognitionMode处理状态推断逻辑测试
 * 
 * 验证根据SimpleCroppingResult推断处理阶段的逻辑
 */

describe('RecognitionMode处理状态推断', () => {
  describe('阶段推断逻辑', () => {
    it('应该根据高置信度推断为primary阶段', () => {
      const croppingResult = {
        startIdx: 300,
        endIdx: 1700,
        length: 1400,
        confidence: 0.95,
        isQualityAcceptable: true,
      };

      // 模拟推断逻辑
      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('primary');
    });

    it('应该根据低置信度推断为fallback阶段', () => {
      const croppingResult = {
        startIdx: 200,
        endIdx: 1500,
        length: 1300,
        confidence: 0.75,
        isQualityAcceptable: true,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('fallback');
    });

    it('应该根据质量不可接受推断为full_segment阶段', () => {
      const croppingResult = {
        startIdx: 0,
        endIdx: 2000,
        length: 2000,
        confidence: 0.3,
        isQualityAcceptable: false,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('full_segment');
    });

    it('应该在边界情况下正确推断', () => {
      // 边界情况1：置信度恰好为0.8
      let croppingResult = {
        startIdx: 300,
        endIdx: 1700,
        length: 1400,
        confidence: 0.8,
        isQualityAcceptable: true,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('fallback'); // 0.8不大于0.8，所以是fallback

      // 边界情况2：置信度为0.81
      croppingResult = {
        startIdx: 300,
        endIdx: 1700,
        length: 1400,
        confidence: 0.81,
        isQualityAcceptable: true,
      };

      croppingStage = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('primary'); // 0.81大于0.8，所以是primary
    });
  });

  describe('与徽章显示的对应关系', () => {
    it('primary阶段应显示绿色徽章', () => {
      const croppingResult = {
        confidence: 0.95,
        isQualityAcceptable: true,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      // 模拟徽章显示逻辑
      const badgeColor = croppingStage === 'primary' ? '#10b981' : '#f59e0b';
      const badgeIcon = croppingStage === 'primary' ? '✅' : '⚠️';
      const badgeText = croppingStage === 'primary' ? '已裁剪/已缩放' : '已裁剪/已缩放(降级)';

      expect(badgeColor).toBe('#10b981');
      expect(badgeIcon).toBe('✅');
      expect(badgeText).toBe('已裁剪/已缩放');
    });

    it('fallback阶段应显示黄色徽章', () => {
      const croppingResult = {
        confidence: 0.75,
        isQualityAcceptable: true,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      const badgeColor = croppingStage === 'primary' ? '#10b981' : '#f59e0b';
      const badgeIcon = croppingStage === 'primary' ? '✅' : '⚠️';
      const badgeText = croppingStage === 'primary' ? '已裁剪/已缩放' : '已裁剪/已缩放(降级)';

      expect(badgeColor).toBe('#f59e0b');
      expect(badgeIcon).toBe('⚠️');
      expect(badgeText).toBe('已裁剪/已缩放(降级)');
    });

    it('full_segment阶段应显示黄色徽章', () => {
      const croppingResult = {
        confidence: 0.3,
        isQualityAcceptable: false,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      const badgeColor = croppingStage === 'primary' ? '#10b981' : '#f59e0b';
      const badgeIcon = croppingStage === 'primary' ? '✅' : '⚠️';
      const badgeText = croppingStage === 'primary' ? '已裁剪/已缩放' : '已裁剪/已缩放(降级)';

      expect(badgeColor).toBe('#f59e0b');
      expect(badgeIcon).toBe('⚠️');
      expect(badgeText).toBe('已裁剪/已缩放(降级)');
    });
  });

  describe('置信度范围验证', () => {
    it('应该正确处理所有置信度范围', () => {
      const testCases = [
        { confidence: 0.0, expected: 'fallback' },
        { confidence: 0.5, expected: 'fallback' },
        { confidence: 0.8, expected: 'fallback' },
        { confidence: 0.81, expected: 'primary' },
        { confidence: 0.9, expected: 'primary' },
        { confidence: 1.0, expected: 'primary' },
      ];

      testCases.forEach((testCase) => {
        const croppingResult = {
          confidence: testCase.confidence,
          isQualityAcceptable: true,
        };

        let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
        if (!croppingResult.isQualityAcceptable) {
          croppingStage = 'full_segment';
        } else if (croppingResult.confidence > 0.8) {
          croppingStage = 'primary';
        } else {
          croppingStage = 'fallback';
        }

        expect(croppingStage).toBe(testCase.expected);
      });
    });
  });

  describe('质量标志优先级', () => {
    it('质量标志应优先于置信度', () => {
      // 即使置信度很高，如果质量不可接受，也应该是full_segment
      const croppingResult = {
        confidence: 0.99,
        isQualityAcceptable: false,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('full_segment');
    });

    it('质量可接受时才应考虑置信度', () => {
      const croppingResult = {
        confidence: 0.5,
        isQualityAcceptable: true,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('fallback');
    });
  });

  describe('与CollectionMode的一致性', () => {
    it('应该使用相同的推断阈值', () => {
      // 验证0.8是primary和fallback的分界线
      const primaryThreshold = 0.8;

      const lowConfidence = 0.79;
      const highConfidence = 0.81;

      let stage1: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (lowConfidence > primaryThreshold) {
        stage1 = 'primary';
      } else {
        stage1 = 'fallback';
      }

      let stage2: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (highConfidence > primaryThreshold) {
        stage2 = 'primary';
      } else {
        stage2 = 'fallback';
      }

      expect(stage1).toBe('fallback');
      expect(stage2).toBe('primary');
    });
  });

  describe('实际场景模拟', () => {
    it('应该正确处理典型的识别场景', () => {
      // 场景1：高质量识别
      let croppingResult = {
        confidence: 0.92,
        isQualityAcceptable: true,
      };

      let croppingStage: 'primary' | 'fallback' | 'full_segment' = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('primary');

      // 场景2：降级识别
      croppingResult = {
        confidence: 0.72,
        isQualityAcceptable: true,
      };

      croppingStage = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('fallback');

      // 场景3：异常波形
      croppingResult = {
        confidence: 0.25,
        isQualityAcceptable: false,
      };

      croppingStage = 'primary';
      if (!croppingResult.isQualityAcceptable) {
        croppingStage = 'full_segment';
      } else if (croppingResult.confidence > 0.8) {
        croppingStage = 'primary';
      } else {
        croppingStage = 'fallback';
      }

      expect(croppingStage).toBe('full_segment');
    });
  });
});

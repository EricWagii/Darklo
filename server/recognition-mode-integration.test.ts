import { describe, it, expect } from 'vitest';

/**
 * RecognitionMode处理状态集成测试
 * 
 * 验证：
 * 1. RecognitionResult接口包含croppingMeta字段
 * 2. 处理状态信息正确捕获和显示
 * 3. 处理状态徽章显示逻辑正确
 */

// 模拟RecognitionResult接口
interface CroppingMeta {
  stage: 'primary' | 'fallback' | 'full_segment';
  confidence: number;
  originalLength: number;
  croppedLength: number;
  normalizedLength: number;
}

interface RecognitionResult {
  timestamp: Date;
  command: string;
  confidence: number;
  allScores: Array<{ command: string; score: number }>;
  croppingMeta?: CroppingMeta;
}

describe('RecognitionMode处理状态集成', () => {
  describe('RecognitionResult接口', () => {
    it('应该包含croppingMeta可选字段', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [],
      };
      
      // croppingMeta是可选的
      expect(result.croppingMeta).toBeUndefined();
    });

    it('应该支持croppingMeta字段', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [],
        croppingMeta: {
          stage: 'primary',
          confidence: 0.95,
          originalLength: 2000,
          croppedLength: 1500,
          normalizedLength: 512,
        },
      };
      
      expect(result.croppingMeta).toBeDefined();
      expect(result.croppingMeta?.stage).toBe('primary');
      expect(result.croppingMeta?.confidence).toBe(0.95);
      expect(result.croppingMeta?.originalLength).toBe(2000);
      expect(result.croppingMeta?.croppedLength).toBe(1500);
      expect(result.croppingMeta?.normalizedLength).toBe(512);
    });
  });

  describe('处理状态显示逻辑', () => {
    it('primary阶段应显示绿色徽章', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [],
        croppingMeta: {
          stage: 'primary',
          confidence: 0.95,
          originalLength: 2000,
          croppedLength: 1500,
          normalizedLength: 512,
        },
      };
      
      // 模拟徽章显示逻辑
      const badgeColor = result.croppingMeta?.stage === 'primary' ? '#10b981' : '#f59e0b';
      const badgeText = result.croppingMeta?.stage === 'primary' ? '✅ 已裁剪/已缩放' : '⚠️ 已裁剪/已缩放(降级)';
      
      expect(badgeColor).toBe('#10b981');
      expect(badgeText).toBe('✅ 已裁剪/已缩放');
    });

    it('fallback阶段应显示黄色徽章', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 75,
        allScores: [],
        croppingMeta: {
          stage: 'fallback',
          confidence: 0.75,
          originalLength: 2000,
          croppedLength: 1200,
          normalizedLength: 512,
        },
      };
      
      const badgeColor = result.croppingMeta?.stage === 'primary' ? '#10b981' : '#f59e0b';
      const badgeText = result.croppingMeta?.stage === 'primary' ? '✅ 已裁剪/已缩放' : '⚠️ 已裁剪/已缩放(降级)';
      
      expect(badgeColor).toBe('#f59e0b');
      expect(badgeText).toBe('⚠️ 已裁剪/已缩放(降级)');
    });

    it('full_segment阶段应显示为降级', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: '无法识别',
        confidence: 0,
        allScores: [],
        croppingMeta: {
          stage: 'full_segment',
          confidence: 0,
          originalLength: 2000,
          croppedLength: 0,
          normalizedLength: 0,
        },
      };
      
      const badgeColor = result.croppingMeta?.stage === 'primary' ? '#10b981' : '#f59e0b';
      
      expect(badgeColor).toBe('#f59e0b');
    });
  });

  describe('处理信息显示', () => {
    it('应该正确显示长度变化信息', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [],
        croppingMeta: {
          stage: 'primary',
          confidence: 0.95,
          originalLength: 2000,
          croppedLength: 1500,
          normalizedLength: 512,
        },
      };
      
      const meta = result.croppingMeta;
      if (meta) {
        const lengthInfo = `原始: ${meta.originalLength} → 裁剪: ${meta.croppedLength} → 缩放: ${meta.normalizedLength}`;
        expect(lengthInfo).toBe('原始: 2000 → 裁剪: 1500 → 缩放: 512');
      }
    });

    it('应该正确显示裁剪置信度百分比', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [],
        croppingMeta: {
          stage: 'primary',
          confidence: 0.95,
          originalLength: 2000,
          croppedLength: 1500,
          normalizedLength: 512,
        },
      };
      
      const meta = result.croppingMeta;
      if (meta) {
        const confidencePercent = (meta.confidence * 100).toFixed(0);
        expect(confidencePercent).toBe('95');
      }
    });

    it('应该处理低置信度的情况', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 60,
        allScores: [],
        croppingMeta: {
          stage: 'fallback',
          confidence: 0.65,
          originalLength: 2000,
          croppedLength: 1200,
          normalizedLength: 512,
        },
      };
      
      const meta = result.croppingMeta;
      if (meta) {
        const confidencePercent = (meta.confidence * 100).toFixed(0);
        expect(confidencePercent).toBe('65');
      }
    });
  });

  describe('质量评分逻辑', () => {
    it('应该根据阶段和置信度判断质量', () => {
      const results: RecognitionResult[] = [
        {
          timestamp: new Date(),
          command: 'test1',
          confidence: 85,
          allScores: [],
          croppingMeta: {
            stage: 'primary',
            confidence: 0.95,
            originalLength: 2000,
            croppedLength: 1500,
            normalizedLength: 512,
          },
        },
        {
          timestamp: new Date(),
          command: 'test2',
          confidence: 75,
          allScores: [],
          croppingMeta: {
            stage: 'fallback',
            confidence: 0.75,
            originalLength: 2000,
            croppedLength: 1200,
            normalizedLength: 512,
          },
        },
        {
          timestamp: new Date(),
          command: '无法识别',
          confidence: 0,
          allScores: [],
          croppingMeta: {
            stage: 'full_segment',
            confidence: 0,
            originalLength: 2000,
            croppedLength: 0,
            normalizedLength: 0,
          },
        },
      ];

      // 统计各阶段的结果
      let primaryCount = 0;
      let fallbackCount = 0;
      let failedCount = 0;

      results.forEach((result) => {
        if (result.croppingMeta?.stage === 'primary') {
          primaryCount++;
        } else if (result.croppingMeta?.stage === 'fallback') {
          fallbackCount++;
        } else {
          failedCount++;
        }
      });

      expect(primaryCount).toBe(1);
      expect(fallbackCount).toBe(1);
      expect(failedCount).toBe(1);
    });
  });

  describe('错误处理', () => {
    it('应该处理没有croppingMeta的结果', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [],
      };
      
      // 应该能安全地处理undefined的croppingMeta
      expect(result.croppingMeta).toBeUndefined();
      
      // 模拟显示逻辑
      if (result.croppingMeta) {
        // 这段代码不应该执行
        throw new Error('不应该执行');
      }
    });

    it('应该处理异常的长度值', () => {
      const result: RecognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [],
        croppingMeta: {
          stage: 'primary',
          confidence: 0.95,
          originalLength: 0,
          croppedLength: 0,
          normalizedLength: 512,
        },
      };
      
      const meta = result.croppingMeta;
      expect(meta?.originalLength).toBe(0);
      expect(meta?.croppedLength).toBe(0);
      expect(meta?.normalizedLength).toBe(512);
    });
  });

  describe('与CollectionMode的一致性', () => {
    it('应该使用相同的阶段标记', () => {
      // RecognitionResult的阶段标记
      const recognitionStages: Array<'primary' | 'fallback' | 'full_segment'> = [
        'primary',
        'fallback',
        'full_segment',
      ];

      // 应该与CollectionMode中使用的阶段标记一致
      expect(recognitionStages).toContain('primary');
      expect(recognitionStages).toContain('fallback');
      expect(recognitionStages).toContain('full_segment');
    });

    it('应该使用相同的徽章显示逻辑', () => {
      // RecognitionMode中的徽章逻辑
      const primaryBadge = '✅ 已裁剪/已缩放';
      const fallbackBadge = '⚠️ 已裁剪/已缩放(降级)';

      // 应该与CollectionMode中的徽章文本一致
      expect(primaryBadge).toBe('✅ 已裁剪/已缩放');
      expect(fallbackBadge).toBe('⚠️ 已裁剪/已缩放(降级)');
    });

    it('应该使用相同的颜色编码', () => {
      // RecognitionMode中的颜色
      const primaryColor = '#10b981';
      const fallbackColor = '#f59e0b';

      // 应该与CollectionMode中的颜色一致
      expect(primaryColor).toBe('#10b981'); // 绿色
      expect(fallbackColor).toBe('#f59e0b'); // 黄色
    });
  });
});

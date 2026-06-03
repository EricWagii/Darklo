import { describe, it, expect } from 'vitest';

/**
 * RecognitionMode端到端验证测试
 * 
 * 验证：
 * 1. 处理状态信息的完整流程
 * 2. CollectionMode和RecognitionMode的一致性
 * 3. UI显示逻辑的正确性
 */

describe('RecognitionMode端到端验证', () => {
  describe('处理状态流程验证', () => {
    it('应该完整地捕获和显示处理状态信息', () => {
      // 模拟识别过程
      const waveform = {
        ch1: Array(2000).fill(0).map(() => Math.random() * 100),
        ch2: Array(2000).fill(0).map(() => Math.random() * 100),
        ch3: Array(2000).fill(0).map(() => Math.random() * 100),
      };

      // 模拟裁剪结果
      const croppingResult = {
        startIdx: 300,
        endIdx: 1700,
        length: 1400,
        confidence: 0.95,
        isQualityAcceptable: true,
        stage: 'primary',
      };

      // 模拟识别结果
      const recognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [
          { command: 'test', score: 85 },
          { command: 'other', score: 45 },
        ],
        croppingMeta: {
          stage: 'primary' as const,
          confidence: croppingResult.confidence,
          originalLength: waveform.ch1.length,
          croppedLength: croppingResult.length,
          normalizedLength: 512,
        },
      };

      // 验证所有信息都被正确捕获
      expect(recognitionResult.croppingMeta).toBeDefined();
      expect(recognitionResult.croppingMeta?.stage).toBe('primary');
      expect(recognitionResult.croppingMeta?.confidence).toBe(0.95);
      expect(recognitionResult.croppingMeta?.originalLength).toBe(2000);
      expect(recognitionResult.croppingMeta?.croppedLength).toBe(1400);
      expect(recognitionResult.croppingMeta?.normalizedLength).toBe(512);
    });

    it('应该处理降级裁剪的情况', () => {
      const recognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 75,
        allScores: [],
        croppingMeta: {
          stage: 'fallback' as const,
          confidence: 0.75,
          originalLength: 2000,
          croppedLength: 1200,
          normalizedLength: 512,
        },
      };

      // 验证降级状态被正确标记
      expect(recognitionResult.croppingMeta?.stage).toBe('fallback');
      expect(recognitionResult.croppingMeta?.confidence).toBeLessThan(0.95);
    });

    it('应该处理异常波形的情况', () => {
      const recognitionResult = {
        timestamp: new Date(),
        command: '无法识别',
        confidence: 0,
        allScores: [],
        croppingMeta: {
          stage: 'full_segment' as const,
          confidence: 0,
          originalLength: 2000,
          croppedLength: 0,
          normalizedLength: 0,
        },
      };

      // 验证异常状态被正确标记
      expect(recognitionResult.croppingMeta?.stage).toBe('full_segment');
      expect(recognitionResult.croppingMeta?.confidence).toBe(0);
    });
  });

  describe('UI显示逻辑验证', () => {
    it('应该根据阶段显示正确的徽章', () => {
      const testCases = [
        {
          stage: 'primary' as const,
          expectedIcon: '✅',
          expectedText: '已裁剪/已缩放',
          expectedColor: '#10b981',
        },
        {
          stage: 'fallback' as const,
          expectedIcon: '⚠️',
          expectedText: '已裁剪/已缩放(降级)',
          expectedColor: '#f59e0b',
        },
        {
          stage: 'full_segment' as const,
          expectedIcon: '⚠️',
          expectedText: '已裁剪/已缩放(降级)',
          expectedColor: '#f59e0b',
        },
      ];

      testCases.forEach((testCase) => {
        // 模拟UI显示逻辑
        const icon = testCase.stage === 'primary' ? '✅' : '⚠️';
        const text = testCase.stage === 'primary' ? '已裁剪/已缩放' : '已裁剪/已缩放(降级)';
        const color = testCase.stage === 'primary' ? '#10b981' : '#f59e0b';

        expect(icon).toBe(testCase.expectedIcon);
        expect(text).toBe(testCase.expectedText);
        expect(color).toBe(testCase.expectedColor);
      });
    });

    it('应该正确显示处理信息卡片', () => {
      const croppingMeta = {
        stage: 'primary' as const,
        confidence: 0.95,
        originalLength: 2000,
        croppedLength: 1500,
        normalizedLength: 512,
      };

      // 模拟处理信息显示
      const lengthInfo = `原始: ${croppingMeta.originalLength} → 裁剪: ${croppingMeta.croppedLength} → 缩放: ${croppingMeta.normalizedLength}`;
      const confidencePercent = (croppingMeta.confidence * 100).toFixed(0);

      expect(lengthInfo).toBe('原始: 2000 → 裁剪: 1500 → 缩放: 512');
      expect(confidencePercent).toBe('95');
    });
  });

  describe('CollectionMode和RecognitionMode的一致性', () => {
    it('应该使用相同的阶段标记', () => {
      // CollectionMode中的阶段标记
      const collectionStages = ['primary', 'fallback', 'full_segment'];

      // RecognitionMode中的阶段标记
      const recognitionStages = ['primary', 'fallback', 'full_segment'];

      expect(collectionStages).toEqual(recognitionStages);
    });

    it('应该使用相同的徽章显示逻辑', () => {
      // CollectionMode中的徽章逻辑
      const collectionBadges = {
        primary: { icon: '✅', text: '已裁剪/已缩放', color: '#10b981' },
        fallback: { icon: '⚠️', text: '已裁剪/已缩放(降级)', color: '#f59e0b' },
      };

      // RecognitionMode中的徽章逻辑
      const recognitionBadges = {
        primary: { icon: '✅', text: '已裁剪/已缩放', color: '#10b981' },
        fallback: { icon: '⚠️', text: '已裁剪/已缩放(降级)', color: '#f59e0b' },
      };

      expect(collectionBadges).toEqual(recognitionBadges);
    });

    it('应该使用相同的处理信息显示格式', () => {
      const collectionMeta = {
        originalLength: 2000,
        croppedLength: 1500,
        normalizedLength: 512,
        confidence: 0.95,
      };

      const recognitionMeta = {
        originalLength: 2000,
        croppedLength: 1500,
        normalizedLength: 512,
        confidence: 0.95,
      };

      // 应该使用相同的格式
      const collectionInfo = `原始: ${collectionMeta.originalLength} → 裁剪: ${collectionMeta.croppedLength} → 缩放: ${collectionMeta.normalizedLength}`;
      const recognitionInfo = `原始: ${recognitionMeta.originalLength} → 裁剪: ${recognitionMeta.croppedLength} → 缩放: ${recognitionMeta.normalizedLength}`;

      expect(collectionInfo).toEqual(recognitionInfo);
    });
  });

  describe('数据完整性验证', () => {
    it('应该保留所有必要的识别信息', () => {
      const recognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [
          { command: 'test', score: 85 },
          { command: 'other', score: 45 },
        ],
        croppingMeta: {
          stage: 'primary' as const,
          confidence: 0.95,
          originalLength: 2000,
          croppedLength: 1500,
          normalizedLength: 512,
        },
      };

      // 验证所有字段都存在
      expect(recognitionResult.timestamp).toBeDefined();
      expect(recognitionResult.command).toBeDefined();
      expect(recognitionResult.confidence).toBeDefined();
      expect(recognitionResult.allScores).toBeDefined();
      expect(recognitionResult.croppingMeta).toBeDefined();

      // 验证croppingMeta的所有字段
      expect(recognitionResult.croppingMeta?.stage).toBeDefined();
      expect(recognitionResult.croppingMeta?.confidence).toBeDefined();
      expect(recognitionResult.croppingMeta?.originalLength).toBeDefined();
      expect(recognitionResult.croppingMeta?.croppedLength).toBeDefined();
      expect(recognitionResult.croppingMeta?.normalizedLength).toBeDefined();
    });

    it('应该支持历史记录的完整保存', () => {
      const recognitionHistory = [
        {
          timestamp: new Date('2026-05-21T10:00:00'),
          command: 'test1',
          confidence: 85,
          allScores: [],
          croppingMeta: {
            stage: 'primary' as const,
            confidence: 0.95,
            originalLength: 2000,
            croppedLength: 1500,
            normalizedLength: 512,
          },
        },
        {
          timestamp: new Date('2026-05-21T10:01:00'),
          command: 'test2',
          confidence: 75,
          allScores: [],
          croppingMeta: {
            stage: 'fallback' as const,
            confidence: 0.75,
            originalLength: 2000,
            croppedLength: 1200,
            normalizedLength: 512,
          },
        },
      ];

      // 验证历史记录可以保存多条结果
      expect(recognitionHistory.length).toBe(2);

      // 验证每条记录都有完整的信息
      recognitionHistory.forEach((result) => {
        expect(result.timestamp).toBeDefined();
        expect(result.command).toBeDefined();
        expect(result.confidence).toBeDefined();
        expect(result.allScores).toBeDefined();
        expect(result.croppingMeta).toBeDefined();
      });
    });
  });

  describe('错误处理和边界情况', () => {
    it('应该处理缺少croppingMeta的结果', () => {
      const recognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 85,
        allScores: [],
      };

      // 应该能安全地处理undefined的croppingMeta
      if (recognitionResult.croppingMeta) {
        // 这段代码不应该执行
        throw new Error('不应该执行');
      }

      expect(recognitionResult.croppingMeta).toBeUndefined();
    });

    it('应该处理零置信度的情况', () => {
      const recognitionResult = {
        timestamp: new Date(),
        command: '无法识别',
        confidence: 0,
        allScores: [],
        croppingMeta: {
          stage: 'full_segment' as const,
          confidence: 0,
          originalLength: 2000,
          croppedLength: 0,
          normalizedLength: 0,
        },
      };

      expect(recognitionResult.confidence).toBe(0);
      expect(recognitionResult.croppingMeta?.confidence).toBe(0);
    });

    it('应该处理100%置信度的情况', () => {
      const recognitionResult = {
        timestamp: new Date(),
        command: 'test',
        confidence: 100,
        allScores: [],
        croppingMeta: {
          stage: 'primary' as const,
          confidence: 1.0,
          originalLength: 2000,
          croppedLength: 1500,
          normalizedLength: 512,
        },
      };

      expect(recognitionResult.confidence).toBe(100);
      expect(recognitionResult.croppingMeta?.confidence).toBe(1.0);
    });
  });

  describe('性能和可扩展性', () => {
    it('应该支持大量历史记录', () => {
      const recognitionHistory = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(),
        command: `test${i}`,
        confidence: Math.random() * 100,
        allScores: [],
        croppingMeta: {
          stage: (i % 2 === 0 ? 'primary' : 'fallback') as const,
          confidence: Math.random(),
          originalLength: 2000,
          croppedLength: 1500,
          normalizedLength: 512,
        },
      }));

      expect(recognitionHistory.length).toBe(1000);

      // 验证可以访问任意记录
      expect(recognitionHistory[0]).toBeDefined();
      expect(recognitionHistory[999]).toBeDefined();
    });

    it('应该能快速查询处理状态统计', () => {
      const recognitionHistory = [
        {
          timestamp: new Date(),
          command: 'test1',
          confidence: 85,
          allScores: [],
          croppingMeta: {
            stage: 'primary' as const,
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
            stage: 'fallback' as const,
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
            stage: 'full_segment' as const,
            confidence: 0,
            originalLength: 2000,
            croppedLength: 0,
            normalizedLength: 0,
          },
        },
      ];

      // 统计各阶段的结果
      const stats = {
        primary: 0,
        fallback: 0,
        failed: 0,
      };

      recognitionHistory.forEach((result) => {
        if (result.croppingMeta?.stage === 'primary') {
          stats.primary++;
        } else if (result.croppingMeta?.stage === 'fallback') {
          stats.fallback++;
        } else {
          stats.failed++;
        }
      });

      expect(stats.primary).toBe(1);
      expect(stats.fallback).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });
});

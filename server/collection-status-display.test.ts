import { describe, it, expect } from 'vitest';
import {
  generateCollectionDisplayInfo,
  generateCollectionDisplayInfoBatch,
  generateCollectionBadgeHTML,
  generateCollectionDetailCard,
  generateCollectionSummary,
  formatCollectionSummary,
  CollectionDisplayInfo,
  CollectionSummary
} from '../client/src/lib/collection-status-display';
import { ProcessedWaveform } from '../client/src/lib/independent-cropping';

// 创建模拟的ProcessedWaveform
function createMockProcessedWaveform(stage: 'primary' | 'fallback' | 'final-fallback', confidence: number): ProcessedWaveform {
  return {
    ch1: Array(512).fill(0).map(() => Math.random() * 100),
    ch2: Array(512).fill(0).map(() => Math.random() * 100),
    ch3: Array(512).fill(0).map(() => Math.random() * 100),
    meta: {
      croppingMeta: {
        stage,
        confidence,
        method: stage === 'primary' ? 'resting-baseline' : 'otsu',
        reason: `Test ${stage}`,
        isQualityAcceptable: true
      },
      normalizationMeta: {
        targetLength: 512,
        originalLength: 1000 + Math.random() * 500
      }
    }
  };
}

describe('Collection Status Display', () => {
  describe('Generate Collection Display Info', () => {
    it('should generate display info for normal waveform', () => {
      const wf = createMockProcessedWaveform('primary', 0.8);
      const info = generateCollectionDisplayInfo(wf, 0, false);
      
      expect(info.index).toBe(0);
      expect(info.processingStatus).toBe('normal');
      expect(info.croppingStage).toBe('primary');
      expect(info.croppingConfidence).toBe(0.8);
      // primary: confidence=0.8 * 100 = 80, * stageFactor(1.0) = 80
      expect(info.qualityScore).toBeGreaterThanOrEqual(75);
      expect(info.qualityScore).toBeLessThanOrEqual(85);
      expect(info.statusInfo.label).toBe('已裁剪/已缩放');
    });

    it('should generate display info for degraded waveform', () => {
      const wf = createMockProcessedWaveform('fallback', 0.5);
      const info = generateCollectionDisplayInfo(wf, 1, false);
      
      expect(info.index).toBe(1);
      expect(info.processingStatus).toBe('degraded');
      expect(info.croppingStage).toBe('fallback');
      // degraded: confidence=0.5 * 100 = 50, * stageFactor(0.9) = 45
      expect(info.qualityScore).toBeGreaterThanOrEqual(40);
      expect(info.qualityScore).toBeLessThanOrEqual(50);
      expect(info.statusInfo.label).toBe('已裁剪/已缩放(降级)');
    });

    it('should generate display info for anomaly waveform', () => {
      const wf = createMockProcessedWaveform('final-fallback', 0.25);
      const info = generateCollectionDisplayInfo(wf, 2, true);
      
      expect(info.index).toBe(2);
      expect(info.processingStatus).toBe('anomaly');
      expect(info.qualityScore).toBeLessThan(40);
      expect(info.statusInfo.label).toBe('未裁剪/未缩放');
    });
  });

  describe('Batch Generation', () => {
    it('should generate display info for multiple waveforms', () => {
      const waveforms = [
        createMockProcessedWaveform('primary', 0.9),
        createMockProcessedWaveform('fallback', 0.6),
        createMockProcessedWaveform('final-fallback', 0.3)
      ];
      
      const infos = generateCollectionDisplayInfoBatch(waveforms);
      
      expect(infos).toHaveLength(3);
      expect(infos[0].processingStatus).toBe('normal');
      expect(infos[1].processingStatus).toBe('degraded');
      expect(infos[2].processingStatus).toBe('degraded');
    });

    it('should mark anomalies correctly', () => {
      const waveforms = [
        createMockProcessedWaveform('primary', 0.9),
        createMockProcessedWaveform('fallback', 0.6),
        createMockProcessedWaveform('final-fallback', 0.3)
      ];
      
      const anomalyIndices = new Set([1]);
      const infos = generateCollectionDisplayInfoBatch(waveforms, anomalyIndices);
      
      expect(infos[0].processingStatus).toBe('normal');
      expect(infos[1].processingStatus).toBe('anomaly');
      expect(infos[2].processingStatus).toBe('degraded');
    });
  });

  describe('Badge HTML Generation', () => {
    it('should generate badge HTML for normal status', () => {
      const wf = createMockProcessedWaveform('primary', 0.8);
      const info = generateCollectionDisplayInfo(wf, 0, false);
      const html = generateCollectionBadgeHTML(info);
      
      expect(html).toContain('✅');
      expect(html).toContain('已裁剪/已缩放');
      expect(html).toContain('分');
    });

    it('should generate badge HTML for degraded status', () => {
      const wf = createMockProcessedWaveform('fallback', 0.5);
      const info = generateCollectionDisplayInfo(wf, 1, false);
      const html = generateCollectionBadgeHTML(info);
      
      expect(html).toContain('⚠️');
      expect(html).toContain('已裁剪/已缩放(降级)');
    });

    it('should generate badge HTML for anomaly status', () => {
      const wf = createMockProcessedWaveform('final-fallback', 0.25);
      const info = generateCollectionDisplayInfo(wf, 2, true);
      const html = generateCollectionBadgeHTML(info);
      
      expect(html).toContain('❌');
      expect(html).toContain('未裁剪/未缩放');
    });
  });

  describe('Detail Card Generation', () => {
    it('should generate detail card with all information', () => {
      const wf = createMockProcessedWaveform('primary', 0.8);
      const info = generateCollectionDisplayInfo(wf, 0, false);
      const card = generateCollectionDetailCard(info);
      
      expect(card).toContain('采集 #1');
      expect(card).toContain('精确裁剪');
      expect(card).toContain('置信度');
      expect(card).toContain('缩放');
      expect(card).toContain('512');
    });

    it('should show correct stage labels', () => {
      const stages: Array<'primary' | 'fallback' | 'final-fallback'> = ['primary', 'fallback', 'final-fallback'];
      const labels = ['精确裁剪', '降级裁剪', '全段返回'];
      
      stages.forEach((stage, idx) => {
        const wf = createMockProcessedWaveform(stage, 0.5);
        const info = generateCollectionDisplayInfo(wf, idx, false);
        const card = generateCollectionDetailCard(info);
        
        expect(card).toContain(labels[idx]);
      });
    });
  });

  describe('Collection Summary', () => {
    it('should generate correct summary statistics', () => {
      const waveforms = [
        createMockProcessedWaveform('primary', 0.9),
        createMockProcessedWaveform('primary', 0.8),
        createMockProcessedWaveform('fallback', 0.6),
        createMockProcessedWaveform('fallback', 0.5)
      ];
      
      const infos = generateCollectionDisplayInfoBatch(waveforms);
      const summary = generateCollectionSummary(infos, 0);
      
      expect(summary.total).toBe(4);
      expect(summary.normal).toBe(2);
      expect(summary.degraded).toBe(2);
      expect(summary.anomaly).toBe(0);
      expect(summary.averageScore).toBeGreaterThan(0);
      expect(summary.averageConfidence).toBeGreaterThan(0);
    });

    it('should count anomalies correctly', () => {
      const waveforms = [
        createMockProcessedWaveform('primary', 0.9),
        createMockProcessedWaveform('fallback', 0.6)
      ];
      
      const infos = generateCollectionDisplayInfoBatch(waveforms);
      const summary = generateCollectionSummary(infos, 2);
      
      expect(summary.total).toBe(2);
      expect(summary.anomaly).toBe(2);
    });
  });

  describe('Summary Formatting', () => {
    it('should format summary as readable text', () => {
      const summary: CollectionSummary = {
        total: 10,
        normal: 6,
        degraded: 3,
        anomaly: 1,
        averageScore: 75.5,
        averageConfidence: 0.7
      };
      
      const text = formatCollectionSummary(summary);
      
      expect(text).toContain('总采集数: 10');
      expect(text).toContain('✅ 正常: 6');
      expect(text).toContain('⚠️ 降级: 3');
      expect(text).toContain('❌ 异常: 1');
      expect(text).toContain('平均评分: 75.5');
      expect(text).toContain('平均置信度: 70%');
    });
  });
});

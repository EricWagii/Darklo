import { describe, it, expect, beforeEach } from 'vitest';
import {
  determineProcessingStatus,
  calculateQualityScore,
  getStatusVisualization,
  ProcessedWaveform
} from '../client/src/lib/processing-status-visualization';

describe('Processing Status Visualization', () => {
  let mockWaveformNormal: ProcessedWaveform;
  let mockWaveformDegraded: ProcessedWaveform;

  beforeEach(() => {
    mockWaveformNormal = {
      ch1: Array(512).fill(0),
      ch2: Array(512).fill(0),
      ch3: Array(512).fill(0),
      meta: {
        croppingMeta: {
          startIdx: 0,
          endIdx: 512,
          confidence: 0.9,
          method: 'resting-baseline',
          stage: 'primary',
          reason: 'Primary cropping successful'
        },
        normalizationMeta: {
          originalLength: 600,
          targetLength: 512,
          timestamp: Date.now()
        }
      }
    };

    mockWaveformDegraded = {
      ch1: Array(512).fill(0),
      ch2: Array(512).fill(0),
      ch3: Array(512).fill(0),
      meta: {
        croppingMeta: {
          startIdx: 50,
          endIdx: 450,
          confidence: 0.5,
          method: 'otsu',
          stage: 'fallback',
          reason: 'Fallback cropping used'
        },
        normalizationMeta: {
          originalLength: 400,
          targetLength: 512,
          timestamp: Date.now()
        }
      }
    };
  });

  describe('Processing Status Determination', () => {
    it('should determine normal status for primary cropping', () => {
      const status = determineProcessingStatus(mockWaveformNormal);
      expect(status).toBe('normal');
    });

    it('should determine degraded status for fallback cropping', () => {
      const status = determineProcessingStatus(mockWaveformDegraded);
      expect(status).toBe('degraded');
    });

    it('should determine degraded status for final-fallback cropping', () => {
      mockWaveformDegraded.meta.croppingMeta.stage = 'final-fallback';
      const status = determineProcessingStatus(mockWaveformDegraded);
      expect(status).toBe('degraded');
    });
  });

  describe('Quality Score Calculation', () => {
    it('should calculate high score for normal cropping with high confidence', () => {
      const score = calculateQualityScore(mockWaveformNormal, false);
      expect(score).toBeGreaterThan(85);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should calculate medium score for degraded cropping', () => {
      const score = calculateQualityScore(mockWaveformDegraded, false);
      // degraded: confidence=0.5 * 100 = 50, * stageFactor(0.9) = 45
      expect(score).toBeGreaterThanOrEqual(40);
      expect(score).toBeLessThanOrEqual(50);
    });

    it('should calculate low score for anomalies', () => {
      const score = calculateQualityScore(mockWaveformNormal, true);
      // normal: confidence=0.9 * 100 = 90, * stageFactor(1.0) * anomaly(0.5) = 45
      expect(score).toBeGreaterThanOrEqual(40);
      expect(score).toBeLessThanOrEqual(50);
    });

    it('should consider confidence in score calculation', () => {
      const highConfidence = calculateQualityScore(mockWaveformNormal, false);
      mockWaveformNormal.meta.croppingMeta.confidence = 0.5;
      const lowConfidence = calculateQualityScore(mockWaveformNormal, false);
      expect(highConfidence).toBeGreaterThan(lowConfidence);
    });
  });

  describe('Status Visualization', () => {
    it('should provide correct visualization for normal status', () => {
      const info = getStatusVisualization('normal', 90);
      expect(info.label).toBe('已裁剪/已缩放');
      expect(info.icon).toBe('✅');
      expect(info.color).toBe('#10b981');
    });

    it('should provide correct visualization for degraded status', () => {
      const info = getStatusVisualization('degraded', 70);
      expect(info.label).toBe('已裁剪/已缩放(降级)');
      expect(info.icon).toBe('⚠️');
      expect(info.color).toBe('#f59e0b');
    });

    it('should provide correct visualization for anomaly status', () => {
      const info = getStatusVisualization('anomaly', 20);
      expect(info.label).toBe('未裁剪/未缩放');
      expect(info.icon).toBe('❌');
      expect(info.color).toBe('#ef4444');
    });

    it('should include score in visualization info', () => {
      const info = getStatusVisualization('normal', 95);
      expect(info.score).toBe(95);
    });
  });
});

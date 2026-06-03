import { describe, it, expect } from 'vitest';
import {
  calculateUnifiedQualityScore,
  calculateAllUnifiedQualityScores,
  detectAnomaliesUnified,
  getAnomalyStatistics,
} from '../unified-quality-scoring';

describe('Unified Quality Scoring', () => {
  // 创建测试波形
  const createWaveform = (strength: number, variability: number) => ({
    ch1: Array(100).fill(0).map((_, i) => Math.sin(i * 0.1) * strength),
    ch2: Array(100).fill(0).map((_, i) => Math.sin(i * 0.1) * strength + Math.random() * variability),
    ch3: Array(100).fill(0).map((_, i) => Math.sin(i * 0.1) * strength),
  });

  it('should calculate relative quality score correctly', () => {
    const waveforms = [
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
    ];

    const score = calculateUnifiedQualityScore(waveforms[0], waveforms, 0);

    expect(score.overallScore).toBeGreaterThanOrEqual(0);
    expect(score.overallScore).toBeLessThanOrEqual(100);
    expect(score.energyConsistency).toBeGreaterThanOrEqual(0);
    expect(score.signalStrength).toBeGreaterThanOrEqual(0);
    expect(score.variability).toBeGreaterThanOrEqual(0);
  });

  it('should detect anomalies using 3σ standard', () => {
    // 创建5个正常波形和1个异常波形
    const waveforms = [
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(0.1, 0.01), // 异常波形（强度很低）
    ];

    const scores = calculateAllUnifiedQualityScores(waveforms);
    const anomalies = detectAnomaliesUnified(scores);

    // 应该检测到至少1个异常
    expect(anomalies.length).toBeGreaterThan(0);
  });

  it('should not mark similar waveforms as anomalies', () => {
    // 创建5个相似的波形
    const waveforms = [
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
    ];

    const scores = calculateAllUnifiedQualityScores(waveforms);
    const anomalies = detectAnomaliesUnified(scores);

    // 不应该检测到异常
    expect(anomalies.length).toBe(0);
  });

  it('should use relative scoring, not absolute thresholds', () => {
    // 创建5个低质量但相似的波形
    const lowQualityWaveforms = [
      createWaveform(0.3, 0.05),
      createWaveform(0.3, 0.05),
      createWaveform(0.3, 0.05),
      createWaveform(0.3, 0.05),
      createWaveform(0.3, 0.05),
    ];

    const scores = calculateAllUnifiedQualityScores(lowQualityWaveforms);
    const anomalies = detectAnomaliesUnified(scores);

    // 即使质量低，相似的波形也不应该被标记为异常
    expect(anomalies.length).toBe(0);
  });

  it('should provide anomaly statistics', () => {
    const waveforms = [
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(0.1, 0.01), // 异常
    ];

    const scores = calculateAllUnifiedQualityScores(waveforms);
    const stats = getAnomalyStatistics(scores);

    expect(stats.totalCollections).toBe(4);
    expect(stats.anomalyRate).toBeGreaterThanOrEqual(0);
    expect(stats.anomalyRate).toBeLessThanOrEqual(100);
    expect(stats.stdDev).toBeGreaterThanOrEqual(0);
  });

  it('should calculate energy consistency correctly', () => {
    const waveforms = [
      createWaveform(1.0, 0.1),
      createWaveform(1.0, 0.1),
      createWaveform(0.9, 0.1), // 能量一致性应该较高
    ];

    const score = calculateUnifiedQualityScore(waveforms[2], waveforms, 2);

    // 能量一致性应该较高（因为与平均值接近）
    expect(score.energyConsistency).toBeGreaterThan(70);
  });
});

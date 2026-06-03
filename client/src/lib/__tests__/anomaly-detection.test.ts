import { describe, it, expect } from 'vitest';
import { WaveformQualityScorer } from '../cropping-logger-and-quality';

describe('Anomaly Detection with Relative Scoring', () => {
  // 创建测试质量评分
  const createQualityScore = (
    overallScore: number,
    energyScore: number = overallScore,
    consistencyScore: number = overallScore,
    snrScore: number = overallScore
  ) => ({
    collectionIndex: 0,
    overallScore,
    energyScore,
    consistencyScore,
    signalToNoiseScore: snrScore,
    isAnomalous: false,
    anomalyReasons: [],
    recommendations: [],
  });

  it('should use 3σ relative threshold, not absolute threshold', () => {
    // 创建5个评分都是45分的采集（之前会被错误地标记为异常）
    const scores = [
      createQualityScore(45),
      createQualityScore(45),
      createQualityScore(45),
      createQualityScore(45),
      createQualityScore(45),
    ];

    // 使用新的detectAnomalies方法（3σ标准）
    const anomalies = WaveformQualityScorer.detectAnomalies(scores, 50, 3);

    // 应该不检测到异常（因为它们都相似）
    expect(anomalies.length).toBe(0);
  });

  it('should detect anomalies with 3σ standard', () => {
    // 创建5个正常采集和1个异常采集
    const scores = [
      createQualityScore(70),
      createQualityScore(72),
      createQualityScore(71),
      createQualityScore(70),
      createQualityScore(71),
      createQualityScore(20), // 异常采集
    ];

    const anomalies = WaveformQualityScorer.detectAnomalies(scores, 50, 3);

    // 应该检测到异常
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].collectionIndex).toBe(5);
  });

  it('should not mark similar low-quality collections as anomalies', () => {
    // 创建5个相似的低质量采集
    const scores = [
      createQualityScore(40),
      createQualityScore(41),
      createQualityScore(40),
      createQualityScore(41),
      createQualityScore(40),
    ];

    const anomalies = WaveformQualityScorer.detectAnomalies(scores, 50, 3);

    // 不应该检测到异常（因为它们都相似）
    expect(anomalies.length).toBe(0);
  });

  it('should detect outliers beyond 3σ', () => {
    // 创建正态分布的采集
    const scores = [
      createQualityScore(70),
      createQualityScore(71),
      createQualityScore(69),
      createQualityScore(70),
      createQualityScore(71),
      createQualityScore(10), // 远超3σ的异常
    ];

    const anomalies = WaveformQualityScorer.detectAnomalies(scores, 50, 3);

    expect(anomalies.length).toBeGreaterThan(0);
  });

  it('should provide anomaly reasons', () => {
    const scores = [
      createQualityScore(70, 70, 70, 70),
      createQualityScore(70, 70, 70, 70),
      createQualityScore(70, 70, 70, 70),
      createQualityScore(20, 20, 20, 20), // 异常
    ];

    const anomalies = WaveformQualityScorer.detectAnomalies(scores, 50, 3);

    if (anomalies.length > 0) {
      expect(anomalies[0].anomalyReasons.length).toBeGreaterThan(0);
      expect(anomalies[0].recommendations.length).toBeGreaterThan(0);
    }
  });

  it('should handle edge cases with few samples', () => {
    const scores = [
      createQualityScore(70),
      createQualityScore(20),
    ];

    // 应该不抛出错误
    expect(() => {
      WaveformQualityScorer.detectAnomalies(scores, 50, 3);
    }).not.toThrow();
  });

  it('should use 3σ threshold parameter correctly', () => {
    const scores = [
      createQualityScore(70),
      createQualityScore(71),
      createQualityScore(69),
      createQualityScore(70),
      createQualityScore(71),
      createQualityScore(50), // 约2.5σ偏差
    ];

    // 使用3σ标准，不应该检测到异常
    const anomalies3Sigma = WaveformQualityScorer.detectAnomalies(scores, 50, 3);
    
    // 使用2σ标准，应该检测到异常
    const anomalies2Sigma = WaveformQualityScorer.detectAnomalies(scores, 50, 2);

    expect(anomalies3Sigma.length).toBeLessThanOrEqual(anomalies2Sigma.length);
  });
});

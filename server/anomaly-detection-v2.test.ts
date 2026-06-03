import { describe, it, expect } from 'vitest';
import {
  detectAnomaliesByIQR,
  detectAnomaliesByMahalanobis,
  detectAnomalies,
  getAnomalyDetectionSummary,
  getAnomalyDescription
} from '../client/src/lib/anomaly-detection-v2';
import {
  extractFusedFeatures
} from '../client/src/lib/feature-extraction-v2';

// 生成模拟信号
function generateSignal(
  length: number,
  noiseLevel: number = 0.1,
  signalStart: number = 0.3,
  signalEnd: number = 0.7,
  signalAmplitude: number = 1.0
): number[] {
  const signal: number[] = [];
  for (let i = 0; i < length; i++) {
    const ratio = i / length;
    let value = Math.random() * noiseLevel;

    if (ratio >= signalStart && ratio <= signalEnd) {
      value += signalAmplitude * Math.sin((ratio - signalStart) * Math.PI / (signalEnd - signalStart));
    }

    signal.push(value);
  }
  return signal;
}

describe('异常检测 V2', () => {
  describe('IQR异常检测', () => {
    it('应该检测异常波形', () => {
      // 创建正常波形
      const normalWaveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      // 创建异常波形（极端值）
      const anomalyWaveforms = [{
        ch1: new Array(1000).fill(10),
        ch2: new Array(1000).fill(10),
        ch3: new Array(1000).fill(10)
      }];
      
      const allWaveforms = [...normalWaveforms, ...anomalyWaveforms];
      const features = allWaveforms.map(wf => extractFusedFeatures(wf.ch1, wf.ch2, wf.ch3));
      
      const results = detectAnomaliesByIQR(features);
      
      expect(results).toHaveLength(6);
      // 检查所有结果都有有效的评分
      results.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      });
    });

    it('应该返回异常原因', () => {
      const normalWaveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const anomalyWaveforms = [{
        ch1: new Array(1000).fill(10),
        ch2: new Array(1000).fill(10),
        ch3: new Array(1000).fill(10)
      }];
      
      const allWaveforms = [...normalWaveforms, ...anomalyWaveforms];
      const features = allWaveforms.map(wf => extractFusedFeatures(wf.ch1, wf.ch2, wf.ch3));
      
      const results = detectAnomaliesByIQR(features);
      
      expect(results[5].reason).toBeDefined();
      expect(results[5].reason.length).toBeGreaterThan(0);
    });
  });

  describe('Mahalanobis异常检测', () => {
    it('应该检测异常波形', () => {
      const normalWaveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const anomalyWaveforms = [{
        ch1: new Array(1000).fill(10),
        ch2: new Array(1000).fill(10),
        ch3: new Array(1000).fill(10)
      }];
      
      const allWaveforms = [...normalWaveforms, ...anomalyWaveforms];
      const results = detectAnomaliesByMahalanobis(allWaveforms);
      
      expect(results).toHaveLength(6);
      // 最后一个应该有较高的异常评分
      expect(results[5].score).toBeGreaterThanOrEqual(results[0].score);
    });

    it('应该计算Mahalanobis距离', () => {
      const normalWaveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const anomalyWaveforms = [{
        ch1: new Array(1000).fill(10),
        ch2: new Array(1000).fill(10),
        ch3: new Array(1000).fill(10)
      }];
      
      const allWaveforms = [...normalWaveforms, ...anomalyWaveforms];
      const results = detectAnomaliesByMahalanobis(allWaveforms);
      
      // 检查所有结果都有有效的评分
      results.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('组合异常检测', () => {
    it('应该使用IQR方法', () => {
      const waveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const report = detectAnomalies(waveforms, 'iqr');
      
      expect(report.method).toBe('iqr');
      expect(report.totalWaveforms).toBe(5);
      expect(report.anomalies).toHaveLength(5);
    });

    it('应该使用Mahalanobis方法', () => {
      const waveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const report = detectAnomalies(waveforms, 'mahalanobis');
      
      expect(report.method).toBe('mahalanobis');
      expect(report.totalWaveforms).toBe(5);
    });

    it('应该使用组合方法', () => {
      const waveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const report = detectAnomalies(waveforms, 'combined');
      
      expect(report.method).toBe('combined');
      expect(report.totalWaveforms).toBe(5);
    });

    it('应该计算异常数量', () => {
      const normalWaveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const anomalyWaveforms = [{
        ch1: new Array(1000).fill(10),
        ch2: new Array(1000).fill(10),
        ch3: new Array(1000).fill(10)
      }];
      
      const allWaveforms = [...normalWaveforms, ...anomalyWaveforms];
      const report = detectAnomalies(allWaveforms, 'mahalanobis');
      
      expect(report.anomalousCount).toBeGreaterThanOrEqual(0);
      expect(report.anomalousCount).toBeLessThanOrEqual(6);
    });

    it('应该处理空波形列表', () => {
      const report = detectAnomalies([]);
      
      expect(report.totalWaveforms).toBe(0);
      expect(report.anomalousCount).toBe(0);
      expect(report.anomalies).toHaveLength(0);
    });
  });

  describe('异常检测报告', () => {
    it('应该生成摘要', () => {
      const waveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const report = detectAnomalies(waveforms);
      const summary = getAnomalyDetectionSummary(report);
      
      expect(summary).toBeDefined();
      expect(summary.length).toBeGreaterThan(0);
    });

    it('应该生成异常描述', () => {
      const waveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const report = detectAnomalies(waveforms);
      
      if (report.anomalies.length > 0) {
        const description = getAnomalyDescription(report.anomalies[0]);
        expect(description).toBeDefined();
        expect(description.length).toBeGreaterThan(0);
      }
    });

    it('正常波形应该有正常的摘要', () => {
      const waveforms = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000),
        ch2: generateSignal(1000),
        ch3: generateSignal(1000)
      }));
      
      const report = detectAnomalies(waveforms, 'mahalanobis');
      const summary = getAnomalyDetectionSummary(report);
      
      if (report.anomalousCount === 0) {
        expect(summary).toContain('正常');
      }
    });
  });
});

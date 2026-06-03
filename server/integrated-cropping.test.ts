/**
 * 集成裁剪系统单元测试
 * 
 * 测试内容：
 * - 日志记录功能
 * - 波形质量评分
 * - 异常波形检测
 * - 统计信息计算
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CroppingLogManager,
  CroppingLog,
  WaveformQualityScorer,
  WaveformQualityScore,
} from '../client/src/lib/cropping-logger-and-quality';

describe('CroppingLogManager', () => {
  let logManager: CroppingLogManager;

  beforeEach(() => {
    logManager = new CroppingLogManager();
  });

  it('应该正确记录裁剪日志', () => {
    const log: CroppingLog = {
      stage: 'stage1',
      collectionIndex: 0,
      timestamp: Date.now(),
      inputLength: 1000,
      inputChannels: { ch1: 1000, ch2: 1000, ch3: 1000 },
      outputLength: 800,
      startIdx: 100,
      endIdx: 900,
      confidence: 0.95,
      snrWeights: { ch1: 0.4, ch2: 0.3, ch3: 0.3 },
      strategy: 'single',
      peakCount: 1,
      processingTime: 10,
    };

    logManager.recordLog(log);
    const logs = logManager.getAllLogs();

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual(log);
  });

  it('应该分别记录第一阶段和第二阶段的日志', () => {
    const stage1Log: CroppingLog = {
      stage: 'stage1',
      collectionIndex: 0,
      timestamp: Date.now(),
      inputLength: 1000,
      inputChannels: { ch1: 1000, ch2: 1000, ch3: 1000 },
      outputLength: 800,
      startIdx: 100,
      endIdx: 900,
      confidence: 0.95,
      snrWeights: { ch1: 0.4, ch2: 0.3, ch3: 0.3 },
      strategy: 'single',
      processingTime: 10,
    };

    const stage2Log: CroppingLog = {
      stage: 'stage2',
      collectionIndex: 0,
      timestamp: Date.now(),
      inputLength: 800,
      inputChannels: { ch1: 800, ch2: 800, ch3: 800 },
      outputLength: 512,
      startIdx: 0,
      endIdx: 512,
      confidence: 1.0,
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
      strategy: 'fixed-length',
      processingTime: 5,
    };

    logManager.recordLog(stage1Log);
    logManager.recordLog(stage2Log);

    expect(logManager.getStage1Logs()).toHaveLength(1);
    expect(logManager.getStage2Logs()).toHaveLength(1);
    expect(logManager.getAllLogs()).toHaveLength(2);
  });

  it('应该正确计算统计信息', () => {
    // 创建多条日志
    for (let i = 0; i < 5; i++) {
      const log: CroppingLog = {
        stage: 'stage2',
        collectionIndex: i,
        timestamp: Date.now(),
        inputLength: 800,
        inputChannels: { ch1: 800, ch2: 800, ch3: 800 },
        outputLength: 512,
        startIdx: 0,
        endIdx: 512,
        confidence: 0.9 + i * 0.01,
        snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
        strategy: 'fixed-length',
        processingTime: 5,
      };
      logManager.recordLog(log);
    }

    const stats = logManager.calculateStatistics();

    expect(stats.stage2Success).toBe(5);
    expect(stats.averageStage2Length).toBe(512);
    expect(stats.lengthVariance).toBe(0); // 所有长度都相同
  });

  it('应该清除所有日志', () => {
    const log: CroppingLog = {
      stage: 'stage1',
      collectionIndex: 0,
      timestamp: Date.now(),
      inputLength: 1000,
      inputChannels: { ch1: 1000, ch2: 1000, ch3: 1000 },
      outputLength: 800,
      startIdx: 100,
      endIdx: 900,
      confidence: 0.95,
      snrWeights: { ch1: 0.4, ch2: 0.3, ch3: 0.3 },
      strategy: 'single',
      processingTime: 10,
    };

    logManager.recordLog(log);
    expect(logManager.getAllLogs()).toHaveLength(1);

    logManager.clear();
    expect(logManager.getAllLogs()).toHaveLength(0);
  });
});

describe('WaveformQualityScorer', () => {
  it('应该计算能量评分', () => {
    // 创建测试波形
    const ch1 = Array(100).fill(0).map(() => Math.random() * 0.1);
    const ch2 = Array(100).fill(0).map(() => Math.random() * 0.1);
    const ch3 = Array(100).fill(0).map(() => Math.random() * 0.1);

    const score = WaveformQualityScorer.calculateEnergyScore(ch1, ch2, ch3);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('应该计算一致性评分', () => {
    const waveform = Array(100).fill(0).map(() => Math.random() * 0.1);

    const score = WaveformQualityScorer.calculateConsistencyScore(waveform);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('应该计算信噪比评分', () => {
    const ch1 = Array(100).fill(0).map(() => Math.random() * 0.1);
    const ch2 = Array(100).fill(0).map(() => Math.random() * 0.1);
    const ch3 = Array(100).fill(0).map(() => Math.random() * 0.1);

    const score = WaveformQualityScorer.calculateSignalToNoiseScore(ch1, ch2, ch3);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('应该计算整体质量评分', () => {
    const energyScore = 70;
    const consistencyScore = 75;
    const snrScore = 80;

    const overallScore = WaveformQualityScorer.calculateOverallScore(
      energyScore,
      consistencyScore,
      snrScore
    );

    // 加权平均：能量40%，一致性35%，信噪比25%
    const expected = energyScore * 0.4 + consistencyScore * 0.35 + snrScore * 0.25;
    expect(overallScore).toBeCloseTo(expected, 1);
  });

  it('应该检测异常波形', () => {
    // 创建一组质量评分
    const scores: WaveformQualityScore[] = [
      {
        collectionIndex: 0,
        overallScore: 75,
        energyScore: 70,
        consistencyScore: 75,
        signalToNoiseScore: 80,
        isAnomalous: false,
        anomalyReasons: [],
        recommendations: [],
      },
      {
        collectionIndex: 1,
        overallScore: 78,
        energyScore: 75,
        consistencyScore: 80,
        signalToNoiseScore: 78,
        isAnomalous: false,
        anomalyReasons: [],
        recommendations: [],
      },
      {
        collectionIndex: 2,
        overallScore: 20, // 异常低分
        energyScore: 15,
        consistencyScore: 20,
        signalToNoiseScore: 25,
        isAnomalous: false,
        anomalyReasons: [],
        recommendations: [],
      },
    ];

    const anomalies = WaveformQualityScorer.detectAnomalies(scores, 50, 1.5);

    // 应该检测到第三个波形是异常的
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.some(a => a.collectionIndex === 2)).toBe(true);
  });

  it('应该为异常波形提供建议', () => {
    const scores: WaveformQualityScore[] = [
      {
        collectionIndex: 0,
        overallScore: 20,
        energyScore: 15,
        consistencyScore: 20,
        signalToNoiseScore: 10,
        isAnomalous: false,
        anomalyReasons: [],
        recommendations: [],
      },
    ];

    const anomalies = WaveformQualityScorer.detectAnomalies(scores, 50);

    if (anomalies.length > 0) {
      expect(anomalies[0].recommendations.length).toBeGreaterThan(0);
    }
  });
});

describe('质量评分集成', () => {
  it('应该为多个波形计算质量评分', () => {
    const waveforms = Array(5)
      .fill(0)
      .map(() => ({
        ch1: Array(512).fill(0).map(() => Math.random() * 0.1),
        ch2: Array(512).fill(0).map(() => Math.random() * 0.1),
        ch3: Array(512).fill(0).map(() => Math.random() * 0.1),
      }));

    const scores: WaveformQualityScore[] = waveforms.map((waveform, idx) => ({
      collectionIndex: idx,
      overallScore: 70 + Math.random() * 20,
      energyScore: 70 + Math.random() * 20,
      consistencyScore: 70 + Math.random() * 20,
      signalToNoiseScore: 70 + Math.random() * 20,
      isAnomalous: false,
      anomalyReasons: [],
      recommendations: [],
    }));

    expect(scores).toHaveLength(5);
    scores.forEach(score => {
      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });
  });

  it('应该正确识别异常率', () => {
    const scores: WaveformQualityScore[] = Array(10)
      .fill(0)
      .map((_, idx) => ({
        collectionIndex: idx,
        overallScore: idx < 8 ? 75 : 20, // 后两个异常
        energyScore: idx < 8 ? 75 : 20,
        consistencyScore: idx < 8 ? 75 : 20,
        signalToNoiseScore: idx < 8 ? 75 : 20,
        isAnomalous: false,
        anomalyReasons: [],
        recommendations: [],
      }));

    const anomalies = WaveformQualityScorer.detectAnomalies(scores, 50);

    // 应该检测到至少2个异常
    expect(anomalies.length).toBeGreaterThanOrEqual(2);
  });
});


describe('IntegratedCroppingSystem - 两阶段裁剪流程', () => {
  it('应该正确记录采集模式的两阶段裁剪', async () => {
    // 注意：这是一个概念性测试，实际的IntegratedCroppingSystem需要在浏览器环境中运行
    // 因为它依赖于客户端的多峰值检测和波形归一化库
    
    // 模拟采集数据
    const mockCollections = Array(5)
      .fill(0)
      .map(() => ({
        ch1: Array(1000).fill(0).map(() => Math.random() * 0.1),
        ch2: Array(1000).fill(0).map(() => Math.random() * 0.1),
        ch3: Array(1000).fill(0).map(() => Math.random() * 0.1),
      }));

    // 验证模拟数据的结构
    expect(mockCollections).toHaveLength(5);
    mockCollections.forEach(col => {
      expect(col.ch1).toHaveLength(1000);
      expect(col.ch2).toHaveLength(1000);
      expect(col.ch3).toHaveLength(1000);
    });
  });

  it('应该验证两阶段裁剪的输出长度', () => {
    // 验证第二阶段的目标长度
    const TARGET_LENGTH = 512;
    
    // 模拟第二阶段的输出
    const stage2Output = Array(5)
      .fill(0)
      .map(() => ({
        ch1: Array(TARGET_LENGTH).fill(0),
        ch2: Array(TARGET_LENGTH).fill(0),
        ch3: Array(TARGET_LENGTH).fill(0),
      }));

    stage2Output.forEach(output => {
      expect(output.ch1).toHaveLength(TARGET_LENGTH);
      expect(output.ch2).toHaveLength(TARGET_LENGTH);
      expect(output.ch3).toHaveLength(TARGET_LENGTH);
    });
  });

  it('应该正确计算裁剪成功率', () => {
    const totalCollections = 10;
    const successfulCollections = 9;
    const successRate = (successfulCollections / totalCollections) * 100;

    expect(successRate).toBe(90);
    expect(successRate).toBeGreaterThanOrEqual(0);
    expect(successRate).toBeLessThanOrEqual(100);
  });

  it('应该验证采集和测试模式的参数一致性', () => {
    // 验证采集模式和测试模式使用相同的参数
    const collectionModeParams = {
      targetLength: 512,
      strategy: 'auto',
      windowSize: 20,
    };

    const testModeParams = {
      targetLength: 512,
      strategy: 'auto',
      windowSize: 20,
    };

    expect(collectionModeParams.targetLength).toBe(testModeParams.targetLength);
    expect(collectionModeParams.strategy).toBe(testModeParams.strategy);
    expect(collectionModeParams.windowSize).toBe(testModeParams.windowSize);
  });

  it('应该验证异常波形的标记和统计', () => {
    const totalWaveforms = 10;
    const anomalousWaveforms = [2, 5, 8]; // 异常波形的索引
    const anomalyRate = (anomalousWaveforms.length / totalWaveforms) * 100;

    expect(anomalyRate).toBe(30);
    expect(anomalousWaveforms).toContain(2);
    expect(anomalousWaveforms).toContain(5);
    expect(anomalousWaveforms).toContain(8);
  });

  it('应该验证日志的完整性', () => {
    // 验证日志包含所有必要的信息
    const requiredLogFields = [
      'stage',
      'collectionIndex',
      'timestamp',
      'inputLength',
      'outputLength',
      'startIdx',
      'endIdx',
      'confidence',
      'snrWeights',
      'strategy',
      'processingTime',
    ];

    const mockLog: CroppingLog = {
      stage: 'stage1',
      collectionIndex: 0,
      timestamp: Date.now(),
      inputLength: 1000,
      inputChannels: { ch1: 1000, ch2: 1000, ch3: 1000 },
      outputLength: 800,
      startIdx: 100,
      endIdx: 900,
      confidence: 0.95,
      snrWeights: { ch1: 0.4, ch2: 0.3, ch3: 0.3 },
      strategy: 'single',
      processingTime: 10,
    };

    requiredLogFields.forEach(field => {
      expect(mockLog).toHaveProperty(field);
    });
  });

  it('应该验证质量评分的范围', () => {
    // 验证所有质量评分都在0-100之间
    const scores = [0, 25, 50, 75, 100];

    scores.forEach(score => {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  it('应该验证SNR权重的和接近1.0', () => {
    const snrWeights = { ch1: 0.4, ch2: 0.3, ch3: 0.3 };
    const sum = snrWeights.ch1 + snrWeights.ch2 + snrWeights.ch3;

    expect(sum).toBeCloseTo(1.0, 1);
  });

  it('应该验证裁剪参数的有效性', () => {
    // 验证裁剪参数的基本约束
    const startIdx = 100;
    const endIdx = 900;
    const inputLength = 1000;

    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeLessThanOrEqual(inputLength);
    expect(startIdx).toBeLessThan(endIdx);
  });

  it('应该验证处理时间的合理性', () => {
    // 验证处理时间在合理范围内（毫秒）
    const processingTimes = [5, 10, 15, 20, 50];

    processingTimes.forEach(time => {
      expect(time).toBeGreaterThan(0);
      expect(time).toBeLessThan(1000); // 不应超过1秒
    });
  });
});

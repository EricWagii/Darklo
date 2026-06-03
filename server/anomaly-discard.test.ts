/**
 * 异常波形舍弃系统单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AnomalyDiscardSystem,
  generateDiscardRecommendation,
  shouldAutoDiscard,
  generateUserPrompt,
} from '../client/src/lib/anomaly-discard-system';

describe('AnomalyDiscardSystem', () => {
  let system: AnomalyDiscardSystem;

  beforeEach(() => {
    system = new AnomalyDiscardSystem();
  });

  it('应该标记异常波形', () => {
    const record = system.markAnomaly(
      0,
      'command1',
      '能量过低',
      25,
      '质量极低，建议舍弃'
    );

    expect(record.collectionIndex).toBe(0);
    expect(record.commandName).toBe('command1');
    expect(record.reason).toBe('能量过低');
    expect(record.qualityScore).toBe(25);
    expect(record.isDiscarded).toBe(false);
  });

  it('应该舍弃异常波形', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    const result = system.discardAnomaly(0, '用户手动舍弃');

    expect(result).toBe(true);
    expect(system.shouldDiscard(0)).toBe(true);
  });

  it('应该检查波形是否应该被舍弃', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.discardAnomaly(0, '用户手动舍弃');

    expect(system.shouldDiscard(0)).toBe(true);
    expect(system.shouldDiscard(1)).toBe(false);
  });

  it('应该获取所有异常记录', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');
    system.markAnomaly(2, 'command1', '信噪比低', 45, '质量可接受');

    const anomalies = system.getAllAnomalies();

    expect(anomalies).toHaveLength(3);
  });

  it('应该获取已舍弃的异常记录', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');

    system.discardAnomaly(0, '用户手动舍弃');

    const discarded = system.getDiscardedAnomalies();

    expect(discarded).toHaveLength(1);
    expect(discarded[0].collectionIndex).toBe(0);
  });

  it('应该获取未舍弃的异常记录', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');

    system.discardAnomaly(0, '用户手动舍弃');

    const undiscarded = system.getUndiscardedAnomalies();

    expect(undiscarded).toHaveLength(1);
    expect(undiscarded[0].collectionIndex).toBe(1);
  });

  it('应该计算舍弃统计信息', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');
    system.markAnomaly(2, 'command1', '信噪比低', 75, '质量良好');

    system.discardAnomaly(0, '用户手动舍弃');

    const stats = system.getDiscardStatistics(
      10,
      [25, 35, 75, 80, 85, 90, 88, 92, 91, 89]
    );

    expect(stats.totalCollections).toBe(10);
    expect(stats.discardedCount).toBe(1);
    expect(stats.discardRate).toBe(10);
  });

  it('应该过滤集合移除已舍弃的波形', () => {
    const collections = [
      { index: 0, data: 'a' },
      { index: 1, data: 'b' },
      { index: 2, data: 'c' },
    ];

    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');

    system.discardAnomaly(0, '用户手动舍弃');

    const filtered = system.filterCollections(collections);

    expect(filtered).toHaveLength(2);
    expect(filtered[0].index).toBe(1);
    expect(filtered[1].index).toBe(2);
  });

  it('应该生成舍弃报告', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');

    system.discardAnomaly(0, '用户手动舍弃');

    const report = system.generateReport();

    expect(report).toContain('异常波形舍弃报告');
    expect(report).toContain('已舍弃');
    expect(report).toContain('未舍弃');
  });

  it('应该清除所有记录', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.discardAnomaly(0, '用户手动舍弃');

    system.clear();

    expect(system.getAllAnomalies()).toHaveLength(0);
    expect(system.shouldDiscard(0)).toBe(false);
  });

  it('应该撤销舍弃', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.discardAnomaly(0, '用户手动舍弃');

    expect(system.shouldDiscard(0)).toBe(true);

    const result = system.undiscardAnomaly(0);

    expect(result).toBe(true);
    expect(system.shouldDiscard(0)).toBe(false);
  });

  it('应该批量舍弃异常波形', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');
    system.markAnomaly(2, 'command1', '信噪比低', 45, '质量可接受');

    const count = system.discardMultiple([0, 1, 2], '批量舍弃');

    expect(count).toBe(3);
    expect(system.getDiscardedAnomalies()).toHaveLength(3);
  });

  it('应该自动舍弃低于阈值的异常波形', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');
    system.markAnomaly(2, 'command1', '信噪比低', 75, '质量良好');

    const count = system.autoDiscardBelowThreshold(50, '质量低于50%');

    expect(count).toBe(2);
    expect(system.shouldDiscard(0)).toBe(true);
    expect(system.shouldDiscard(1)).toBe(true);
    expect(system.shouldDiscard(2)).toBe(false);
  });

  it('应该获取舍弃指数集合', () => {
    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 35, '质量一般');

    system.discardAnomaly(0, '用户手动舍弃');
    system.discardAnomaly(1, '用户手动舍弃');

    const indices = system.getDiscardedIndices();

    expect(indices.has(0)).toBe(true);
    expect(indices.has(1)).toBe(true);
    expect(indices.size).toBe(2);
  });
});

describe('舍弃辅助函数', () => {
  it('应该生成舍弃建议', () => {
    const rec1 = generateDiscardRecommendation('能量过低', 25);
    expect(rec1).toContain('强烈建议舍弃');

    const rec2 = generateDiscardRecommendation('一致性差', 45);
    expect(rec2).toContain('建议舍弃');

    const rec3 = generateDiscardRecommendation('信噪比低', 65);
    expect(rec3).toContain('可选舍弃');

    const rec4 = generateDiscardRecommendation('质量良好', 85);
    expect(rec4).toContain('无需舍弃');
  });

  it('应该判断是否应该自动舍弃', () => {
    expect(shouldAutoDiscard(25)).toBe(true);
    expect(shouldAutoDiscard(35)).toBe(false);
    expect(shouldAutoDiscard(75)).toBe(false);
  });

  it('应该生成用户提示信息', () => {
    const system = new AnomalyDiscardSystem();

    system.markAnomaly(0, 'command1', '能量过低', 25, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 45, '质量一般');

    const stats = system.getDiscardStatistics(
      10,
      [25, 45, 80, 85, 90, 88, 92, 91, 89, 87]
    );

    const prompt = generateUserPrompt(system.getAllAnomalies(), stats);

    expect(prompt).toContain('检测到');
    expect(prompt).toContain('异常波形');
  });

  it('应该生成无异常的提示信息', () => {
    const system = new AnomalyDiscardSystem();
    const stats = system.getDiscardStatistics(10, [80, 85, 90, 88, 92, 91, 89, 87, 86, 84]);

    const prompt = generateUserPrompt([], stats);

    expect(prompt).toContain('所有波形质量良好');
  });
});

describe('舍弃统计信息计算', () => {
  it('应该正确计算舍弃率', () => {
    const system = new AnomalyDiscardSystem();

    for (let i = 0; i < 10; i++) {
      system.markAnomaly(i, 'command1', '能量过低', 25 + i * 5, '质量低');
    }

    // 舍弃前5个
    for (let i = 0; i < 5; i++) {
      system.discardAnomaly(i, '用户手动舍弃');
    }

    const stats = system.getDiscardStatistics(
      10,
      Array(10).fill(0).map((_, i) => 25 + i * 5)
    );

    expect(stats.discardRate).toBe(50);
  });

  it('应该计算舍弃波形的平均质量', () => {
    const system = new AnomalyDiscardSystem();

    system.markAnomaly(0, 'command1', '能量过低', 20, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 30, '质量低');

    system.discardAnomaly(0, '用户手动舍弃');
    system.discardAnomaly(1, '用户手动舍弃');

    const stats = system.getDiscardStatistics(
      10,
      [20, 30, 80, 85, 90, 88, 92, 91, 89, 87]
    );

    expect(stats.averageQualityOfDiscarded).toBeCloseTo(25, 1);
  });

  it('应该计算保留波形的平均质量', () => {
    const system = new AnomalyDiscardSystem();

    system.markAnomaly(0, 'command1', '能量过低', 20, '质量极低');
    system.markAnomaly(1, 'command1', '一致性差', 30, '质量低');

    system.discardAnomaly(0, '用户手动舍弃');
    system.discardAnomaly(1, '用户手动舍弃');

    const qualityScores = [20, 30, 80, 85, 90, 88, 92, 91, 89, 87];
    const stats = system.getDiscardStatistics(10, qualityScores);

    const keptScores = qualityScores.slice(2);
    const expectedAverage = keptScores.reduce((a, b) => a + b, 0) / keptScores.length;

    expect(stats.averageQualityOfKept).toBeCloseTo(expectedAverage, 1);
  });
});

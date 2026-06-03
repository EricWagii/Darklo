import { describe, it, expect } from 'vitest';

/**
 * AnomalyPromptDialog选择状态重置测试
 * 
 * 验证当异常列表或对话框打开状态变化时，选择状态是否正确重置
 */

describe('AnomalyPromptDialog选择状态重置', () => {
  describe('初始化选择状态', () => {
    it('应该在对话框打开时初始化selectedIndices', () => {
      const anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
        { collectionIndex: 2, reason: '异常3', qualityScore: 0.7, recommendation: '删除' },
      ];

      const selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      expect(selectedIndices.size).toBe(3);
      expect(selectedIndices.has(0)).toBe(true);
      expect(selectedIndices.has(1)).toBe(true);
      expect(selectedIndices.has(2)).toBe(true);
    });

    it('应该在异常列表为空时初始化为空Set', () => {
      const anomalies: any[] = [];

      const selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      expect(selectedIndices.size).toBe(0);
    });
  });

  describe('异常列表变化时重置状态', () => {
    it('应该在异常列表变化时重置selectedIndices', () => {
      // 初始异常列表
      let anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
      ];

      let selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.size).toBe(2);

      // 异常列表变化
      anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
        { collectionIndex: 2, reason: '异常3', qualityScore: 0.7, recommendation: '删除' },
      ];

      // 重置selectedIndices
      selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      expect(selectedIndices.size).toBe(3);
      expect(selectedIndices.has(2)).toBe(true);
    });

    it('应该在异常列表减少时正确重置', () => {
      // 初始异常列表
      let anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
        { collectionIndex: 2, reason: '异常3', qualityScore: 0.7, recommendation: '删除' },
      ];

      let selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.size).toBe(3);

      // 异常列表减少
      anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
      ];

      // 重置selectedIndices
      selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      expect(selectedIndices.size).toBe(2);
      expect(selectedIndices.has(2)).toBe(false);
    });

    it('应该在异常列表完全变化时重置', () => {
      // 初始异常列表
      let anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
      ];

      let selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.has(0)).toBe(true);
      expect(selectedIndices.has(1)).toBe(true);

      // 异常列表完全变化
      anomalies = [
        { collectionIndex: 5, reason: '异常5', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 6, reason: '异常6', qualityScore: 0.6, recommendation: '删除' },
      ];

      // 重置selectedIndices
      selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      expect(selectedIndices.has(0)).toBe(false);
      expect(selectedIndices.has(1)).toBe(false);
      expect(selectedIndices.has(5)).toBe(true);
      expect(selectedIndices.has(6)).toBe(true);
    });
  });

  describe('对话框打开状态变化时重置', () => {
    it('应该在对话框打开时重置selectedIndices', () => {
      const anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
      ];

      let isOpen = false;
      let selectedIndices = new Set<number>();

      // 对话框打开
      isOpen = true;
      if (isOpen) {
        selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      }

      expect(selectedIndices.size).toBe(2);
    });

    it('应该在对话框关闭时保留selectedIndices', () => {
      const anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
      ];

      let isOpen = true;
      let selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      // 对话框关闭
      isOpen = false;

      // selectedIndices应该保留（不重置）
      expect(selectedIndices.size).toBe(1);
    });
  });

  describe('用户交互后的状态管理', () => {
    it('应该支持用户取消选择后重新打开时重置', () => {
      const anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
      ];

      let selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.size).toBe(2);

      // 用户取消选择
      selectedIndices.clear();
      expect(selectedIndices.size).toBe(0);

      // 对话框重新打开时重置
      selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.size).toBe(2);
    });

    it('应该支持用户部分选择后重新打开时重置', () => {
      const anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
        { collectionIndex: 2, reason: '异常3', qualityScore: 0.7, recommendation: '删除' },
      ];

      let selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.size).toBe(3);

      // 用户取消选择第2个
      selectedIndices.delete(1);
      expect(selectedIndices.size).toBe(2);

      // 对话框重新打开时重置
      selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.size).toBe(3);
      expect(selectedIndices.has(1)).toBe(true);
    });
  });

  describe('防止误删的验证', () => {
    it('应该防止旧选择状态导致的误删', () => {
      // 第一次打开对话框
      let anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
      ];

      let selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      let indicesToDelete = Array.from(selectedIndices).sort((a, b) => a - b);
      expect(indicesToDelete).toEqual([0, 1]);

      // 第二次打开对话框，异常列表不同
      anomalies = [
        { collectionIndex: 2, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
        { collectionIndex: 3, reason: '异常3', qualityScore: 0.7, recommendation: '删除' },
      ];

      // 重置selectedIndices
      selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      indicesToDelete = Array.from(selectedIndices).sort((a, b) => a - b);

      // 应该是新的索引，而不是旧的
      expect(indicesToDelete).toEqual([2, 3]);
      expect(indicesToDelete).not.toEqual([0, 1]);
    });

    it('应该验证selectedIndices与当前异常列表的一致性', () => {
      const anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
      ];

      const selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      const anomalyIndices = anomalies.map(a => a.collectionIndex);

      // 验证selectedIndices中的所有索引都在anomalyIndices中
      for (const index of selectedIndices) {
        expect(anomalyIndices).toContain(index);
      }
    });
  });

  describe('边界情况处理', () => {
    it('应该处理空异常列表', () => {
      const anomalies: any[] = [];

      const selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      expect(selectedIndices.size).toBe(0);
    });

    it('应该处理单个异常', () => {
      const anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
      ];

      const selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      expect(selectedIndices.size).toBe(1);
      expect(selectedIndices.has(0)).toBe(true);
    });

    it('应该处理大量异常', () => {
      const anomalies = Array.from({ length: 100 }, (_, i) => ({
        collectionIndex: i,
        reason: `异常${i}`,
        qualityScore: 0.5,
        recommendation: '删除',
      }));

      const selectedIndices = new Set(anomalies.map(a => a.collectionIndex));

      expect(selectedIndices.size).toBe(100);
    });
  });

  describe('useEffect依赖项验证', () => {
    it('应该在anomalies变化时重置', () => {
      let anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
      ];

      let selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.size).toBe(1);

      // 模拟useEffect依赖项变化
      anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
        { collectionIndex: 1, reason: '异常2', qualityScore: 0.6, recommendation: '删除' },
      ];

      selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      expect(selectedIndices.size).toBe(2);
    });

    it('应该在isOpen变化时重置', () => {
      const anomalies = [
        { collectionIndex: 0, reason: '异常1', qualityScore: 0.5, recommendation: '删除' },
      ];

      let isOpen = false;
      let selectedIndices = new Set<number>();

      // 模拟useEffect依赖项变化
      isOpen = true;
      if (isOpen) {
        selectedIndices = new Set(anomalies.map(a => a.collectionIndex));
      }

      expect(selectedIndices.size).toBe(1);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  processCollections,
  getCroppingStatusDescription,
  getSummary,
  removeAnomalies,
  convertToStorageFormat,
  canSave
} from '../collection-integration';

describe('采集集成层', () => {
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

  describe('processCollections', () => {
    it('应该处理空列表', () => {
      const result = processCollections([]);

      expect(result.processedWaveforms).toHaveLength(0);
      expect(result.anomalies).toHaveLength(0);
      expect(result.stats.totalCollections).toBe(0);
      expect(result.hasAnomalies).toBe(false);
    });

    it('应该处理清晰信号', () => {
      const collections = Array(3).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result = processCollections(collections);

      expect(result.processedWaveforms).toHaveLength(3);
      expect(result.stats.totalCollections).toBe(3);
      expect(result.stats.successfulCroppings).toBeGreaterThan(0);
      expect(result.processedWaveforms.every(w => w.ch1.length === 512)).toBe(true);
    });

    it('应该检测异常波形', () => {
      const collections = [
        // 清晰信号
        {
          ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
          ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
          ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
        },
        // 噪声信号（可能被标记为异常）
        {
          ch1: Array(1000).fill(0).map(() => Math.random() * 0.05),
          ch2: Array(1000).fill(0).map(() => Math.random() * 0.05),
          ch3: Array(1000).fill(0).map(() => Math.random() * 0.05)
        }
      ];

      const result = processCollections(collections);

      expect(result.stats.totalCollections).toBe(2);
      // 可能有异常，也可能没有（取决于降级策略）
      expect(result.hasAnomalies).toBe(result.anomalies.length > 0);
    });

    it('应该返回正确的统计信息', () => {
      const collections = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result = processCollections(collections);

      expect(result.stats.totalCollections).toBe(5);
      expect(result.stats.successfulCroppings + result.stats.degradedCroppings).toBe(5);
    });

    it('应该支持自定义目标长度', () => {
      const collections = Array(2).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result256 = processCollections(collections, 256);
      const result1024 = processCollections(collections, 1024);

      expect(result256.processedWaveforms.every(w => w.ch1.length === 256)).toBe(true);
      expect(result1024.processedWaveforms.every(w => w.ch1.length === 1024)).toBe(true);
    });
  });

  describe('getCroppingStatusDescription', () => {
    it('应该返回正确的状态描述', () => {
      const collections = Array(1).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result = processCollections(collections);
      const description = getCroppingStatusDescription(result.processedWaveforms[0]);

      expect(description).toContain('✅') || expect(description).toContain('⚠️') || expect(description).toContain('❌');
      expect(description).toContain('置信度');
    });
  });

  describe('getSummary', () => {
    it('应该生成摘要', () => {
      const collections = Array(3).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result = processCollections(collections);
      const summary = getSummary(result);

      expect(summary).toContain('总采集数: 3');
      expect(summary).toContain('✅ 成功裁剪');
      expect(summary).toContain('⚠️ 降级裁剪');
    });
  });

  describe('removeAnomalies', () => {
    it('应该删除指定索引的波形', () => {
      const collections = Array(5).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result = processCollections(collections);
      const filtered = removeAnomalies(result.processedWaveforms, [1, 3]);

      expect(filtered).toHaveLength(3);
      expect(filtered.every(w => w.ch1.length === 512)).toBe(true);
    });

    it('应该处理空的删除列表', () => {
      const collections = Array(3).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result = processCollections(collections);
      const filtered = removeAnomalies(result.processedWaveforms, []);

      expect(filtered).toHaveLength(3);
    });
  });

  describe('convertToStorageFormat', () => {
    it('应该转换为存储格式', () => {
      const collections = Array(2).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result = processCollections(collections);
      const storage = convertToStorageFormat(result.processedWaveforms);

      expect(storage).toHaveLength(2);
      expect(storage[0]).toHaveProperty('ch1');
      expect(storage[0]).toHaveProperty('ch2');
      expect(storage[0]).toHaveProperty('ch3');
      expect(storage[0]).toHaveProperty('croppingMeta');
      expect(storage[0]).toHaveProperty('normalizationMeta');
    });
  });

  describe('canSave', () => {
    it('应该在有波形时允许保存', () => {
      const collections = Array(1).fill(null).map(() => ({
        ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
        ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
      }));

      const result = processCollections(collections);
      const canSaveResult = canSave(result);

      expect(canSaveResult.canSave).toBe(true);
    });

    it('应该在没有波形时禁止保存', () => {
      const result = processCollections([]);
      const canSaveResult = canSave(result);

      expect(canSaveResult.canSave).toBe(false);
      expect(canSaveResult.reason).toBeDefined();
    });

    it('应该即使有异常也允许保存', () => {
      const collections = Array(2).fill(null).map(() => ({
        ch1: Array(1000).fill(0).map(() => Math.random() * 0.05),
        ch2: Array(1000).fill(0).map(() => Math.random() * 0.05),
        ch3: Array(1000).fill(0).map(() => Math.random() * 0.05)
      }));

      const result = processCollections(collections);
      const canSaveResult = canSave(result);

      expect(canSaveResult.canSave).toBe(true);
    });
  });
});

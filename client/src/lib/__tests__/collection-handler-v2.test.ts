import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleCompleteCollectionV2,
  handleSaveAfterAnomalyRemoval,
  CollectionHandlerConfig
} from '../collection-handler-v2';

// 模拟函数
const mockLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
};

const mockOperationLogger = {
  log: vi.fn()
};

// ✅ 修复9：添加getCommand的mock，以便测试能正常运行
const mockEmgDatabase = {
  getCommand: vi.fn().mockResolvedValue(null),  // 默认返回 null（指令不存在）
  saveCommand: vi.fn().mockResolvedValue(undefined)
};

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

describe('采集完成处理 V2', () => {
  let baseConfig: CollectionHandlerConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    baseConfig = {
      commandName: 'test-command',
      collectionHistory: Array(5).fill(null).map((_, idx) => ({
        index: idx,
        timestamp: new Date(),
        waveform: {
          ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
          ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
          ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
        }
      })),
      currentUser: {
        userId: 'user-123',
        userName: 'Test User'
      },
      savedCommands: [],
      emgDatabase: mockEmgDatabase,
      logger: mockLogger,
      operationLogger: mockOperationLogger,
      FIXED_WAVEFORM_LENGTH: 512,
      SAMPLE_RATE: 500
    };
  });

  describe('handleCompleteCollectionV2', () => {
    it('应该成功处理采集', async () => {
      const result = await handleCompleteCollectionV2(baseConfig);

      expect(result.success).toBe(true);
      expect(mockEmgDatabase.saveCommand).toHaveBeenCalled();
      expect(mockLogger.log).toHaveBeenCalledWith('=== 开始采集完成处理 ===');
    });

    it('应该在没有指令名称时失败', async () => {
      const config = { ...baseConfig, commandName: '' };
      const result = await handleCompleteCollectionV2(config);

      expect(result.success).toBe(false);
      expect(result.message).toContain('指令名称');
    });

    it('应该在没有采集数据时失败', async () => {
      const config = { ...baseConfig, collectionHistory: [] };
      const result = await handleCompleteCollectionV2(config);

      expect(result.success).toBe(false);
      expect(result.message).toContain('采集数据');
    });

    it('应该在用户未登录时失败', async () => {
      const config = { ...baseConfig, currentUser: null as any };
      const result = await handleCompleteCollectionV2(config);

      expect(result.success).toBe(false);
      expect(result.message).toContain('登录');
    });

    it('应该检查新指令的最少采集次数', async () => {
      const config = {
        ...baseConfig,
        collectionHistory: Array(3).fill(null).map((_, idx) => ({
          index: idx,
          timestamp: new Date(),
          waveform: {
            ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
            ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
            ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
          }
        }))
      };

      const result = await handleCompleteCollectionV2(config);

      expect(result.success).toBe(false);
      expect(result.message).toContain('至少需要 5 条数据');
    });

    it('应该允许继续采集只需1条数据', async () => {
      const config = {
        ...baseConfig,
        collectionHistory: Array(1).fill(null).map((_, idx) => ({
          index: idx,
          timestamp: new Date(),
          waveform: {
            ch1: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
            ch2: generateSignal(1000, 0.1, 0.3, 0.7, 1.0),
            ch3: generateSignal(1000, 0.1, 0.3, 0.7, 1.0)
          }
        })),
        savedCommands: [{ name: 'test-command', id: 'cmd-1', collections: [] }]
      };

      const result = await handleCompleteCollectionV2(config);

      expect(result.success).toBe(true);
    });

    it('应该保存采集到数据库', async () => {
      const result = await handleCompleteCollectionV2(baseConfig);

      expect(result.success).toBe(true);
      expect(mockEmgDatabase.saveCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-command',
          userId: 'user-123',
          collections: expect.any(Array)
        })
      );
    });

    it('应该返回正确的统计信息', async () => {
      const result = await handleCompleteCollectionV2(baseConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('✓ 指令');
      expect(result.message).toContain('采集次数');
      expect(result.message).toContain('归一化时长');
    });

    it('应该处理数据库错误', async () => {
      const errorConfig = {
        ...baseConfig,
        emgDatabase: {
          saveCommand: vi.fn().mockRejectedValue(new Error('数据库错误'))
        }
      };

      const result = await handleCompleteCollectionV2(errorConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('保存失败');
      expect(result.message).toContain('数据库错误');
    });
  });

  describe('handleSaveAfterAnomalyRemoval', () => {
    it('应该删除指定的异常波形后保存', async () => {
      // 首先处理采集得到processedWaveforms
      const processingResult = await handleCompleteCollectionV2(baseConfig);
      expect(processingResult.success).toBe(true);

      // 模拟已处理的波形
      const processedWaveforms = Array(5).fill(null).map((_, idx) => ({
        ch1: generateSignal(512),
        ch2: generateSignal(512),
        ch3: generateSignal(512),
        meta: {
          croppingMeta: { stage: 'primary', confidence: 0.9 },
          normalizationMeta: { targetLength: 512 }
        }
      }));

      const result = await handleSaveAfterAnomalyRemoval(
        baseConfig,
        processedWaveforms,
        [1, 3] // 删除第2和第4条
      );

      expect(result.success).toBe(true);
      expect(mockEmgDatabase.saveCommand).toHaveBeenCalled();
    });

    it('应该在删除全部波形时失败', async () => {
      const processedWaveforms = Array(2).fill(null).map(() => ({
        ch1: generateSignal(512),
        ch2: generateSignal(512),
        ch3: generateSignal(512),
        meta: {
          croppingMeta: { stage: 'primary', confidence: 0.9 },
          normalizationMeta: { targetLength: 512 }
        }
      }));

      const result = await handleSaveAfterAnomalyRemoval(
        baseConfig,
        processedWaveforms,
        [0, 1] // 删除全部
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('至少需要保留 1 条');
    });

    it('应该在删除后保存正确的波形数量', async () => {
      const processedWaveforms = Array(5).fill(null).map((_, idx) => ({
        ch1: generateSignal(512),
        ch2: generateSignal(512),
        ch3: generateSignal(512),
        meta: {
          croppingMeta: { stage: 'primary', confidence: 0.9 },
          normalizationMeta: { targetLength: 512 }
        }
      }));

      const result = await handleSaveAfterAnomalyRemoval(
        baseConfig,
        processedWaveforms,
        [2] // 只删除第3条
      );

      expect(result.success).toBe(true);
      expect(mockEmgDatabase.saveCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          collections: expect.arrayContaining([
            expect.objectContaining({ waveform: expect.any(Object) })
          ])
        })
      );
    });
  });
});

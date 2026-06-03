/**
 * 删除功能和准确率计算单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 模拟IndexedDB的命令存储
 */
class MockCommandStore {
  private commands: Map<string, any> = new Map();
  private recognitionRecords: Array<any> = [];

  async saveCommand(command: any): Promise<void> {
    this.commands.set(command.id, command);
  }

  async getCommand(id: string): Promise<any> {
    return this.commands.get(id);
  }

  async deleteCommand(id: string): Promise<boolean> {
    const existed = this.commands.has(id);
    this.commands.delete(id);
    return existed;
  }

  async getAllCommands(): Promise<any[]> {
    return Array.from(this.commands.values());
  }

  async saveRecognitionRecord(record: any): Promise<void> {
    this.recognitionRecords.push(record);
  }

  async getRecognitionRecords(commandName: string): Promise<any[]> {
    return this.recognitionRecords.filter(r => r.commandName === commandName);
  }

  async deleteRecognitionRecords(commandName: string): Promise<number> {
    const initialLength = this.recognitionRecords.length;
    this.recognitionRecords = this.recognitionRecords.filter(r => r.commandName !== commandName);
    return initialLength - this.recognitionRecords.length;
  }

  async getAllRecognitionRecords(): Promise<any[]> {
    return [...this.recognitionRecords];
  }

  clear(): void {
    this.commands.clear();
    this.recognitionRecords = [];
  }
}

/**
 * 计算准确率的辅助函数
 */
function calculateAccuracy(records: any[]): number {
  if (records.length === 0) return 0;
  const correctCount = records.filter(r => r.isCorrect).length;
  return (correctCount / records.length) * 100;
}

describe('删除功能测试', () => {
  let store: MockCommandStore;

  beforeEach(() => {
    store = new MockCommandStore();
  });

  it('应该成功保存命令', async () => {
    const command = {
      id: 'cmd1',
      name: 'hello',
      collections: [
        { waveform: { ch1: [1, 2, 3], ch2: [1, 2, 3], ch3: [1, 2, 3] } }
      ]
    };

    await store.saveCommand(command);
    const retrieved = await store.getCommand('cmd1');

    expect(retrieved).toBeDefined();
    expect(retrieved.name).toBe('hello');
  });

  it('应该成功删除命令', async () => {
    const command = {
      id: 'cmd1',
      name: 'hello',
      collections: []
    };

    await store.saveCommand(command);
    let retrieved = await store.getCommand('cmd1');
    expect(retrieved).toBeDefined();

    const deleted = await store.deleteCommand('cmd1');
    expect(deleted).toBe(true);

    retrieved = await store.getCommand('cmd1');
    expect(retrieved).toBeUndefined();
  });

  it('应该在删除后不再出现在列表中', async () => {
    const cmd1 = { id: 'cmd1', name: 'hello', collections: [] };
    const cmd2 = { id: 'cmd2', name: 'world', collections: [] };

    await store.saveCommand(cmd1);
    await store.saveCommand(cmd2);

    let allCommands = await store.getAllCommands();
    expect(allCommands).toHaveLength(2);

    await store.deleteCommand('cmd1');

    allCommands = await store.getAllCommands();
    expect(allCommands).toHaveLength(1);
    expect(allCommands[0].id).toBe('cmd2');
  });

  it('应该删除不存在的命令返回false', async () => {
    const deleted = await store.deleteCommand('nonexistent');
    expect(deleted).toBe(false);
  });

  it('应该支持多次删除同一命令', async () => {
    const command = { id: 'cmd1', name: 'hello', collections: [] };

    await store.saveCommand(command);
    let deleted = await store.deleteCommand('cmd1');
    expect(deleted).toBe(true);

    deleted = await store.deleteCommand('cmd1');
    expect(deleted).toBe(false);
  });

  it('应该在删除后清除关联的识别记录', async () => {
    const command = { id: 'cmd1', name: 'hello', collections: [] };
    await store.saveCommand(command);

    // 添加识别记录
    await store.saveRecognitionRecord({
      commandName: 'hello',
      isCorrect: true,
      timestamp: Date.now()
    });
    await store.saveRecognitionRecord({
      commandName: 'hello',
      isCorrect: false,
      timestamp: Date.now()
    });

    let records = await store.getRecognitionRecords('hello');
    expect(records).toHaveLength(2);

    // 删除命令
    await store.deleteCommand('cmd1');

    // 清除识别记录
    const deletedCount = await store.deleteRecognitionRecords('hello');
    expect(deletedCount).toBe(2);

    records = await store.getRecognitionRecords('hello');
    expect(records).toHaveLength(0);
  });

  it('应该支持批量删除', async () => {
    const commands = [
      { id: 'cmd1', name: 'hello', collections: [] },
      { id: 'cmd2', name: 'world', collections: [] },
      { id: 'cmd3', name: 'test', collections: [] }
    ];

    for (const cmd of commands) {
      await store.saveCommand(cmd);
    }

    let allCommands = await store.getAllCommands();
    expect(allCommands).toHaveLength(3);

    // 删除前两个
    await store.deleteCommand('cmd1');
    await store.deleteCommand('cmd2');

    allCommands = await store.getAllCommands();
    expect(allCommands).toHaveLength(1);
    expect(allCommands[0].id).toBe('cmd3');
  });
});

describe('准确率计算测试', () => {
  let store: MockCommandStore;

  beforeEach(() => {
    store = new MockCommandStore();
  });

  it('应该计算空记录的准确率为0', () => {
    const accuracy = calculateAccuracy([]);
    expect(accuracy).toBe(0);
  });

  it('应该计算单个正确记录的准确率为100', () => {
    const records = [{ isCorrect: true }];
    const accuracy = calculateAccuracy(records);
    expect(accuracy).toBe(100);
  });

  it('应该计算单个错误记录的准确率为0', () => {
    const records = [{ isCorrect: false }];
    const accuracy = calculateAccuracy(records);
    expect(accuracy).toBe(0);
  });

  it('应该计算混合记录的准确率', () => {
    const records = [
      { isCorrect: true },
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: true }
    ];
    const accuracy = calculateAccuracy(records);
    expect(accuracy).toBeCloseTo(75, 1);
  });

  it('应该保存和检索识别记录', async () => {
    const record = {
      commandName: 'hello',
      isCorrect: true,
      timestamp: Date.now()
    };

    await store.saveRecognitionRecord(record);
    const records = await store.getRecognitionRecords('hello');

    expect(records).toHaveLength(1);
    expect(records[0].isCorrect).toBe(true);
  });

  it('应该计算特定命令的准确率', async () => {
    // 添加hello命令的识别记录
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: true });
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: true });
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: false });

    // 添加world命令的识别记录
    await store.saveRecognitionRecord({ commandName: 'world', isCorrect: true });
    await store.saveRecognitionRecord({ commandName: 'world', isCorrect: false });

    const helloRecords = await store.getRecognitionRecords('hello');
    const helloAccuracy = calculateAccuracy(helloRecords);

    const worldRecords = await store.getRecognitionRecords('world');
    const worldAccuracy = calculateAccuracy(worldRecords);

    expect(helloAccuracy).toBeCloseTo(66.67, 1);
    expect(worldAccuracy).toBe(50);
  });

  it('应该计算所有命令的平均准确率', async () => {
    // 添加多个命令的识别记录
    await store.saveRecognitionRecord({ commandName: 'cmd1', isCorrect: true });
    await store.saveRecognitionRecord({ commandName: 'cmd1', isCorrect: true });

    await store.saveRecognitionRecord({ commandName: 'cmd2', isCorrect: true });
    await store.saveRecognitionRecord({ commandName: 'cmd2', isCorrect: false });

    await store.saveRecognitionRecord({ commandName: 'cmd3', isCorrect: false });
    await store.saveRecognitionRecord({ commandName: 'cmd3', isCorrect: false });

    const allRecords = await store.getAllRecognitionRecords();
    const overallAccuracy = calculateAccuracy(allRecords);

    // 3个正确 / 6个总数 = 50%
    expect(overallAccuracy).toBeCloseTo(50, 1);
  });

  it('应该在添加新记录后更新准确率', async () => {
    // 初始：1个正确，1个错误 = 50%
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: true });
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: false });

    let records = await store.getRecognitionRecords('hello');
    let accuracy = calculateAccuracy(records);
    expect(accuracy).toBe(50);

    // 添加2个正确的记录：3个正确，1个错误 = 75%
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: true });
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: true });

    records = await store.getRecognitionRecords('hello');
    accuracy = calculateAccuracy(records);
    expect(accuracy).toBe(75);
  });

  it('应该清除特定命令的识别记录后准确率变为0', async () => {
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: true });
    await store.saveRecognitionRecord({ commandName: 'hello', isCorrect: true });

    let records = await store.getRecognitionRecords('hello');
    expect(calculateAccuracy(records)).toBe(100);

    // 清除所有hello的识别记录
    await store.deleteRecognitionRecords('hello');

    records = await store.getRecognitionRecords('hello');
    expect(calculateAccuracy(records)).toBe(0);
  });

  it('应该处理大量识别记录', async () => {
    // 添加1000条识别记录
    for (let i = 0; i < 1000; i++) {
      await store.saveRecognitionRecord({
        commandName: 'hello',
        isCorrect: i % 2 === 0 // 50%正确
      });
    }

    const records = await store.getRecognitionRecords('hello');
    expect(records).toHaveLength(1000);

    const accuracy = calculateAccuracy(records);
    expect(accuracy).toBeCloseTo(50, 1);
  });

  it('应该支持多个命令的独立准确率追踪', async () => {
    const commands = ['hello', 'world', 'test'];

    for (const cmd of commands) {
      for (let i = 0; i < 10; i++) {
        await store.saveRecognitionRecord({
          commandName: cmd,
          isCorrect: Math.random() > 0.5
        });
      }
    }

    for (const cmd of commands) {
      const records = await store.getRecognitionRecords(cmd);
      expect(records).toHaveLength(10);
      const accuracy = calculateAccuracy(records);
      expect(accuracy).toBeGreaterThanOrEqual(0);
      expect(accuracy).toBeLessThanOrEqual(100);
    }
  });
});

describe('删除和准确率的交互测试', () => {
  let store: MockCommandStore;

  beforeEach(() => {
    store = new MockCommandStore();
  });

  it('应该在删除命令后清除其准确率数据', async () => {
    // 创建命令并添加识别记录
    const command = { id: 'cmd1', name: 'hello', collections: [] };
    await store.saveCommand(command);

    for (let i = 0; i < 5; i++) {
      await store.saveRecognitionRecord({
        commandName: 'hello',
        isCorrect: i % 2 === 0
      });
    }

    let records = await store.getRecognitionRecords('hello');
    expect(records).toHaveLength(5);
    expect(calculateAccuracy(records)).toBeCloseTo(60, 1);

    // 删除命令
    await store.deleteCommand('cmd1');
    await store.deleteRecognitionRecords('hello');

    // 验证数据已清除
    records = await store.getRecognitionRecords('hello');
    expect(records).toHaveLength(0);
    expect(calculateAccuracy(records)).toBe(0);
  });

  it('应该在删除某个命令后不影响其他命令的准确率', async () => {
    // 创建两个命令
    const cmd1 = { id: 'cmd1', name: 'hello', collections: [] };
    const cmd2 = { id: 'cmd2', name: 'world', collections: [] };

    await store.saveCommand(cmd1);
    await store.saveCommand(cmd2);

    // 为两个命令添加识别记录
    for (let i = 0; i < 5; i++) {
      await store.saveRecognitionRecord({
        commandName: 'hello',
        isCorrect: true
      });
      await store.saveRecognitionRecord({
        commandName: 'world',
        isCorrect: false
      });
    }

    // 删除hello命令
    await store.deleteCommand('cmd1');
    await store.deleteRecognitionRecords('hello');

    // 验证world的准确率不变
    const worldRecords = await store.getRecognitionRecords('world');
    expect(worldRecords).toHaveLength(5);
    expect(calculateAccuracy(worldRecords)).toBe(0);

    // 验证hello的准确率已清除
    const helloRecords = await store.getRecognitionRecords('hello');
    expect(helloRecords).toHaveLength(0);
  });
});

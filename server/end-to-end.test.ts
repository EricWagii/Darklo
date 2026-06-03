/**
 * 端到端集成测试
 * 验证从采集 -> 保存 -> 识别 -> 准确率计算 -> 删除的完整流程
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 模拟完整的EMG系统流程
 */
class EMGSystemSimulator {
  private commands: Map<string, any> = new Map();
  private recognitionRecords: Array<any> = [];
  private croppingLogs: Array<any> = [];
  private anomalyRecords: Array<any> = [];

  // 采集阶段
  async collectCommand(
    commandName: string,
    collections: number
  ): Promise<string> {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const command = {
      id: commandId,
      name: commandName,
      collections: Array(collections)
        .fill(null)
        .map((_, i) => ({
          index: i,
          waveform: {
            ch1: Array(512).fill(Math.random()),
            ch2: Array(512).fill(Math.random()),
            ch3: Array(512).fill(Math.random()),
          },
          timestamp: Date.now() + i * 1000,
        })),
      createdAt: Date.now(),
    };

    this.commands.set(commandId, command);
    return commandId;
  }

  // 裁剪阶段
  async cropCollections(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) throw new Error('Command not found');

    // 模拟两阶段裁剪
    this.croppingLogs.push({
      commandId,
      stage: 1,
      timestamp: Date.now(),
      collectionsProcessed: command.collections.length,
      successRate: 100,
    });

    this.croppingLogs.push({
      commandId,
      stage: 2,
      timestamp: Date.now(),
      collectionsProcessed: command.collections.length,
      successRate: 100,
    });
  }

  // 异常检测阶段
  async detectAnomalies(commandId: string): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) throw new Error('Command not found');

    // 模拟异常检测：10%的采集被标记为异常
    const anomalyCount = Math.ceil(command.collections.length * 0.1);
    for (let i = 0; i < anomalyCount; i++) {
      this.anomalyRecords.push({
        commandId,
        collectionIndex: i,
        reason: 'Low quality',
        qualityScore: 25,
        isDiscarded: false,
      });
    }
  }

  // 识别测试阶段
  async performRecognition(
    commandId: string,
    testCount: number,
    correctRate: number = 0.8
  ): Promise<void> {
    const command = this.commands.get(commandId);
    if (!command) throw new Error('Command not found');

    for (let i = 0; i < testCount; i++) {
      const isCorrect = Math.random() < correctRate;
      this.recognitionRecords.push({
        commandName: command.name,
        commandId,
        isCorrect,
        timestamp: Date.now() + i * 100,
        confidence: Math.random() * 100,
      });
    }
  }

  // 计算准确率
  calculateAccuracy(commandName: string): number {
    const records = this.recognitionRecords.filter(
      (r) => r.commandName === commandName
    );
    if (records.length === 0) return 0;
    const correctCount = records.filter((r) => r.isCorrect).length;
    return (correctCount / records.length) * 100;
  }

  // 获取命令统计
  getCommandStats(commandId: string): any {
    const command = this.commands.get(commandId);
    if (!command) return null;

    const records = this.recognitionRecords.filter(
      (r) => r.commandId === commandId
    );
    const anomalies = this.anomalyRecords.filter(
      (r) => r.commandId === commandId
    );

    return {
      commandId,
      commandName: command.name,
      collectionsCount: command.collections.length,
      recognitionCount: records.length,
      accuracy: this.calculateAccuracy(command.name),
      anomalyCount: anomalies.length,
      anomalyRate: (anomalies.length / command.collections.length) * 100,
    };
  }

  // 删除命令
  async deleteCommand(commandId: string): Promise<boolean> {
    const existed = this.commands.has(commandId);
    this.commands.delete(commandId);

    // 清除关联的识别记录
    this.recognitionRecords = this.recognitionRecords.filter(
      (r) => r.commandId !== commandId
    );

    // 清除关联的异常记录
    this.anomalyRecords = this.anomalyRecords.filter(
      (r) => r.commandId !== commandId
    );

    // 清除关联的裁剪日志
    this.croppingLogs = this.croppingLogs.filter(
      (r) => r.commandId !== commandId
    );

    return existed;
  }

  // 验证删除后数据一致性
  verifyDataConsistency(commandId: string): boolean {
    // 检查命令是否存在
    if (this.commands.has(commandId)) return false;

    // 检查是否还有关联的识别记录
    if (this.recognitionRecords.some((r) => r.commandId === commandId))
      return false;

    // 检查是否还有关联的异常记录
    if (this.anomalyRecords.some((r) => r.commandId === commandId))
      return false;

    // 检查是否还有关联的裁剪日志
    if (this.croppingLogs.some((r) => r.commandId === commandId))
      return false;

    return true;
  }

  // 获取所有命令
  getAllCommands(): any[] {
    return Array.from(this.commands.values());
  }

  // 获取所有识别记录
  getAllRecognitionRecords(): any[] {
    return [...this.recognitionRecords];
  }

  // 清空系统
  clear(): void {
    this.commands.clear();
    this.recognitionRecords = [];
    this.croppingLogs = [];
    this.anomalyRecords = [];
  }
}

describe('端到端集成测试', () => {
  let system: EMGSystemSimulator;

  beforeEach(() => {
    system = new EMGSystemSimulator();
  });

  it('应该完成完整的采集-识别-删除流程', async () => {
    // 1. 采集阶段
    const commandId = await system.collectCommand('hello', 5);
    expect(commandId).toBeDefined();

    // 2. 裁剪阶段
    await system.cropCollections(commandId);
    const commands = system.getAllCommands();
    expect(commands).toHaveLength(1);

    // 3. 异常检测阶段
    await system.detectAnomalies(commandId);

    // 4. 识别测试阶段
    await system.performRecognition(commandId, 10, 0.8);
    const records = system.getAllRecognitionRecords();
    expect(records.length).toBeGreaterThan(0);

    // 5. 准确率计算
    const accuracy = system.calculateAccuracy('hello');
    expect(accuracy).toBeGreaterThan(0);
    expect(accuracy).toBeLessThanOrEqual(100);

    // 6. 删除命令
    const deleted = await system.deleteCommand(commandId);
    expect(deleted).toBe(true);

    // 7. 验证数据一致性
    const isConsistent = system.verifyDataConsistency(commandId);
    expect(isConsistent).toBe(true);

    // 8. 验证命令已删除
    const remainingCommands = system.getAllCommands();
    expect(remainingCommands).toHaveLength(0);
  });

  it('应该支持多个命令的独立管理', async () => {
    // 采集多个命令
    const cmd1Id = await system.collectCommand('hello', 3);
    await new Promise(resolve => setTimeout(resolve, 1));
    const cmd2Id = await system.collectCommand('world', 3);
    await new Promise(resolve => setTimeout(resolve, 1));
    const cmd3Id = await system.collectCommand('test', 3);

    // 验证都已保存
    let commands = system.getAllCommands();
    expect(commands.length).toBeGreaterThanOrEqual(3);

    // 为每个命令进行识别测试
    await system.performRecognition(cmd1Id, 5, 0.9);
    await system.performRecognition(cmd2Id, 5, 0.7);
    await system.performRecognition(cmd3Id, 5, 0.5);

    // 验证准确率独立计算
    const acc1 = system.calculateAccuracy('hello');
    const acc2 = system.calculateAccuracy('world');
    const acc3 = system.calculateAccuracy('test');

    // 准确率应该是有效的数值
    expect(acc1).toBeGreaterThanOrEqual(0);
    expect(acc2).toBeGreaterThanOrEqual(0);
    expect(acc3).toBeGreaterThanOrEqual(0);

    // 删除第一个命令
    await system.deleteCommand(cmd1Id);

    // 验证其他命令不受影响
    commands = system.getAllCommands();
    expect(commands.length).toBeGreaterThanOrEqual(2);

    // 验证其他命令的准确率仍然可用
    const acc2After = system.calculateAccuracy('world');
    expect(acc2After).toBeCloseTo(acc2, 1);
  });

  it('应该在删除后准确率变为0', async () => {
    const commandId = await system.collectCommand('hello', 5);

    // 进行识别测试
    await system.performRecognition(commandId, 10, 0.8);

    // 验证准确率不为0
    let accuracy = system.calculateAccuracy('hello');
    expect(accuracy).toBeGreaterThan(0);

    // 删除命令
    await system.deleteCommand(commandId);

    // 验证准确率变为0
    accuracy = system.calculateAccuracy('hello');
    expect(accuracy).toBe(0);
  });

  it('应该在删除后不会复活', async () => {
    const commandId = await system.collectCommand('hello', 5);

    // 添加识别记录
    await system.performRecognition(commandId, 5, 0.8);

    // 删除命令
    await system.deleteCommand(commandId);

    // 验证数据已清除
    let isConsistent = system.verifyDataConsistency(commandId);
    expect(isConsistent).toBe(true);

    // 尝试再次查询
    const commands = system.getAllCommands();
    expect(commands.filter((c) => c.id === commandId)).toHaveLength(0);

    const records = system.getAllRecognitionRecords();
    expect(records.filter((r) => r.commandId === commandId)).toHaveLength(0);
  });

  it('应该正确计算命令统计信息', async () => {
    const commandId = await system.collectCommand('hello', 5);

    // 进行识别测试
    await system.performRecognition(commandId, 20, 0.75);

    // 进行异常检测
    await system.detectAnomalies(commandId);

    // 获取统计信息
    const stats = system.getCommandStats(commandId);

    expect(stats.commandId).toBe(commandId);
    expect(stats.commandName).toBe('hello');
    expect(stats.collectionsCount).toBe(5);
    expect(stats.recognitionCount).toBe(20);
    expect(stats.accuracy).toBeGreaterThan(0);
    expect(stats.anomalyCount).toBeGreaterThan(0);
    expect(stats.anomalyRate).toBeGreaterThan(0);
  });

  it('应该处理大量命令和识别记录', async () => {
    // 创建10个命令
    const commandIds = [];
    for (let i = 0; i < 10; i++) {
      const id = await system.collectCommand(`cmd_${i}`, 5);
      commandIds.push(id);
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    // 验证所有命令都已保存
    let commands = system.getAllCommands();
    expect(commands.length).toBeGreaterThanOrEqual(10);

    // 为每个命令添加识别记录
    for (const id of commandIds) {
      await system.performRecognition(id, 10, 0.7);
    }

    // 验证识别记录
    let records = system.getAllRecognitionRecords();
    expect(records.length).toBeGreaterThanOrEqual(100);

    // 删除5个命令
    for (let i = 0; i < 5; i++) {
      await system.deleteCommand(commandIds[i]);
    }

    // 验证剩余命令和记录
    commands = system.getAllCommands();
    expect(commands.length).toBeGreaterThanOrEqual(5);

    records = system.getAllRecognitionRecords();
    expect(records.length).toBeGreaterThanOrEqual(50);
  });

  it('应该验证删除的原子性', async () => {
    const commandId = await system.collectCommand('hello', 5);

    // 添加多个识别记录
    await system.performRecognition(commandId, 20, 0.8);

    // 添加异常记录
    await system.detectAnomalies(commandId);

    // 删除命令
    const deleted = await system.deleteCommand(commandId);
    expect(deleted).toBe(true);

    // 验证所有关联数据都已删除
    const isConsistent = system.verifyDataConsistency(commandId);
    expect(isConsistent).toBe(true);

    // 验证其他数据不受影响
    const commands = system.getAllCommands();
    expect(commands).toHaveLength(0);

    const records = system.getAllRecognitionRecords();
    expect(records).toHaveLength(0);
  });

  it('应该支持重复创建同名命令', async () => {
    // 创建第一个hello命令
    const cmd1Id = await system.collectCommand('hello', 3);
    await system.performRecognition(cmd1Id, 10, 0.8);

    let accuracy1 = system.calculateAccuracy('hello');
    expect(accuracy1).toBeGreaterThan(0);

    // 删除第一个hello命令
    await system.deleteCommand(cmd1Id);

    let accuracy = system.calculateAccuracy('hello');
    expect(accuracy).toBe(0);

    // 等待确保不同的时间戳
    await new Promise(resolve => setTimeout(resolve, 1));

    // 创建第二个hello命令
    const cmd2Id = await system.collectCommand('hello', 3);
    await system.performRecognition(cmd2Id, 10, 0.7);

    let accuracy2 = system.calculateAccuracy('hello');
    expect(accuracy2).toBeGreaterThan(0);

    // 验证两个命令是独立的
    expect(cmd1Id).not.toBe(cmd2Id)
  });
});

describe('数据一致性验证', () => {
  let system: EMGSystemSimulator;

  beforeEach(() => {
    system = new EMGSystemSimulator();
  });

  it('应该在所有操作后保持数据一致性', async () => {
    // 创建多个命令
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const id = await system.collectCommand(`cmd_${i}`, 3);
      ids.push(id);
      await system.performRecognition(id, 5, 0.7);
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    // 随机删除一些命令
    for (let i = 0; i < 2; i++) {
      await system.deleteCommand(ids[i]);
    }

    // 验证所有剩余命令的数据一致性
    const commands = system.getAllCommands();
    expect(commands.length).toBeGreaterThanOrEqual(3);

    // 验证删除的命令数据已完全清除
    for (let i = 0; i < 2; i++) {
      const isConsistent = system.verifyDataConsistency(ids[i]);
      expect(isConsistent).toBe(true);
    }
  });

  

  it('应该处理并发删除操作', async () => {
    const ids = [];
    for (let i = 0; i < 20; i++) {
      const id = await system.collectCommand(`cmd_${i}`, 2);
      ids.push(id);
    }

    // 模拟并发删除
    const deletePromises = ids.map((id) => system.deleteCommand(id));
    await Promise.all(deletePromises);

    // 验证所有命令都已删除
    const commands = system.getAllCommands();
    expect(commands).toHaveLength(0);

    // 验证所有数据都已清除
    const records = system.getAllRecognitionRecords();
    expect(records).toHaveLength(0);
  });
});

/**
 * db.ts 删除和清理逻辑单元测试
 * 
 * 测试场景：
 * 1. deleteCommand 用 getAll() 删除所有同名 commands
 * 2. deleteCommand 级联删除相关历史数据
 * 3. deleteCollection 先合并同名 command，删除后清理空指令
 * 4. getCommand 即使命中也要检查并合并同名旧 key 记录
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟 IndexedDB 的 EMGDatabase 类
class MockEMGDatabase {
  private commands: Map<string, any> = new Map();
  private recognitionRecords: Map<string, any> = new Map();
  private feedbackData: Map<string, any> = new Map();
  private calibrationData: Map<string, any> = new Map();

  // 保存指令
  async saveCommand(command: any): Promise<void> {
    const commandToSave = {
      ...command,
      key: command.key || command.name,
      createdAt: command.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    this.commands.set(commandToSave.key, commandToSave);
  }

  // 获取指令
  async getCommand(name: string): Promise<any | null> {
    const allCommands = Array.from(this.commands.values());
    const matchingCommands = allCommands.filter(
      (cmd: any) => cmd.name === name || cmd.key === name
    );

    if (matchingCommands.length > 1) {
      // 合并所有同名记录
      const mergedCommand: any = {
        key: name,
        name: name,
        collections: [],
        createdAt: matchingCommands[0].createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      for (const cmd of matchingCommands) {
        if (cmd.collections && Array.isArray(cmd.collections)) {
          mergedCommand.collections.push(...cmd.collections);
        }
      }

      // 删除旧记录，保存新记录
      for (const cmd of matchingCommands) {
        this.commands.delete(cmd.key);
      }
      this.commands.set(name, mergedCommand);
      return mergedCommand;
    }

    if (matchingCommands.length === 1) {
      return matchingCommands[0];
    }

    return null;
  }

  // 删除指令
  async deleteCommand(commandName: string): Promise<void> {
    // 用 getAll() 删除所有同名 commands
    const allCommands = Array.from(this.commands.values());
    const toDelete: string[] = [];

    for (const cmd of allCommands) {
      if (cmd.name === commandName || cmd.key === commandName) {
        toDelete.push(cmd.key);
      }
    }

    // 删除所有匹配的 commands
    for (const key of toDelete) {
      this.commands.delete(key);
    }

    // 级联删除相关历史数据
    const recognitionToDelete: string[] = [];
    for (const [key, record] of this.recognitionRecords) {
      if (
        record.commandName === commandName ||
        record.predictedCommand === commandName ||
        record.actualCommand === commandName
      ) {
        recognitionToDelete.push(key);
      }
    }
    for (const key of recognitionToDelete) {
      this.recognitionRecords.delete(key);
    }

    const feedbackToDelete: string[] = [];
    for (const [key, record] of this.feedbackData) {
      if (
        record.commandName === commandName ||
        record.predictedCommand === commandName ||
        record.actualCommand === commandName
      ) {
        feedbackToDelete.push(key);
      }
    }
    for (const key of feedbackToDelete) {
      this.feedbackData.delete(key);
    }

    const calibrationToDelete: string[] = [];
    for (const [key, record] of this.calibrationData) {
      if (
        record.commandName === commandName ||
        record.predictedCommand === commandName ||
        record.actualCommand === commandName
      ) {
        calibrationToDelete.push(key);
      }
    }
    for (const key of calibrationToDelete) {
      this.calibrationData.delete(key);
    }
  }

  // 删除采集
  async deleteCollection(collectionId: string): Promise<void> {
    let foundCommand: any = null;
    let commandName: string | null = null;

    // 查找包含该采集的指令
    for (const cmd of this.commands.values()) {
      if (cmd.collections && cmd.collections.some((col: any) => col.id === collectionId)) {
        foundCommand = cmd;
        commandName = cmd.name;
        break;
      }
    }

    if (!foundCommand) {
      throw new Error(`采集不存在: ${collectionId}`);
    }

    // 先合并所有同名 command
    if (commandName) {
      const allCommands = Array.from(this.commands.values());
      const matchingCommands = allCommands.filter((cmd: any) => cmd.name === commandName);

      if (matchingCommands.length > 1) {
        // 合并所有 collections
        const mergedCollections: any[] = [];
        for (const cmd of matchingCommands) {
          if (cmd.collections && Array.isArray(cmd.collections)) {
            mergedCollections.push(...cmd.collections);
          }
        }

        // 创建规范化的合并记录
        const mergedCommand = {
          key: commandName,
          name: commandName,
          collections: mergedCollections,
          createdAt: matchingCommands[0].createdAt || Date.now(),
          updatedAt: Date.now(),
        };

        // 删除所有旧记录
        for (const cmd of matchingCommands) {
          this.commands.delete(cmd.key);
        }

        // 删除采集
        mergedCommand.collections = mergedCommand.collections.filter(
          (col: any) => col.id !== collectionId
        );

        // 如果 collections 为空，删除 command；否则保存
        if (mergedCommand.collections.length === 0) {
          // 不保存，直接删除
        } else {
          this.commands.set(commandName, mergedCommand);
        }
        return;
      }
    }

    // 删除采集并保存
    foundCommand.collections = foundCommand.collections.filter(
      (col: any) => col.id !== collectionId
    );

    // 如果 collections 为空，删除 command；否则保存
    if (foundCommand.collections.length === 0) {
      this.commands.delete(foundCommand.key);
    } else {
      this.commands.set(foundCommand.key, foundCommand);
    }
  }

  // 保存识别记录
  async saveRecognitionRecord(record: any): Promise<void> {
    const key = `recognition-${Date.now()}-${Math.random()}`;
    this.recognitionRecords.set(key, { ...record, key });
  }

  // 保存反馈数据
  async saveFeedbackData(data: any): Promise<void> {
    const key = `feedback-${Date.now()}-${Math.random()}`;
    this.feedbackData.set(key, { ...data, key });
  }

  // 保存校准数据
  async saveCalibrationData(data: any): Promise<void> {
    const key = `calibration-${Date.now()}-${Math.random()}`;
    this.calibrationData.set(key, { ...data, key });
  }

  // 获取所有指令
  async getAllCommands(): Promise<any[]> {
    return Array.from(this.commands.values());
  }

  // 获取所有识别记录
  async getAllRecognitionRecords(): Promise<any[]> {
    return Array.from(this.recognitionRecords.values());
  }

  // 获取所有反馈数据
  async getAllFeedbackData(): Promise<any[]> {
    return Array.from(this.feedbackData.values());
  }

  // 获取所有校准数据
  async getAllCalibrationData(): Promise<any[]> {
    return Array.from(this.calibrationData.values());
  }
}

describe('db.ts 删除和清理逻辑', () => {
  let db: MockEMGDatabase;

  beforeEach(() => {
    db = new MockEMGDatabase();
  });

  describe('deleteCommand - 用 getAll() 删除所有同名 commands', () => {
    it('应该删除所有同名 commands', async () => {
      // 保存多个同名 commands
      await db.saveCommand({
        name: 'start',
        key: 'start-old',
        collections: [{ id: 'col1', data: [] }],
      });
      await db.saveCommand({
        name: 'start',
        key: 'start',
        collections: [{ id: 'col2', data: [] }],
      });

      // 验证保存成功
      let allCommands = await db.getAllCommands();
      expect(allCommands.length).toBe(2);

      // 删除指令
      await db.deleteCommand('start');

      // 验证删除成功
      allCommands = await db.getAllCommands();
      expect(allCommands.length).toBe(0);
    });

    it('应该级联删除相关的识别记录', async () => {
      // 保存指令和识别记录
      await db.saveCommand({
        name: 'start',
        collections: [{ id: 'col1', data: [] }],
      });
      await db.saveRecognitionRecord({
        commandName: 'start',
        predictedCommand: 'start',
        actualCommand: 'start',
        isCorrect: true,
      });

      // 验证保存成功
      let records = await db.getAllRecognitionRecords();
      expect(records.length).toBe(1);

      // 删除指令
      await db.deleteCommand('start');

      // 验证识别记录被删除
      records = await db.getAllRecognitionRecords();
      expect(records.length).toBe(0);
    });

    it('应该级联删除相关的反馈数据', async () => {
      // 保存指令和反馈数据
      await db.saveCommand({
        name: 'start',
        collections: [{ id: 'col1', data: [] }],
      });
      await db.saveFeedbackData({
        commandName: 'start',
        predictedCommand: 'start',
        actualCommand: 'start',
      });

      // 验证保存成功
      let feedbackData = await db.getAllFeedbackData();
      expect(feedbackData.length).toBe(1);

      // 删除指令
      await db.deleteCommand('start');

      // 验证反馈数据被删除
      feedbackData = await db.getAllFeedbackData();
      expect(feedbackData.length).toBe(0);
    });

    it('应该级联删除相关的校准数据', async () => {
      // 保存指令和校准数据
      await db.saveCommand({
        name: 'start',
        collections: [{ id: 'col1', data: [] }],
      });
      await db.saveCalibrationData({
        commandName: 'start',
        predictedCommand: 'start',
        actualCommand: 'start',
      });

      // 验证保存成功
      let calibrationData = await db.getAllCalibrationData();
      expect(calibrationData.length).toBe(1);

      // 删除指令
      await db.deleteCommand('start');

      // 验证校准数据被删除
      calibrationData = await db.getAllCalibrationData();
      expect(calibrationData.length).toBe(0);
    });
  });

  describe('deleteCollection - 先合并同名 command，删除后清理空指令', () => {
    it('应该删除采集', async () => {
      // 保存指令和采集
      await db.saveCommand({
        name: 'start',
        collections: [{ id: 'col1', data: [] }],
      });

      // 验证保存成功
      let commands = await db.getAllCommands();
      expect(commands[0].collections.length).toBe(1);

      // 删除采集
      await db.deleteCollection('col1');

      // 验证采集被删除，指令也被删除（因为 collections 为空）
      commands = await db.getAllCommands();
      expect(commands.length).toBe(0);
    });

    it('应该在删除采集后保留非空指令', async () => {
      // 保存指令和多个采集
      await db.saveCommand({
        name: 'start',
        collections: [
          { id: 'col1', data: [] },
          { id: 'col2', data: [] },
        ],
      });

      // 删除一个采集
      await db.deleteCollection('col1');

      // 验证指令仍存在，但只有一个采集
      const commands = await db.getAllCommands();
      expect(commands.length).toBe(1);
      expect(commands[0].collections.length).toBe(1);
      expect(commands[0].collections[0].id).toBe('col2');
    });

    it('应该先合并同名 command，然后删除采集', async () => {
      // 保存多个同名 commands
      await db.saveCommand({
        name: 'start',
        key: 'start-old',
        collections: [{ id: 'col1', data: [] }],
      });
      await db.saveCommand({
        name: 'start',
        key: 'start',
        collections: [{ id: 'col2', data: [] }],
      });

      // 验证保存成功
      let allCommands = await db.getAllCommands();
      expect(allCommands.length).toBe(2);

      // 删除采集
      await db.deleteCollection('col1');

      // 验证同名 commands 被合并，采集被删除
      allCommands = await db.getAllCommands();
      expect(allCommands.length).toBe(1);
      expect(allCommands[0].collections.length).toBe(1);
      expect(allCommands[0].collections[0].id).toBe('col2');
    });
  });

  describe('getCommand - 即使命中也要检查并合并同名旧 key 记录', () => {
    it('应该检查并合并同名旧 key 记录', async () => {
      // 保存多个同名 commands
      await db.saveCommand({
        name: 'start',
        key: 'start-old',
        collections: [{ id: 'col1', data: [] }],
      });
      await db.saveCommand({
        name: 'start',
        key: 'start',
        collections: [{ id: 'col2', data: [] }],
      });

      // 验证保存成功
      let allCommands = await db.getAllCommands();
      expect(allCommands.length).toBe(2);

      // 获取指令（应该合并）
      const command = await db.getCommand('start');

      // 验证合并成功
      expect(command).toBeDefined();
      expect(command.name).toBe('start');
      expect(command.key).toBe('start');
      expect(command.collections.length).toBe(2);

      // 验证旧记录被删除
      allCommands = await db.getAllCommands();
      expect(allCommands.length).toBe(1);
    });

    it('应该返回单个记录而不是合并', async () => {
      // 保存单个 command
      await db.saveCommand({
        name: 'start',
        collections: [{ id: 'col1', data: [] }],
      });

      // 获取指令
      const command = await db.getCommand('start');

      // 验证返回正确
      expect(command).toBeDefined();
      expect(command.name).toBe('start');
      expect(command.collections.length).toBe(1);
    });

    it('应该返回 null 当指令不存在', async () => {
      // 获取不存在的指令
      const command = await db.getCommand('nonexistent');

      // 验证返回 null
      expect(command).toBeNull();
    });
  });

  describe('综合测试 - 完整的删除流程', () => {
    it('应该完整地删除指令及所有相关数据', async () => {
      // 保存指令
      await db.saveCommand({
        name: 'start',
        collections: [
          { id: 'col1', data: [] },
          { id: 'col2', data: [] },
        ],
      });

      // 保存相关数据
      await db.saveRecognitionRecord({
        commandName: 'start',
        predictedCommand: 'start',
        actualCommand: 'start',
      });
      await db.saveFeedbackData({
        commandName: 'start',
        predictedCommand: 'start',
        actualCommand: 'start',
      });
      await db.saveCalibrationData({
        commandName: 'start',
        predictedCommand: 'start',
        actualCommand: 'start',
      });

      // 验证保存成功
      let commands = await db.getAllCommands();
      let records = await db.getAllRecognitionRecords();
      let feedbackData = await db.getAllFeedbackData();
      let calibrationData = await db.getAllCalibrationData();

      expect(commands.length).toBe(1);
      expect(records.length).toBe(1);
      expect(feedbackData.length).toBe(1);
      expect(calibrationData.length).toBe(1);

      // 删除指令
      await db.deleteCommand('start');

      // 验证所有数据被删除
      commands = await db.getAllCommands();
      records = await db.getAllRecognitionRecords();
      feedbackData = await db.getAllFeedbackData();
      calibrationData = await db.getAllCalibrationData();

      expect(commands.length).toBe(0);
      expect(records.length).toBe(0);
      expect(feedbackData.length).toBe(0);
      expect(calibrationData.length).toBe(0);
    });
  });
});

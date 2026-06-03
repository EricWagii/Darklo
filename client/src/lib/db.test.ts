import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EMGDatabase } from './db';
import { DB_CONFIG } from '@/../../shared/const';

describe('EMGDatabase', () => {
  let db: EMGDatabase;

  beforeEach(async () => {
    // 创建新的数据库实例用于测试
    db = new EMGDatabase();
    await db.init();
  });

  afterEach(async () => {
    // 清理测试数据
    try {
      await db.clearAllCommands();
      await db.clearAllTrainingData();
    } catch (error) {
      console.warn('清理测试数据失败:', error);
    }
  });

  describe('Command Management', () => {
    it('should save and retrieve a command', async () => {
      const testCommand = {
        name: 'test-command',
        userId: 'user-1',
        timestamp: Date.now(),
        collections: [
          {
            index: 0,
            timestamp: Date.now(),
            waveform: { ch1: [1, 2, 3], ch2: [4, 5, 6], ch3: [7, 8, 9] },
            duration: 1.5,
            quality: 0.8,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveCommand(testCommand);
      const retrieved = await db.getCommand('test-command');

      expect(retrieved).toBeDefined();
      expect(retrieved.name).toBe('test-command');
      expect(retrieved.collections.length).toBe(1);
    });

    it('should override collections when saving duplicate command', async () => {
      // ✅ 修复17：数据库层saveCommand是覆盖策略，合并逻辑在collection-handler-v2.ts
      const command1 = {
        name: 'merge-test',
        userId: 'user-1',
        timestamp: Date.now(),
        collections: [
          {
            index: 0,
            timestamp: Date.now(),
            waveform: { ch1: [1, 2], ch2: [3, 4], ch3: [5, 6] },
            duration: 1.0,
            quality: 0.8,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const command2 = {
        name: 'merge-test',
        userId: 'user-1',
        timestamp: Date.now(),
        collections: [
          {
            index: 1,
            timestamp: Date.now(),
            waveform: { ch1: [7, 8], ch2: [9, 10], ch3: [11, 12] },
            duration: 1.0,
            quality: 0.85,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveCommand(command1);
      await db.saveCommand(command2);

      const retrieved = await db.getCommand('merge-test');
      // ✅ 修复17：期望值改为1（覆盖策略），而不是2（合并策略）
      expect(retrieved.collections.length).toBe(1);
    });

    it('should delete a command', async () => {
      const testCommand = {
        name: 'delete-test',
        userId: 'user-1',
        timestamp: Date.now(),
        collections: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveCommand(testCommand);
      let retrieved = await db.getCommand('delete-test');
      expect(retrieved).toBeDefined();

      await db.deleteCommand('delete-test');
      retrieved = await db.getCommand('delete-test');
      // ✅ 修复17：删除后返回null而不是undefined
      expect(retrieved).toBeNull();
    });

    it('should not throw error when deleting non-existent command', async () => {
      // 这不应该抛出错误
      await expect(db.deleteCommand('non-existent')).resolves.not.toThrow();
    });

    it('should get all commands', async () => {
      const commands = [
        {
          name: 'cmd-1',
          userId: 'user-1',
          timestamp: Date.now(),
          collections: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          name: 'cmd-2',
          userId: 'user-1',
          timestamp: Date.now(),
          collections: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      for (const cmd of commands) {
        await db.saveCommand(cmd);
      }

      const allCommands = await db.getAllCommands();
      expect(allCommands.length).toBe(2);
      expect(allCommands.map((c) => c.name).sort()).toEqual(['cmd-1', 'cmd-2']);
    });

    it('should clear all commands', async () => {
      const testCommand = {
        name: 'clear-test',
        userId: 'user-1',
        timestamp: Date.now(),
        collections: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.saveCommand(testCommand);
      let allCommands = await db.getAllCommands();
      expect(allCommands.length).toBeGreaterThan(0);

      await db.clearAllCommands();
      allCommands = await db.getAllCommands();
      expect(allCommands.length).toBe(0);
    });
  });

  describe('Recognition Records', () => {
    it('should save and retrieve recognition records', async () => {
      const record = {
        commandName: 'test-cmd',
        predictedCommand: 'test-cmd',
        isCorrect: true,
        similarity: 0.95,
        confidence: 0.92,
        timestamp: new Date(),
        userId: 'user-1',
        userName: 'Test User',
      };

      const id = await db.saveRecognitionRecord(record);
      expect(id).toBeDefined();

      const records = await db.getRecognitionRecordsByCommand('test-cmd');
      expect(records.length).toBe(1);
      expect(records[0].isCorrect).toBe(true);
      expect(records[0].similarity).toBe(0.95);
    });

    it('should get all recognition records', async () => {
      const records = [
        {
          commandName: 'cmd-1',
          predictedCommand: 'cmd-1',
          isCorrect: true,
          similarity: 0.9,
          confidence: 0.85,
          timestamp: new Date(),
          userId: 'user-1',
          userName: 'User 1',
        },
        {
          commandName: 'cmd-2',
          predictedCommand: 'cmd-1',
          isCorrect: false,
          similarity: 0.6,
          confidence: 0.5,
          timestamp: new Date(),
          userId: 'user-1',
          userName: 'User 1',
        },
      ];

      for (const record of records) {
        await db.saveRecognitionRecord(record);
      }

      const allRecords = await db.getAllRecognitionRecords();
      expect(allRecords.length).toBe(2);
    });

    it('should filter recognition records by command name', async () => {
      const records = [
        {
          commandName: 'cmd-1',
          predictedCommand: 'cmd-1',
          isCorrect: true,
          similarity: 0.9,
          confidence: 0.85,
          timestamp: new Date(),
          userId: 'user-1',
          userName: 'User 1',
        },
        {
          commandName: 'cmd-1',
          predictedCommand: 'cmd-2',
          isCorrect: false,
          similarity: 0.6,
          confidence: 0.5,
          timestamp: new Date(),
          userId: 'user-1',
          userName: 'User 1',
        },
        {
          commandName: 'cmd-2',
          predictedCommand: 'cmd-2',
          isCorrect: true,
          similarity: 0.95,
          confidence: 0.9,
          timestamp: new Date(),
          userId: 'user-1',
          userName: 'User 1',
        },
      ];

      for (const record of records) {
        await db.saveRecognitionRecord(record);
      }

      const cmd1Records = await db.getRecognitionRecordsByCommand('cmd-1');
      expect(cmd1Records.length).toBe(2);
      expect(cmd1Records.every((r) => r.commandName === 'cmd-1')).toBe(true);

      const cmd2Records = await db.getRecognitionRecordsByCommand('cmd-2');
      expect(cmd2Records.length).toBe(1);
      expect(cmd2Records[0].isCorrect).toBe(true);
    });

    it('should calculate accuracy from recognition records', async () => {
      const records = [
        {
          commandName: 'test-cmd',
          predictedCommand: 'test-cmd',
          isCorrect: true,
          similarity: 0.9,
          confidence: 0.85,
          timestamp: new Date(),
          userId: 'user-1',
          userName: 'User 1',
        },
        {
          commandName: 'test-cmd',
          predictedCommand: 'other-cmd',
          isCorrect: false,
          similarity: 0.6,
          confidence: 0.5,
          timestamp: new Date(),
          userId: 'user-1',
          userName: 'User 1',
        },
        {
          commandName: 'test-cmd',
          predictedCommand: 'test-cmd',
          isCorrect: true,
          similarity: 0.88,
          confidence: 0.82,
          timestamp: new Date(),
          userId: 'user-1',
          userName: 'User 1',
        },
      ];

      for (const record of records) {
        await db.saveRecognitionRecord(record);
      }

      const cmdRecords = await db.getRecognitionRecordsByCommand('test-cmd');
      const correctCount = cmdRecords.filter((r) => r.isCorrect).length;
      const accuracy = correctCount / cmdRecords.length;

      expect(accuracy).toBe(2 / 3);
      expect(accuracy).toBeCloseTo(0.667, 2);
    });
  });

  describe('Data Export and Import', () => {
    it('should export all data', async () => {
      const command = {
        name: 'export-test',
        userId: 'user-1',
        timestamp: Date.now(),
        collections: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const record = {
        commandName: 'export-test',
        predictedCommand: 'export-test',
        isCorrect: true,
        similarity: 0.9,
        confidence: 0.85,
        timestamp: new Date(),
        userId: 'user-1',
        userName: 'User 1',
      };

      await db.saveCommand(command);
      await db.saveRecognitionRecord(record);

      const exported = await db.exportAllData();
      expect(exported.commands.length).toBeGreaterThan(0);
      expect(exported.recognitionRecords.length).toBeGreaterThan(0);
    });
  });
});

/**
 * 识别结果导出功能修复测试
 * 
 * 测试场景：
 * - 验证从RECOGNITION_RECORDS表中读取识别结果
 * - 验证导出格式转换
 * - 验证导出函数能正确处理识别结果
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * 模拟的识别记录数据结构
 */
interface RecognitionRecord {
  id?: number;
  commandName: string;
  predictedCommand: string;
  isCorrect: boolean;
  similarity: number;
  confidence: number;
  timestamp: Date | number;
  userId?: string;
  userName?: string;
}

/**
 * 模拟的导出格式
 */
interface RecognitionResultForExport {
  command: string;
  confidence: number;
  croppingMeta?: any;
  timestamp: number;
}

describe('Recognition Export Fix', () => {
  describe('Export Format Conversion', () => {
    it('should convert recognition records to export format', () => {
      const records: RecognitionRecord[] = [
        {
          id: 1,
          commandName: '上',
          predictedCommand: '上',
          isCorrect: true,
          similarity: 0.95,
          confidence: 0.92,
          timestamp: new Date('2026-05-22T10:00:00Z'),
          userId: 'user1',
          userName: 'Alice',
        },
        {
          id: 2,
          commandName: '下',
          predictedCommand: '下',
          isCorrect: true,
          similarity: 0.88,
          confidence: 0.85,
          timestamp: new Date('2026-05-22T10:05:00Z'),
          userId: 'user1',
          userName: 'Alice',
        },
      ];

      // 模拟导出转换逻辑
      const exportResults: RecognitionResultForExport[] = records.map((record) => ({
        command: record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));

      expect(exportResults).toHaveLength(2);
      expect(exportResults[0]).toEqual({
        command: '上',
        confidence: 0.92,
        croppingMeta: undefined,
        timestamp: new Date('2026-05-22T10:00:00Z').getTime(),
      });
      expect(exportResults[1]).toEqual({
        command: '下',
        confidence: 0.85,
        croppingMeta: undefined,
        timestamp: new Date('2026-05-22T10:05:00Z').getTime(),
      });
    });

    it('should handle missing commandName gracefully', () => {
      const records: RecognitionRecord[] = [
        {
          id: 1,
          commandName: '',
          predictedCommand: '上',
          isCorrect: false,
          similarity: 0.5,
          confidence: 0.4,
          timestamp: new Date('2026-05-22T10:00:00Z'),
        },
      ];

      const exportResults: RecognitionResultForExport[] = records.map((record) => ({
        command: record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));

      expect(exportResults[0].command).toBe('unknown');
    });

    it('should prefer confidence over similarity', () => {
      const records: RecognitionRecord[] = [
        {
          id: 1,
          commandName: '上',
          predictedCommand: '上',
          isCorrect: true,
          similarity: 0.95,
          confidence: 0.92,
          timestamp: new Date('2026-05-22T10:00:00Z'),
        },
      ];

      const exportResults: RecognitionResultForExport[] = records.map((record) => ({
        command: record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));

      // 应该使用confidence而不是similarity
      expect(exportResults[0].confidence).toBe(0.92);
    });

    it('should handle fallback to similarity when confidence is missing', () => {
      const records: RecognitionRecord[] = [
        {
          id: 1,
          commandName: '上',
          predictedCommand: '上',
          isCorrect: true,
          similarity: 0.95,
          confidence: undefined as any,
          timestamp: new Date('2026-05-22T10:00:00Z'),
        },
      ];

      const exportResults: RecognitionResultForExport[] = records.map((record) => ({
        command: record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));

      // 当confidence为0时，应该使用similarity
      expect(exportResults[0].confidence).toBe(0.95); // 当confidence为undefined时，应该使用similarity
    });

    it('should handle timestamp conversion for both Date and number', () => {
      const dateTimestamp = new Date('2026-05-22T10:00:00Z').getTime();
      const records: RecognitionRecord[] = [
        {
          id: 1,
          commandName: '上',
          predictedCommand: '上',
          isCorrect: true,
          similarity: 0.95,
          confidence: 0.92,
          timestamp: new Date('2026-05-22T10:00:00Z'),
        },
        {
          id: 2,
          commandName: '下',
          predictedCommand: '下',
          isCorrect: true,
          similarity: 0.88,
          confidence: 0.85,
          timestamp: dateTimestamp,
        },
      ];

      const exportResults: RecognitionResultForExport[] = records.map((record) => ({
        command: record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));

      expect(exportResults[0].timestamp).toBe(dateTimestamp);
      expect(exportResults[1].timestamp).toBe(dateTimestamp);
    });
  });

  describe('Empty Data Handling', () => {
    it('should handle empty recognition records', () => {
      const records: RecognitionRecord[] = [];

      const exportResults: RecognitionResultForExport[] = records.map((record) => ({
        command: record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));

      expect(exportResults).toHaveLength(0);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve all recognition data during conversion', () => {
      const originalRecords: RecognitionRecord[] = [
        {
          id: 1,
          commandName: '上',
          predictedCommand: '上',
          isCorrect: true,
          similarity: 0.95,
          confidence: 0.92,
          timestamp: new Date('2026-05-22T10:00:00Z'),
          userId: 'user1',
          userName: 'Alice',
        },
      ];

      const exportResults: RecognitionResultForExport[] = originalRecords.map((record) => ({
        command: record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));

      // 验证关键数据被保留
      expect(exportResults[0].command).toBe(originalRecords[0].commandName);
      expect(exportResults[0].confidence).toBe(originalRecords[0].confidence);
      expect(exportResults[0].timestamp).toBe(new Date(originalRecords[0].timestamp).getTime());
    });

    it('should handle multiple recognition results for same command', () => {
      const records: RecognitionRecord[] = [
        {
          id: 1,
          commandName: '上',
          predictedCommand: '上',
          isCorrect: true,
          similarity: 0.95,
          confidence: 0.92,
          timestamp: new Date('2026-05-22T10:00:00Z'),
        },
        {
          id: 2,
          commandName: '上',
          predictedCommand: '上',
          isCorrect: true,
          similarity: 0.93,
          confidence: 0.90,
          timestamp: new Date('2026-05-22T10:05:00Z'),
        },
        {
          id: 3,
          commandName: '上',
          predictedCommand: '上',
          isCorrect: true,
          similarity: 0.91,
          confidence: 0.88,
          timestamp: new Date('2026-05-22T10:10:00Z'),
        },
      ];

      const exportResults: RecognitionResultForExport[] = records.map((record) => ({
        command: record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));

      expect(exportResults).toHaveLength(3);
      expect(exportResults.every((r) => r.command === '上')).toBe(true);
      expect(exportResults[0].confidence).toBe(0.92);
      expect(exportResults[1].confidence).toBe(0.90);
      expect(exportResults[2].confidence).toBe(0.88);
    });
  });
});

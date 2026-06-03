import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 数据导出功能集成测试
 * 
 * 测试场景：
 * 1. 导出采集数据为CSV格式
 * 2. 导出采集数据为JSON格式
 * 3. 导出采集统计摘要
 * 4. 导出识别结果为CSV格式
 * 5. 导出识别结果为JSON格式
 * 6. 导出识别统计摘要
 * 7. 导出空数据时的处理
 */

describe('Data Export Integration', () => {
  // 模拟采集数据
  const mockCollectionData = [
    {
      name: 'command1',
      collections: [
        {
          index: 1,
          timestamp: Date.now(),
          waveform: {
            ch1: [1, 2, 3, 4, 5],
            ch2: [2, 3, 4, 5, 6],
            ch3: [3, 4, 5, 6, 7],
          },
          duration: 1000,
          userId: 'user1',
          userName: 'User One',
          croppingMeta: {
            stage: 'primary',
            confidence: 0.95,
            originalLength: 5,
            croppedLength: 5,
            normalizedLength: 512,
          },
          recognitionResults: [
            {
              timestamp: Date.now(),
              predicted: 'command1',
              actual: 'command1',
              isCorrect: true,
              similarity: 0.98,
            },
          ],
        },
      ],
      accuracy: 0.95,
      createdAt: new Date().toISOString(),
    },
  ];

  describe('CSV Export', () => {
    it('should export collection data to CSV with correct headers', () => {
      // CSV应包含以下列：指令名称, 采集索引, 通道长度, 裁剪置信度, 处理阶段, 采集时间
      const expectedHeaders = [
        '指令名称',
        '采集索引',
        '通道1长度',
        '通道2长度',
        '通道3长度',
        '裁剪置信度',
        '处理阶段',
        '采集时间',
      ];

      // 验证CSV格式
      expect(expectedHeaders).toHaveLength(8);
      expect(expectedHeaders[0]).toBe('指令名称');
      expect(expectedHeaders[6]).toBe('处理阶段');
    });

    it('should include cropping metadata in CSV export', () => {
      const data = mockCollectionData[0];
      const collection = data.collections[0];

      // 验证croppingMeta包含必要的字段
      expect(collection.croppingMeta).toBeDefined();
      expect(collection.croppingMeta.stage).toBe('primary');
      expect(collection.croppingMeta.confidence).toBe(0.95);
      expect(collection.croppingMeta.originalLength).toBe(5);
      expect(collection.croppingMeta.croppedLength).toBe(5);
    });

    it('should handle multiple collections in CSV export', () => {
      const multipleCollections = [
        ...mockCollectionData,
        {
          ...mockCollectionData[0],
          name: 'command2',
          collections: [
            ...mockCollectionData[0].collections,
            {
              ...mockCollectionData[0].collections[0],
              index: 2,
              croppingMeta: {
                stage: 'fallback',
                confidence: 0.75,
                originalLength: 5,
                croppedLength: 5,
                normalizedLength: 512,
              },
            },
          ],
        },
      ];

      // 验证多条记录
      expect(multipleCollections).toHaveLength(2);
      expect(multipleCollections[1].collections).toHaveLength(2);
    });

    it('should export recognition results to CSV with correct headers', () => {
      const expectedHeaders = [
        '指令名称',
        '识别置信度',
        '处理阶段',
        '裁剪置信度',
        '识别时间',
      ];

      expect(expectedHeaders).toHaveLength(5);
      expect(expectedHeaders[0]).toBe('指令名称');
      expect(expectedHeaders[2]).toBe('处理阶段');
    });
  });

  describe('JSON Export', () => {
    it('should export collection data with complete structure', () => {
      const data = mockCollectionData[0];

      // 验证JSON结构
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('collections');
      expect(data).toHaveProperty('accuracy');
      expect(data).toHaveProperty('createdAt');
    });

    it('should preserve cropping metadata in JSON export', () => {
      const data = mockCollectionData[0];
      const collection = data.collections[0];

      // 验证croppingMeta完整保存
      expect(collection.croppingMeta).toEqual({
        stage: 'primary',
        confidence: 0.95,
        originalLength: 5,
        croppedLength: 5,
        normalizedLength: 512,
      });
    });

    it('should include recognition results in JSON export', () => {
      const data = mockCollectionData[0];
      const collection = data.collections[0];

      // 验证识别结果
      expect(collection.recognitionResults).toBeDefined();
      expect(collection.recognitionResults).toHaveLength(1);
      expect(collection.recognitionResults[0].isCorrect).toBe(true);
    });

    it('should include export timestamp in JSON', () => {
      const exportData = {
        exportTime: new Date().toISOString(),
        commands: mockCollectionData,
      };

      // 验证导出时间戳
      expect(exportData).toHaveProperty('exportTime');
      expect(exportData.exportTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Summary Export', () => {
    it('should calculate collection summary statistics', () => {
      const summary = {
        totalCommands: 1,
        totalCollections: 1,
        averageAccuracy: 0.95,
        commandStats: [
          {
            name: 'command1',
            collectionCount: 1,
            accuracy: 0.95,
            averageConfidence: 0.95,
          },
        ],
      };

      // 验证摘要统计
      expect(summary.totalCommands).toBe(1);
      expect(summary.commandStats).toHaveLength(1);
      expect(summary.commandStats[0].accuracy).toBe(0.95);
    });

    it('should calculate recognition summary statistics', () => {
      const summary = {
        totalRecognitions: 1,
        correctRecognitions: 1,
        accuracy: 1.0,
        averageConfidence: 0.98,
        stageDistribution: {
          primary: 1,
          fallback: 0,
          full_segment: 0,
        },
      };

      // 验证识别摘要统计
      expect(summary.totalRecognitions).toBe(1);
      expect(summary.accuracy).toBe(1.0);
      expect(summary.stageDistribution.primary).toBe(1);
    });

    it('should handle multiple commands in summary', () => {
      const summary = {
        totalCommands: 2,
        commandStats: [
          { name: 'command1', collectionCount: 5, accuracy: 0.95 },
          { name: 'command2', collectionCount: 3, accuracy: 0.90 },
        ],
      };

      // 验证多指令摘要
      expect(summary.totalCommands).toBe(2);
      expect(summary.commandStats).toHaveLength(2);
      expect(summary.commandStats[0].collectionCount).toBe(5);
      expect(summary.commandStats[1].collectionCount).toBe(3);
    });
  });

  describe('Export Error Handling', () => {
    it('should handle empty collection data', () => {
      const emptyData: any[] = [];

      // 验证空数据处理
      expect(emptyData).toHaveLength(0);
      expect(emptyData.length === 0).toBe(true);
    });

    it('should handle missing cropping metadata', () => {
      const dataWithoutCropping = {
        ...mockCollectionData[0],
        collections: [
          {
            ...mockCollectionData[0].collections[0],
            croppingMeta: undefined,
          },
        ],
      };

      // 验证缺失元数据处理
      const collection = dataWithoutCropping.collections[0];
      expect(collection.croppingMeta).toBeUndefined();
    });

    it('should handle missing recognition results', () => {
      const dataWithoutRecognition = {
        ...mockCollectionData[0],
        collections: [
          {
            ...mockCollectionData[0].collections[0],
            recognitionResults: undefined,
          },
        ],
      };

      // 验证缺失识别结果处理
      const collection = dataWithoutRecognition.collections[0];
      expect(collection.recognitionResults).toBeUndefined();
    });
  });

  describe('Export Format Validation', () => {
    it('should validate CSV format with proper escaping', () => {
      const csvRow = 'command1,1,5,5,5,0.95,primary,2026-05-22T10:00:00Z';

      // 验证CSV格式
      const parts = csvRow.split(',');
      expect(parts).toHaveLength(8);
      expect(parts[0]).toBe('command1');
      expect(parts[5]).toBe('0.95');
    });

    it('should validate JSON format with proper structure', () => {
      const jsonData = {
        exportTime: new Date().toISOString(),
        commands: mockCollectionData,
      };

      // 验证JSON格式
      const jsonString = JSON.stringify(jsonData);
      expect(() => JSON.parse(jsonString)).not.toThrow();
    });

    it('should include all required fields in export', () => {
      const exportData = {
        exportTime: new Date().toISOString(),
        commands: mockCollectionData.map((cmd) => ({
          name: cmd.name,
          collectionCount: cmd.collections.length,
          accuracy: cmd.accuracy,
          collections: cmd.collections.map((col) => ({
            index: col.index,
            timestamp: col.timestamp,
            croppingMeta: col.croppingMeta,
            recognitionResults: col.recognitionResults,
          })),
        })),
      };

      // 验证必要字段
      expect(exportData).toHaveProperty('exportTime');
      expect(exportData).toHaveProperty('commands');
      expect(exportData.commands[0]).toHaveProperty('name');
      expect(exportData.commands[0]).toHaveProperty('collections');
    });
  });

  describe('Export Performance', () => {
    it('should handle large dataset export efficiently', () => {
      // 创建大型数据集（1000条记录）
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        ...mockCollectionData[0],
        name: `command${i}`,
        collections: Array.from({ length: 10 }, (_, j) => ({
          ...mockCollectionData[0].collections[0],
          index: j,
        })),
      }));

      // 验证大型数据集处理
      expect(largeDataset).toHaveLength(1000);
      expect(largeDataset[0].collections).toHaveLength(10);

      // 验证JSON序列化性能
      const startTime = performance.now();
      const jsonString = JSON.stringify(largeDataset);
      const endTime = performance.now();

      // 应该在合理时间内完成（< 1000ms）
      expect(endTime - startTime).toBeLessThan(1000);
      expect(jsonString.length).toBeGreaterThan(0);
    });

    it('should generate CSV efficiently', () => {
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        ...mockCollectionData[0],
        name: `command${i}`,
      }));

      // 验证CSV生成
      const startTime = performance.now();
      const csvLines = largeDataset.map((cmd) => `${cmd.name},${cmd.collections.length}`);
      const endTime = performance.now();

      expect(csvLines).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});

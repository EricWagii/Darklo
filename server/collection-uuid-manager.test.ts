import { describe, it, expect } from 'vitest';
import {
  generateUUID,
  addUUIDToCollection,
  addUUIDsToCollections,
  removeCollectionByUUID,
  removeCollectionsByUUIDs,
  getCollectionUUID,
  hasValidUUID,
  ensureAllCollectionsHaveUUIDs,
  getCollectionInfo,
  createCollectionBackup,
  restoreCollectionFromBackup,
  isValidUUIDFormat,
  getCollectionByUUID,
  getCollectionsByUUIDs,
  CollectionWithUUID
} from '../client/src/lib/collection-uuid-manager';

describe('采集记录UUID管理器', () => {
  describe('UUID生成', () => {
    it('应该生成有效的UUID', () => {
      const uuid = generateUUID();
      
      expect(uuid).toBeDefined();
      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBeGreaterThan(0);
    });

    it('生成的UUID应该是唯一的', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      
      expect(uuid1).not.toBe(uuid2);
    });

    it('生成的UUID应该符合UUID v4格式', () => {
      const uuid = generateUUID();
      
      expect(isValidUUIDFormat(uuid)).toBe(true);
    });
  });

  describe('添加UUID到采集记录', () => {
    it('应该为采集记录添加UUID', () => {
      const collection = {
        timestamp: Date.now(),
        ch1: [1, 2, 3],
        ch2: [4, 5, 6],
        ch3: [7, 8, 9]
      };

      const withUUID = addUUIDToCollection(collection);

      expect(withUUID.id).toBeDefined();
      expect(isValidUUIDFormat(withUUID.id)).toBe(true);
    });

    it('如果已有UUID则保留', () => {
      const collection = {
        id: 'test-uuid-123',
        timestamp: Date.now(),
        ch1: [1, 2, 3],
        ch2: [4, 5, 6],
        ch3: [7, 8, 9]
      };

      const withUUID = addUUIDToCollection(collection);

      expect(withUUID.id).toBe('test-uuid-123');
    });

    it('应该为多个采集记录添加UUID', () => {
      const collections = [
        { timestamp: Date.now(), ch1: [1], ch2: [2], ch3: [3] },
        { timestamp: Date.now(), ch1: [4], ch2: [5], ch3: [6] },
        { timestamp: Date.now(), ch1: [7], ch2: [8], ch3: [9] }
      ];

      const withUUIDs = addUUIDsToCollections(collections);

      expect(withUUIDs).toHaveLength(3);
      withUUIDs.forEach(col => {
        expect(col.id).toBeDefined();
        expect(isValidUUIDFormat(col.id)).toBe(true);
      });
    });
  });

  describe('删除采集记录', () => {
    it('应该按UUID删除单条记录', () => {
      const collections: CollectionWithUUID[] = [
        { id: 'uuid-1', timestamp: Date.now(), ch1: [1], ch2: [2], ch3: [3] },
        { id: 'uuid-2', timestamp: Date.now(), ch1: [4], ch2: [5], ch3: [6] },
        { id: 'uuid-3', timestamp: Date.now(), ch1: [7], ch2: [8], ch3: [9] }
      ];

      const result = removeCollectionByUUID(collections, 'uuid-2');

      expect(result).toHaveLength(2);
      expect(result.some(col => col.id === 'uuid-2')).toBe(false);
      expect(result.some(col => col.id === 'uuid-1')).toBe(true);
      expect(result.some(col => col.id === 'uuid-3')).toBe(true);
    });

    it('应该按多个UUID删除多条记录', () => {
      const collections: CollectionWithUUID[] = [
        { id: 'uuid-1', timestamp: Date.now(), ch1: [1], ch2: [2], ch3: [3] },
        { id: 'uuid-2', timestamp: Date.now(), ch1: [4], ch2: [5], ch3: [6] },
        { id: 'uuid-3', timestamp: Date.now(), ch1: [7], ch2: [8], ch3: [9] }
      ];

      const result = removeCollectionsByUUIDs(collections, ['uuid-1', 'uuid-3']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('uuid-2');
    });

    it('删除不存在的UUID应该不改变列表', () => {
      const collections: CollectionWithUUID[] = [
        { id: 'uuid-1', timestamp: Date.now(), ch1: [1], ch2: [2], ch3: [3] },
        { id: 'uuid-2', timestamp: Date.now(), ch1: [4], ch2: [5], ch3: [6] }
      ];

      const result = removeCollectionByUUID(collections, 'uuid-999');

      expect(result).toHaveLength(2);
    });
  });

  describe('UUID验证', () => {
    it('应该检查UUID的有效性', () => {
      const collectionWithUUID = {
        id: 'uuid-123',
        timestamp: Date.now(),
        ch1: [1, 2, 3]
      };

      expect(hasValidUUID(collectionWithUUID)).toBe(true);
    });

    it('没有UUID的记录应该返回false', () => {
      const collectionWithoutUUID = {
        timestamp: Date.now(),
        ch1: [1, 2, 3]
      };

      expect(hasValidUUID(collectionWithoutUUID)).toBe(false);
    });

    it('应该验证UUID格式', () => {
      const validUUID = generateUUID();
      const invalidUUID = 'not-a-uuid';

      expect(isValidUUIDFormat(validUUID)).toBe(true);
      expect(isValidUUIDFormat(invalidUUID)).toBe(false);
    });
  });

  describe('确保所有记录都有UUID', () => {
    it('应该为缺少UUID的记录添加UUID', () => {
      const collections = [
        { id: 'uuid-1', timestamp: Date.now(), ch1: [1], ch2: [2], ch3: [3] },
        { timestamp: Date.now(), ch1: [4], ch2: [5], ch3: [6] },
        { timestamp: Date.now(), ch1: [7], ch2: [8], ch3: [9] }
      ];

      const result = ensureAllCollectionsHaveUUIDs(collections);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('uuid-1');
      expect(result[1].id).toBeDefined();
      expect(result[2].id).toBeDefined();
      expect(result[1].id.length).toBeGreaterThan(0);
      expect(result[2].id.length).toBeGreaterThan(0);
    });
  });

  describe('获取采集记录信息', () => {
    it('应该返回采集记录的详细信息', () => {
      const collection: CollectionWithUUID = {
        id: 'uuid-123',
        timestamp: Date.now(),
        ch1: [1, 2, 3, 4, 5],
        ch2: [6, 7, 8, 9, 10],
        ch3: [11, 12, 13, 14, 15],
        userName: 'Test User'
      };

      const info = getCollectionInfo(collection);

      expect(info.uuid).toBe('uuid-123');
      expect(info.user).toBe('Test User');
      expect(info.waveformLength).toBe(5);
      expect(info.timestamp).toBeDefined();
    });
  });

  describe('采集记录备份和恢复', () => {
    it('应该创建采集记录的备份', () => {
      const collection: CollectionWithUUID = {
        id: 'uuid-123',
        timestamp: Date.now(),
        ch1: [1, 2, 3],
        ch2: [4, 5, 6],
        ch3: [7, 8, 9],
        userName: 'Test User'
      };

      const backup = createCollectionBackup(collection);

      expect(backup).toBeDefined();
      expect(typeof backup).toBe('string');
      
      const parsed = JSON.parse(backup);
      expect(parsed.id).toBe('uuid-123');
      expect(parsed.userName).toBe('Test User');
    });

    it('应该从备份恢复采集记录', () => {
      const original: CollectionWithUUID = {
        id: 'uuid-123',
        timestamp: Date.now(),
        ch1: [1, 2, 3],
        ch2: [4, 5, 6],
        ch3: [7, 8, 9],
        userName: 'Test User'
      };

      const backup = createCollectionBackup(original);
      const restored = restoreCollectionFromBackup(backup, original);

      expect(restored.id).toBe(original.id);
      expect(restored.userName).toBe(original.userName);
    });
  });

  describe('查询采集记录', () => {
    it('应该按UUID查询单条记录', () => {
      const collections: CollectionWithUUID[] = [
        { id: 'uuid-1', timestamp: Date.now(), ch1: [1], ch2: [2], ch3: [3] },
        { id: 'uuid-2', timestamp: Date.now(), ch1: [4], ch2: [5], ch3: [6] },
        { id: 'uuid-3', timestamp: Date.now(), ch1: [7], ch2: [8], ch3: [9] }
      ];

      const result = getCollectionByUUID(collections, 'uuid-2');

      expect(result).toBeDefined();
      expect(result?.id).toBe('uuid-2');
    });

    it('应该按多个UUID查询多条记录', () => {
      const collections: CollectionWithUUID[] = [
        { id: 'uuid-1', timestamp: Date.now(), ch1: [1], ch2: [2], ch3: [3] },
        { id: 'uuid-2', timestamp: Date.now(), ch1: [4], ch2: [5], ch3: [6] },
        { id: 'uuid-3', timestamp: Date.now(), ch1: [7], ch2: [8], ch3: [9] }
      ];

      const result = getCollectionsByUUIDs(collections, ['uuid-1', 'uuid-3']);

      expect(result).toHaveLength(2);
      expect(result.some(col => col.id === 'uuid-1')).toBe(true);
      expect(result.some(col => col.id === 'uuid-3')).toBe(true);
    });

    it('查询不存在的UUID应该返回undefined', () => {
      const collections: CollectionWithUUID[] = [
        { id: 'uuid-1', timestamp: Date.now(), ch1: [1], ch2: [2], ch3: [3] }
      ];

      const result = getCollectionByUUID(collections, 'uuid-999');

      expect(result).toBeUndefined();
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  assignUUIDToCollection,
  assignUUIDsToCollections,
  isValidUUID,
  removeCollectionByUUID,
  removeCollectionsByUUIDs,
  findCollectionByUUID,
  updateCollectionStatus,
  getCollectionStats,
  CollectionBackupManager,
  convertToStorageFormat,
  convertFromStorageFormat,
  CollectionWithUUID
} from '../client/src/lib/uuid-based-collection-manager';

describe('UUID-Based Collection Manager', () => {
  let mockCollection: any;
  let mockCollections: CollectionWithUUID[];

  beforeEach(() => {
    mockCollection = {
      timestamp: new Date(),
      waveform: {
        ch1: [1, 2, 3],
        ch2: [4, 5, 6],
        ch3: [7, 8, 9]
      },
      userId: 'user1',
      userName: 'Test User'
    };

    mockCollections = [
      assignUUIDToCollection(mockCollection, 'command1'),
      assignUUIDToCollection(mockCollection, 'command1'),
      assignUUIDToCollection(mockCollection, 'command1')
    ];
  });

  describe('UUID Assignment', () => {
    it('should assign UUID to a single collection', () => {
      const result = assignUUIDToCollection(mockCollection, 'test_command');
      expect(result.uuid).toBeDefined();
      expect(isValidUUID(result.uuid)).toBe(true);
      expect(result.commandName).toBe('test_command');
    });

    it('should assign UUIDs to multiple collections', () => {
      const collections = [mockCollection, mockCollection, mockCollection];
      const results = assignUUIDsToCollections(collections, 'test_command');
      
      expect(results).toHaveLength(3);
      expect(new Set(results.map(r => r.uuid)).size).toBe(3); // All UUIDs should be unique
      results.forEach(result => {
        expect(isValidUUID(result.uuid)).toBe(true);
      });
    });

    it('should preserve collection data when assigning UUID', () => {
      const result = assignUUIDToCollection(mockCollection, 'test_command');
      expect(result.waveform).toEqual(mockCollection.waveform);
      expect(result.userId).toBe(mockCollection.userId);
      expect(result.userName).toBe(mockCollection.userName);
    });
  });

  describe('UUID Validation', () => {
    it('should validate correct UUID format', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
      ];

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it('should reject invalid UUID formats', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400-e29b-41d4-a716-446655440000-extra',
        ''
      ];

      invalidUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    });
  });

  describe('Collection Removal', () => {
    it('should remove collection by UUID', () => {
      const uuidToRemove = mockCollections[0].uuid;
      const result = removeCollectionByUUID(mockCollections, uuidToRemove);
      
      expect(result).toHaveLength(2);
      expect(result.every(c => c.uuid !== uuidToRemove)).toBe(true);
    });

    it('should remove multiple collections by UUIDs', () => {
      const uuidsToRemove = [mockCollections[0].uuid, mockCollections[1].uuid];
      const result = removeCollectionsByUUIDs(mockCollections, uuidsToRemove);
      
      expect(result).toHaveLength(1);
      expect(result[0].uuid).toBe(mockCollections[2].uuid);
    });

    it('should throw error for invalid UUID format', () => {
      expect(() => {
        removeCollectionByUUID(mockCollections, 'invalid-uuid');
      }).toThrow();
    });
  });

  describe('Collection Finding', () => {
    it('should find collection by UUID', () => {
      const uuidToFind = mockCollections[0].uuid;
      const result = findCollectionByUUID(mockCollections, uuidToFind);
      
      expect(result).toBeDefined();
      expect(result?.uuid).toBe(uuidToFind);
    });

    it('should return undefined for non-existent UUID', () => {
      const result = findCollectionByUUID(mockCollections, '550e8400-e29b-41d4-a716-446655440000');
      expect(result).toBeUndefined();
    });
  });

  describe('Collection Status Update', () => {
    it('should update collection status', () => {
      const uuidToUpdate = mockCollections[0].uuid;
      const result = updateCollectionStatus(mockCollections, uuidToUpdate, 'anomaly');
      
      const updated = result.find(c => c.uuid === uuidToUpdate);
      expect(updated?.status).toBe('anomaly');
    });

    it('should not affect other collections when updating status', () => {
      const uuidToUpdate = mockCollections[0].uuid;
      const result = updateCollectionStatus(mockCollections, uuidToUpdate, 'degraded');
      
      expect(result[1].status).toBe('normal');
      expect(result[2].status).toBe('normal');
    });
  });

  describe('Collection Statistics', () => {
    it('should calculate collection statistics', () => {
      const collections: CollectionWithUUID[] = [
        { ...mockCollections[0], status: 'normal' },
        { ...mockCollections[1], status: 'anomaly' },
        { ...mockCollections[2], status: 'degraded' }
      ];

      const stats = getCollectionStats(collections);
      expect(stats.total).toBe(3);
      expect(stats.normal).toBe(1);
      expect(stats.anomaly).toBe(1);
      expect(stats.degraded).toBe(1);
    });

    it('should handle empty collections', () => {
      const stats = getCollectionStats([]);
      expect(stats.total).toBe(0);
      expect(stats.normal).toBe(0);
      expect(stats.anomaly).toBe(0);
      expect(stats.degraded).toBe(0);
    });
  });

  describe('Backup Management', () => {
    it('should create and restore backup', () => {
      const backup = new CollectionBackupManager();
      backup.createBackup(mockCollections, 'test backup');
      
      const restored = backup.restoreBackup();
      expect(restored).toEqual(mockCollections);
    });

    it('should maintain backup history', () => {
      const backup = new CollectionBackupManager();
      backup.createBackup(mockCollections, 'backup 1');
      backup.createBackup(mockCollections, 'backup 2');
      
      const history = backup.getBackupHistory();
      expect(history).toHaveLength(2);
      expect(history[0].reason).toBe('backup 1');
      expect(history[1].reason).toBe('backup 2');
    });

    it('should limit backup count', () => {
      const backup = new CollectionBackupManager();
      
      // Create 15 backups (more than the default limit of 10)
      for (let i = 0; i < 15; i++) {
        backup.createBackup(mockCollections, `backup ${i}`);
      }
      
      const history = backup.getBackupHistory();
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should clear all backups', () => {
      const backup = new CollectionBackupManager();
      backup.createBackup(mockCollections, 'backup 1');
      backup.createBackup(mockCollections, 'backup 2');
      
      backup.clearBackups();
      const history = backup.getBackupHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('Storage Format Conversion', () => {
    it('should convert to storage format', () => {
      const result = convertToStorageFormat(mockCollections);
      
      expect(result).toHaveLength(3);
      result.forEach((item, idx) => {
        expect(item.uuid).toBe(mockCollections[idx].uuid);
        expect(item.waveform).toEqual(mockCollections[idx].waveform);
      });
    });

    it('should convert from storage format', () => {
      const storageFormat = convertToStorageFormat(mockCollections);
      const result = convertFromStorageFormat(storageFormat);
      
      expect(result).toHaveLength(3);
      result.forEach((item, idx) => {
        expect(item.uuid).toBe(mockCollections[idx].uuid);
        expect(item.waveform).toEqual(mockCollections[idx].waveform);
      });
    });

    it('should handle missing UUIDs in storage format', () => {
      const storageFormat = [
        {
          timestamp: Date.now(),
          waveform: { ch1: [1], ch2: [2], ch3: [3] }
        }
      ];

      const result = convertFromStorageFormat(storageFormat);
      expect(result[0].uuid).toBeDefined();
      expect(isValidUUID(result[0].uuid)).toBe(true);
    });
  });
});

/**
 * 采集记录UUID管理器
 * 
 * 为每条采集记录分配唯一的UUID，支持按UUID删除单条记录
 */

/**
 * 采集记录扩展接口（包含UUID）
 */
export interface CollectionWithUUID {
  id: string;  // UUID
  timestamp: number;
  ch1: number[];
  ch2: number[];
  ch3: number[];
  userId?: string;
  userName?: string;
  // 其他字段...
  [key: string]: any;
}

/**
 * 生成UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 为采集记录添加UUID
 */
export function addUUIDToCollection(collection: any): CollectionWithUUID {
  return {
    ...collection,
    id: collection.id || generateUUID()
  };
}

/**
 * 为采集列表中的所有记录添加UUID
 */
export function addUUIDsToCollections(collections: any[]): CollectionWithUUID[] {
  return collections.map(col => addUUIDToCollection(col));
}

/**
 * 从采集列表中删除指定UUID的记录
 */
export function removeCollectionByUUID(
  collections: CollectionWithUUID[],
  uuid: string
): CollectionWithUUID[] {
  return collections.filter(col => col.id !== uuid);
}

/**
 * 从采集列表中删除多个UUID的记录
 */
export function removeCollectionsByUUIDs(
  collections: CollectionWithUUID[],
  uuids: string[]
): CollectionWithUUID[] {
  const uuidSet = new Set(uuids);
  return collections.filter(col => !uuidSet.has(col.id));
}

/**
 * 获取采集记录的UUID
 */
export function getCollectionUUID(collection: any): string {
  if (!collection.id) {
    collection.id = generateUUID();
  }
  return collection.id;
}

/**
 * 检查采集记录是否有有效的UUID
 */
export function hasValidUUID(collection: any): boolean {
  if (!collection || typeof collection !== 'object') return false;
  return !!(collection.id && typeof collection.id === 'string' && collection.id.length > 0);
}

/**
 * 确保所有采集记录都有有效的UUID
 */
export function ensureAllCollectionsHaveUUIDs(collections: any[]): CollectionWithUUID[] {
  return collections.map(col => {
    if (!hasValidUUID(col)) {
      col.id = generateUUID();
    }
    return col as CollectionWithUUID;
  });
}

/**
 * 获取采集记录的详细信息（用于显示）
 */
export function getCollectionInfo(collection: CollectionWithUUID): {
  uuid: string;
  timestamp: string;
  user: string;
  waveformLength: number;
} {
  return {
    uuid: collection.id,
    timestamp: new Date(collection.timestamp).toLocaleString(),
    user: collection.userName || 'Unknown',
    waveformLength: collection.ch1?.length || 0
  };
}

/**
 * 创建采集记录的备份（用于删除前的确认）
 */
export function createCollectionBackup(collection: CollectionWithUUID): string {
  return JSON.stringify({
    id: collection.id,
    timestamp: collection.timestamp,
    userName: collection.userName,
    waveformLength: collection.ch1?.length || 0
  });
}

/**
 * 恢复采集记录从备份
 */
export function restoreCollectionFromBackup(backup: string, originalCollection: CollectionWithUUID): CollectionWithUUID {
  try {
    const backupData = JSON.parse(backup);
    return {
      ...originalCollection,
      id: backupData.id,
      timestamp: backupData.timestamp,
      userName: backupData.userName
    };
  } catch (error) {
    console.error('Failed to restore collection from backup:', error);
    return originalCollection;
  }
}

/**
 * 验证UUID格式
 */
export function isValidUUIDFormat(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 获取采集列表中指定UUID的记录
 */
export function getCollectionByUUID(
  collections: CollectionWithUUID[],
  uuid: string
): CollectionWithUUID | undefined {
  return collections.find(col => col.id === uuid);
}

/**
 * 获取采集列表中指定UUIDs的记录
 */
export function getCollectionsByUUIDs(
  collections: CollectionWithUUID[],
  uuids: string[]
): CollectionWithUUID[] {
  const uuidSet = new Set(uuids);
  return collections.filter(col => uuidSet.has(col.id));
}

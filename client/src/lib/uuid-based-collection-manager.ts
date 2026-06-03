/**
 * 基于UUID的采集管理器 - 支持单条删除
 * 
 * 这个模块提供了一个新的数据结构，允许按UUID删除单条采集记录
 * 而不是删除整个指令。
 * 
 * 核心思想：
 * - 每条采集记录都有唯一的UUID
 * - 在保存时为每条记录分配UUID
 * - 支持按UUID删除单条记录
 * - 支持查询、修改、统计等操作
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 采集记录的扩展格式（包含UUID）
 */
export interface CollectionWithUUID {
  uuid: string;                    // 唯一标识符
  commandName: string;             // 所属指令
  timestamp: number;               // 采集时间戳
  waveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  croppingMeta?: any;              // 裁剪元数据
  normalizationMeta?: any;         // 缩放元数据
  userId?: string;                 // 用户ID
  userName?: string;               // 用户名
  status?: 'normal' | 'anomaly' | 'degraded'; // 处理状态
}

/**
 * 为采集记录分配UUID
 */
export function assignUUIDToCollection(
  collection: any,
  commandName: string
): CollectionWithUUID {
  return {
    uuid: uuidv4(),
    commandName,
    timestamp: collection.timestamp?.getTime() || Date.now(),
    waveform: collection.waveform,
    croppingMeta: collection.croppingMeta,
    normalizationMeta: collection.normalizationMeta,
    userId: collection.userId,
    userName: collection.userName,
    status: collection.status || 'normal'
  };
}

/**
 * 批量为采集记录分配UUID
 */
export function assignUUIDsToCollections(
  collections: any[],
  commandName: string
): CollectionWithUUID[] {
  return collections.map(col => assignUUIDToCollection(col, commandName));
}

/**
 * 验证UUID格式
 */
export function isValidUUID(uuid: string): boolean {
  // 更宽松的UUID验证（支持所有版本的UUID）
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 按UUID删除单条采集记录
 */
export function removeCollectionByUUID(
  collections: CollectionWithUUID[],
  uuidToRemove: string
): CollectionWithUUID[] {
  if (!isValidUUID(uuidToRemove)) {
    throw new Error(`无效的UUID格式: ${uuidToRemove}`);
  }

  return collections.filter(col => col.uuid !== uuidToRemove);
}

/**
 * 批量按UUID删除采集记录
 */
export function removeCollectionsByUUIDs(
  collections: CollectionWithUUID[],
  uuidsToRemove: string[]
): CollectionWithUUID[] {
  const uuidSet = new Set(uuidsToRemove);
  return collections.filter(col => !uuidSet.has(col.uuid));
}

/**
 * 按UUID查找采集记录
 */
export function findCollectionByUUID(
  collections: CollectionWithUUID[],
  uuid: string
): CollectionWithUUID | undefined {
  return collections.find(col => col.uuid === uuid);
}

/**
 * 按UUID更新采集记录的状态
 */
export function updateCollectionStatus(
  collections: CollectionWithUUID[],
  uuid: string,
  status: 'normal' | 'anomaly' | 'degraded'
): CollectionWithUUID[] {
  return collections.map(col =>
    col.uuid === uuid ? { ...col, status } : col
  );
}

/**
 * 获取采集统计信息
 */
export interface CollectionStats {
  total: number;
  normal: number;
  anomaly: number;
  degraded: number;
}

export function getCollectionStats(
  collections: CollectionWithUUID[]
): CollectionStats {
  return {
    total: collections.length,
    normal: collections.filter(c => c.status === 'normal').length,
    anomaly: collections.filter(c => c.status === 'anomaly').length,
    degraded: collections.filter(c => c.status === 'degraded').length
  };
}

/**
 * 备份采集记录（用于删除前保存）
 */
export interface CollectionBackup {
  timestamp: number;
  collections: CollectionWithUUID[];
  reason: string;
}

export class CollectionBackupManager {
  private backups: CollectionBackup[] = [];
  private maxBackups: number = 10;

  /**
   * 创建备份
   */
  createBackup(
    collections: CollectionWithUUID[],
    reason: string = '用户操作'
  ): void {
    this.backups.push({
      timestamp: Date.now(),
      collections: JSON.parse(JSON.stringify(collections)), // 深拷贝
      reason
    });

    // 保持最多maxBackups个备份
    if (this.backups.length > this.maxBackups) {
      this.backups.shift();
    }
  }

  /**
   * 恢复备份
   */
  restoreBackup(index: number = -1): CollectionWithUUID[] | null {
    if (this.backups.length === 0) {
      return null;
    }

    const backupIndex = index === -1 ? this.backups.length - 1 : index;
    if (backupIndex < 0 || backupIndex >= this.backups.length) {
      return null;
    }

    return JSON.parse(JSON.stringify(this.backups[backupIndex].collections));
  }

  /**
   * 获取所有备份信息
   */
  getBackupHistory(): Array<{
    index: number;
    timestamp: string;
    reason: string;
    count: number;
  }> {
    return this.backups.map((backup, idx) => ({
      index: idx,
      timestamp: new Date(backup.timestamp).toLocaleString(),
      reason: backup.reason,
      count: backup.collections.length
    }));
  }

  /**
   * 清空所有备份
   */
  clearBackups(): void {
    this.backups = [];
  }
}

/**
 * 将采集记录转换回原始格式（用于保存到数据库）
 */
export function convertToStorageFormat(
  collections: CollectionWithUUID[]
): Array<{
  uuid: string;
  timestamp: number;
  waveform: any;
  croppingMeta?: any;
  normalizationMeta?: any;
  userId?: string;
  userName?: string;
  status?: string;
}> {
  return collections.map(col => ({
    uuid: col.uuid,
    timestamp: col.timestamp,
    waveform: col.waveform,
    croppingMeta: col.croppingMeta,
    normalizationMeta: col.normalizationMeta,
    userId: col.userId,
    userName: col.userName,
    status: col.status
  }));
}

/**
 * 从存储格式恢复采集记录
 */
export function convertFromStorageFormat(
  data: any[]
): CollectionWithUUID[] {
  return data.map(item => ({
    uuid: item.uuid || uuidv4(),
    commandName: item.commandName || '',
    timestamp: item.timestamp || Date.now(),
    waveform: item.waveform,
    croppingMeta: item.croppingMeta,
    normalizationMeta: item.normalizationMeta,
    userId: item.userId,
    userName: item.userName,
    status: item.status || 'normal'
  }));
}

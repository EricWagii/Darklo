/**
 * 数据迁移工具
 * 用于处理旧版本数据到新版本的迁移
 */

import { StoredCommand, CollectionData, DATA_VERSION, SAMPLE_RATE } from '@shared/data-models';

export function migrateCommand(data: any): StoredCommand {
  // 如果已经是新版本，直接返回
  if (data.version === DATA_VERSION && data.samplingRate === SAMPLE_RATE) {
    return data as StoredCommand;
  }

  // 迁移旧数据
  const migrated: StoredCommand = {
    name: data.name,
    collections: (data.collections || []).map((col: any) => migrateCollection(col)),
    createdAt: data.createdAt instanceof Date ? data.createdAt.getTime() : data.createdAt,
    accuracy: data.accuracy,
    version: DATA_VERSION,
    samplingRate: SAMPLE_RATE,
    lastModified: Date.now(),
  };

  return migrated;
}

function migrateCollection(col: any): CollectionData {
  return {
    index: col.index ?? 0,
    timestamp: col.timestamp instanceof Date ? col.timestamp.getTime() : col.timestamp,
    waveform: col.waveform || { ch1: [], ch2: [], ch3: [] },
    duration: col.duration ?? 0,
    trimStart: col.trimStart,
    trimEnd: col.trimEnd,
    userId: col.userId,
    userName: col.userName,
    quality: col.quality,
  };
}

export function needsMigration(data: any): boolean {
  return (
    data.version !== DATA_VERSION ||
    data.samplingRate !== SAMPLE_RATE ||
    (data.collections && data.collections.some((col: any) => col.timestamp instanceof Date))
  );
}

export function migrateAllCommands(commands: any[]): StoredCommand[] {
  return commands.map((cmd) => (needsMigration(cmd) ? migrateCommand(cmd) : cmd));
}

export default {
  migrateCommand,
  migrateAllCommands,
  needsMigration,
};

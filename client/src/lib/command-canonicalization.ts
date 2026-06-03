/**
 * 同名重复指令合并模块
 * 修复问题1：处理同名重复指令的规范化
 */

import { EMGDatabase } from './db';

export interface CanonicalCommand {
  key: string; // 必须等于 name
  name: string;
  collections: any[];
  createdAt: number;
  updatedAt: number;
  [key: string]: any;
}

/**
 * 检测是否存在同名重复指令
 */
export async function detectDuplicateCommands(
  db: EMGDatabase
): Promise<Map<string, any[]>> {
  const allCommands = await db.getAllCommands();
  const duplicates = new Map<string, any[]>();

  // 按 name 分组
  const byName = new Map<string, any[]>();
  for (const cmd of allCommands) {
    const name = cmd.name || cmd.key;
    if (!byName.has(name)) {
      byName.set(name, []);
    }
    byName.get(name)!.push(cmd);
  }

  // 找出有多个记录的指令
  const entries = Array.from(byName.entries());
  for (const [name, commands] of entries) {
    if (commands.length > 1) {
      duplicates.set(name, commands);
      console.warn(`[Canonicalization] 发现同名重复指令: ${name} (${commands.length} 条)`);
    }
  }

  return duplicates;
}

/**
 * 合并同名重复指令为规范形式
 */
export async function canonicalizeCommand(
  db: EMGDatabase,
  commandName: string,
  duplicateRecords: any[]
): Promise<CanonicalCommand> {
  console.log(`[Canonicalization] 开始合并指令: ${commandName}`);

  // 1. 收集所有 collections
  const allCollections: any[] = [];
  const seenIds = new Set<string>();

  for (const record of duplicateRecords) {
    const collections = record.collections || [];
    for (const col of collections) {
      // 按 collection.id 去重
      if (col.id && !seenIds.has(col.id)) {
        allCollections.push(col);
        seenIds.add(col.id);
      } else if (!col.id) {
        // 没有 id 的记录也加入
        allCollections.push(col);
      }
    }
  }

  console.log(`[Canonicalization] 合并后 collections 数量: ${allCollections.length}`);

  // 2. 创建规范指令
  const canonical: CanonicalCommand = {
    key: commandName, // 必须等于 name
    name: commandName,
    collections: allCollections,
    createdAt: Math.min(...duplicateRecords.map(r => r.createdAt || 0)),
    updatedAt: Date.now(),
  };

  // 3. 保存规范指令
  await db.saveCommand(canonical);
  console.log(`[Canonicalization] 规范指令已保存: ${commandName}`);

  // 4. 删除所有旧的重复记录
  await new Promise<void>((resolve) => {
    const transaction = db.db_instance?.transaction(['commands'], 'readwrite');
    if (!transaction) {
      resolve();
      return;
    }
    const store = transaction.objectStore('commands');
    for (const record of duplicateRecords) {
      if (record.key !== commandName) {
        console.log(`[Canonicalization] 删除旧记录: key="${record.key}"`);
        store.delete(record.key);
      }
    }
    transaction.oncomplete = () => resolve();
  });

  return canonical;
}

/**
 * 自动检测并合并所有同名重复指令
 */
export async function autoCanonicalizeAllCommands(
  db: EMGDatabase
): Promise<Map<string, CanonicalCommand>> {
  const duplicates = await detectDuplicateCommands(db);
  const canonicalized = new Map<string, CanonicalCommand>();

  const entries = Array.from(duplicates.entries());
  for (const [name, records] of entries) {
    const canonical = await canonicalizeCommand(db, name, records);
    canonicalized.set(name, canonical);
  }

  if (canonicalized.size > 0) {
    console.log(`[Canonicalization] 完成 ${canonicalized.size} 个重复指令的合并`);
  }

  return canonicalized;
}

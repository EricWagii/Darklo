/**
 * 版本管理模块
 * 
 * 功能：
 * - 管理应用版本
 * - 在版本更新时清空所有历史采集数据
 * - 记录版本更新日志
 * 
 * 存储：使用IndexedDB中的systemVersion存储对象
 */

import { DB_CONFIG } from '@/../../shared/const';
import { emgDatabase } from './db';

/**
 * 当前应用版本
 * 每次发布新版本时，更新这个版本号
 */
export const CURRENT_APP_VERSION = '1.0.0';

/**
 * 获取存储的应用版本
 */
export async function getStoredAppVersion(): Promise<string> {
  try {
    if (!(emgDatabase as any).db) {
      await emgDatabase.init();
    }

    return new Promise((resolve) => {
      const transaction = (emgDatabase as any).db!.transaction(
        [DB_CONFIG.STORES.SYSTEM_VERSION],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.SYSTEM_VERSION);
      const request = store.get('app-version');

      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.version || '0.0.0');
      };

      request.onerror = () => {
        resolve('0.0.0');
      };
    });
  } catch (err) {
    console.error('⚠️ 警告：获取应用版本失败', err);
    return '0.0.0';
  }
}

/**
 * 保存应用版本
 */
export async function saveAppVersion(version: string): Promise<void> {
  try {
    if (!(emgDatabase as any).db) {
      await emgDatabase.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = (emgDatabase as any).db!.transaction(
        [DB_CONFIG.STORES.SYSTEM_VERSION],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.SYSTEM_VERSION);
      
      const versionData = {
        key: 'app-version',
        version,
        updatedAt: new Date().toISOString(),
      };

      const request = store.put(versionData);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('应用版本保存失败'));
      };
    });
  } catch (err) {
    console.error('⚠️ 警告：保存应用版本失败', err);
  }
}

/**
 * 检查是否需要清空数据（版本更新时）
 */
export async function shouldClearDataOnVersionUpdate(): Promise<boolean> {
  const storedVersion = await getStoredAppVersion();
  return storedVersion !== CURRENT_APP_VERSION;
}

/**
 * 清空所有历史采集数据
 * 仅在版本更新时调用
 */
export async function clearAllCollectionData(): Promise<number> {
  try {
    console.log('[版本管理] 开始清空所有历史采集数据...');
    
    // 获取所有指令
    const commands = await emgDatabase.getAllCommands();
    let totalDeleted = 0;
    
    // 删除所有指令及其采集数据
    for (const command of commands || []) {
      try {
        const collectionCount = command.collections?.length || 0;
        await emgDatabase.deleteCommand(command.name);
        console.log(`[版本管理] 已删除指令: ${command.name} (包含 ${collectionCount} 条采集)`);
        totalDeleted += collectionCount;
      } catch (error) {
        // 指令不存在是正常情况，不需要报错
        console.log(`[版本管理] 指令 ${command.name} 不存在或已删除，跳过`);
      }
    }
    
    // 清空所有识别记录
    try {
      // 新发现9修复：使用clearAllRecognitionRecords()不依赖不一致的id
      await emgDatabase.clearAllRecognitionRecords();
      console.log('[版本管理] 已清空所有识别记录');
    } catch (error) {
      console.warn('[版本管理] 清空识别记录失败:', error);
    }
    
    console.log(`[版本管理] 成功清空所有历史采集数据 (共 ${totalDeleted} 条采集)`);
    return totalDeleted;
  } catch (error) {
    console.error('[版本管理] 清空数据失败:', error);
    throw error;
  }
}

/**
 * 执行版本检查和数据清空
 * 应该在应用启动时调用一次
 */
export async function performVersionCheck(): Promise<void> {
  try {
    const storedVersion = await getStoredAppVersion();
    const currentVersion = CURRENT_APP_VERSION;
    
    console.log(`[版本管理] 版本检查: 存储版本=${storedVersion}, 当前版本=${currentVersion}`);
    
    if (storedVersion !== currentVersion) {
      console.log(`[版本管理] 检测到版本更新 (${storedVersion} -> ${currentVersion})`);
      // 新发现8修复：不自动清空训练数据，仅更新版本记录
      console.log(`[版本管理] 不自动清空训练数据，仅更新版本记录`);
      
      // 保存新版本
      await saveAppVersion(currentVersion);
    } else {
      console.log('[版本管理] 版本未变化，无需清空数据');
    }
  } catch (error) {
    console.error('[版本管理] 版本检查失败:', error);
  }
}

/**
 * 获取版本信息
 */
export async function getVersionInfo() {
  const storedVersion = await getStoredAppVersion();
  const needsDataClear = storedVersion !== CURRENT_APP_VERSION;
  
  return new Promise<any>((resolve) => {
    if (!(emgDatabase as any).db) {
      resolve({
        currentVersion: CURRENT_APP_VERSION,
        storedVersion,
        needsDataClear,
        lastUpdated: null,
      });
      return;
    }

    const transaction = (emgDatabase as any).db.transaction(
      [DB_CONFIG.STORES.SYSTEM_VERSION],
      'readonly'
    );
    const store = transaction.objectStore(DB_CONFIG.STORES.SYSTEM_VERSION);
    const request = store.get('app-version');

    request.onsuccess = () => {
      const result = request.result;
      resolve({
        currentVersion: CURRENT_APP_VERSION,
        storedVersion,
        needsDataClear,
        lastUpdated: result?.updatedAt || null,
      });
    };

    request.onerror = () => {
      resolve({
        currentVersion: CURRENT_APP_VERSION,
        storedVersion,
        needsDataClear,
        lastUpdated: null,
      });
    };
  });
}

/**
 * 重置管理员账户脚本
 * 用于在浏览器控制台中运行，重置管理员账户
 * 
 * 注意：此功能已迁移到user-auth.ts中的initializeAdminAccount函数
 * 现在使用IndexedDB存储
 */

import { hashPassword } from './pbkdf2-crypto';
import { DB_CONFIG } from '@/../../shared/const';
import { emgDatabase } from './db';
import type { UserAccount } from './user-auth';

export async function resetAdminAccount() {
  const ADMIN_USERNAME = 'Wagii';
  const ADMIN_PASSWORD = 'geniusatwork';

  try {
    if (!(emgDatabase as any).db) {
      await emgDatabase.init();
    }

    // 获取所有账户
    const accounts = await new Promise<UserAccount[]>((resolve) => {
      const transaction = (emgDatabase as any).db!.transaction(
        [DB_CONFIG.STORES.USER_ACCOUNTS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.USER_ACCOUNTS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve([]);
      };
    });

    // 删除旧的管理员账户
    const nonAdminAccounts = accounts.filter((acc: any) => !acc.isAdmin);

    // 创建新的管理员账户
    const adminPasswordHash = await hashPassword(ADMIN_PASSWORD);
    const newAdminAccount: UserAccount = {
      username: ADMIN_USERNAME,
      userId: `admin-${Date.now()}`,
      passwordHash: adminPasswordHash,
      isAdmin: true,
      createdAt: Date.now(),
      passwordMigrated: true,
    };

    // 清空用户账户表并重新插入
    await new Promise<void>((resolve) => {
      const transaction = (emgDatabase as any).db!.transaction(
        [DB_CONFIG.STORES.USER_ACCOUNTS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.USER_ACCOUNTS);
      
      // 清空表
      store.clear();
      
      // 插入非管理员账户
      for (const acc of nonAdminAccounts) {
        store.add(acc);
      }
      
      // 插入新管理员账户
      store.add(newAdminAccount);
      
      transaction.oncomplete = () => resolve();
    });

    console.log('✅ 管理员账户已重置');
    console.log(`用户名: ${ADMIN_USERNAME}`);
    console.log(`密码: ${ADMIN_PASSWORD}`);
    return { success: true, message: '管理员账户已重置' };
  } catch (err) {
    console.error('❌ 重置管理员账户失败:', err);
    return { success: false, message: '重置失败' };
  }
}

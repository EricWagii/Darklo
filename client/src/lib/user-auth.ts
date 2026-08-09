/**
 * 用户认证管理模块
 * 
 * 功能：
 * - 用户注册和登录
 * - 密码加密和验证（使用 PBKDF2）
 * - 管理员账户管理
 * 
 * 存储：使用IndexedDB中的userAccounts存储对象
 */

import { DB_CONFIG } from '@/../../shared/const';
import { hashPassword, verifyPassword, migratePasswordHash } from './pbkdf2-crypto';
import { emgDatabase } from './db';
import { isPortableRuntime, shouldInitializeBrowserAdmin } from './portable-runtime';

export interface UserAccount {
  username: string;
  userId?: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: number;
  passwordMigrated?: boolean;
}

const ADMIN_USERNAME = 'Wagii';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

const MAX_MIGRATION_RETRIES = 3;

/**
 * 初始化管理员账户
 */
async function initializeAdminAccount(adminPassword: string) {
  try {
    if (!(emgDatabase as any).db) {
      await emgDatabase.init();
    }

    // 检查管理员是否已存在
    const accounts = await getAllAccounts();
    const adminExists = accounts.some(acc => acc.isAdmin);
    
    if (!adminExists) {
      const adminPasswordHash = await hashPassword(adminPassword);
      const adminAccount: UserAccount = {
        username: ADMIN_USERNAME,
        userId: `admin-${Date.now()}`,
        passwordHash: adminPasswordHash,
        isAdmin: true,
        createdAt: Date.now(),
        passwordMigrated: true,
      };
      
      await new Promise<void>((resolve, reject) => {
        const transaction = (emgDatabase as any).db!.transaction(
          [DB_CONFIG.STORES.USER_ACCOUNTS],
          'readwrite'
        );
        const store = transaction.objectStore(DB_CONFIG.STORES.USER_ACCOUNTS);
        // ✅ 修改3：补充key字段
        const request = store.add({
          key: adminAccount.userId,
          ...adminAccount,
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('管理员账户创建失败'));
      });
    }
  } catch (err) {
    console.error('⚠️ 警告：管理员账户初始化失败', err);
  }
}

/**
 * 获取所有账户
 */
export async function getAllAccounts(): Promise<UserAccount[]> {
  try {
    if (!(emgDatabase as any).db) {
      await emgDatabase.init();
    }

    return new Promise((resolve, reject) => {
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
        reject(new Error('获取账户失败'));
      };
    });
  } catch (err) {
    console.error('⚠️ 警告：获取账户失败', err);
    return [];
  }
}

/**
 * 注册新用户
 */
export async function registerUser(
  username: string,
  password: string
): Promise<{ success: boolean; message: string; userId?: string }> {
  if (!username || !password) {
    return { success: false, message: '用户名和密码不能为空' };
  }

  if (username.length < 2) {
    return { success: false, message: '用户名至少需要 2 个字符' };
  }

  if (password.length < 6) {
    return { success: false, message: '密码至少需要 6 个字符' };
  }

  const accounts = await getAllAccounts();
  
  if (accounts.some(acc => acc.username === username)) {
    return { success: false, message: '用户名已存在，请使用其他用户名' };
  }

  try {
    if (!(emgDatabase as any).db) {
      await emgDatabase.init();
    }

    const passwordHash = await hashPassword(password);
    const newAccount: UserAccount = {
      username,
      userId: `user-${Date.now()}`,
      passwordHash,
      isAdmin: false,
      createdAt: Date.now(),
      passwordMigrated: true,
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = (emgDatabase as any).db!.transaction(
        [DB_CONFIG.STORES.USER_ACCOUNTS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.USER_ACCOUNTS);
      // ✅ 修改3：补充key字段
      const request = store.add({
        key: newAccount.userId,
        ...newAccount,
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('注册失败'));
    });

    // ✅ 修改6修正：新建用户后立即成为当前用户
    // 当前用户信息存储在React context中，不使用localStorage

    return {
      success: true,
      message: '注册成功',
      userId: newAccount.userId,
    };
  } catch (err) {
    console.error('Registration failed:', err);
    return { success: false, message: '注册失败，请重试' };
  }
}

/**
 * 登录用户
 */
export async function loginUser(
  username: string,
  password: string
): Promise<{ success: boolean; message: string; account?: UserAccount }> {
  if (!username || !password) {
    return { success: false, message: '用户名和密码不能为空' };
  }

  try {
    const accounts = await getAllAccounts();
    const account = accounts.find(acc => acc.username === username);

    if (!account) {
      return { success: false, message: '用户名或密码错误' };
    }

    let isPasswordValid = false;
    
    try {
      isPasswordValid = await verifyPassword(password, account.passwordHash);
    } catch (err) {
      try {
        const simpleHash = btoa(`${password}:${account.createdAt}`);
        isPasswordValid = simpleHash === account.passwordHash;
      } catch (e) {
        isPasswordValid = false;
      }
    }
    
    if (!isPasswordValid) {
      return { success: false, message: '用户名或密码错误' };
    }

    if (!account.passwordMigrated) {
      await migratePasswordForAccount(username, password, account);
    }

    return {
      success: true,
      message: '登录成功',
      account,
    };
  } catch (err) {
    console.error('Login failed:', err);
    return { success: false, message: '登录失败，请重试' };
  }
}

/**
 * 检查用户名是否存在
 */
export async function usernameExists(username: string): Promise<boolean> {
  const accounts = await getAllAccounts();
  return accounts.some(acc => acc.username === username);
}

/**
 * 获取用户账户
 */
export async function getUserAccount(userId: string): Promise<UserAccount | null> {
  const accounts = await getAllAccounts();
  return accounts.find(acc => acc.userId === userId) || null;
}

/**
 * 重置用户密码
 */
export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, message: '密码至少需要 6 个字符' };
  }

  try {
    if (!(emgDatabase as any).db) {
      await emgDatabase.init();
    }

    const accounts = await getAllAccounts();
    const account = accounts.find(acc => acc.userId === userId);

    if (!account) {
      return { success: false, message: '用户不存在' };
    }

    const newPasswordHash = await hashPassword(newPassword);
    account.passwordHash = newPasswordHash;
    account.passwordMigrated = true;
    
    await new Promise<void>((resolve, reject) => {
      const transaction = (emgDatabase as any).db!.transaction(
        [DB_CONFIG.STORES.USER_ACCOUNTS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.USER_ACCOUNTS);
      // ✅ 修改3：补充key字段
      const request = store.put({
        key: account.userId,
        ...account,
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('密码重置失败'));
    });

    return {
      success: true,
      message: '密码重置成功',
    };
  } catch (err) {
    console.error('Password reset failed:', err);
    return { success: false, message: '密码重置失败，请重试' };
  }
}

/**
 * 迁移单个账户的密码
 */
async function migratePasswordForAccount(
  username: string,
  password: string,
  account: UserAccount
): Promise<void> {
  for (let retry = 0; retry < MAX_MIGRATION_RETRIES; retry++) {
    try {
      if (!(emgDatabase as any).db) {
        await emgDatabase.init();
      }

      const latestAccounts = await getAllAccounts();
      const latestAccount = latestAccounts.find(acc => acc.username === username);
      
      if (latestAccount?.passwordMigrated) {
        return;
      }
      
      const newPasswordHash = await hashPassword(password);
      latestAccount!.passwordHash = newPasswordHash;
      latestAccount!.passwordMigrated = true;
      
      await new Promise<void>((resolve, reject) => {
        const transaction = (emgDatabase as any).db!.transaction(
          [DB_CONFIG.STORES.USER_ACCOUNTS],
          'readwrite'
        );
        const store = transaction.objectStore(DB_CONFIG.STORES.USER_ACCOUNTS);
        // ✅ 修改3：补充key字段
        const request = store.put({
          key: latestAccount!.userId,
          ...latestAccount!,
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('密码迁移失败'));
      });
      
      return;
    } catch (err) {
      console.warn(`[Auth] 密码迁移失败，重试 ${retry + 1}/${MAX_MIGRATION_RETRIES}`, err);
      
      if (retry < MAX_MIGRATION_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 100 * (retry + 1)));
      }
    }
  }
  
  console.error(`[Auth] 密码迁移失败（用户: ${username}，已重试 ${MAX_MIGRATION_RETRIES} 次）`);
}

// Only provision an administrator when deployment explicitly supplies a password.
if (shouldInitializeBrowserAdmin(ADMIN_PASSWORD, isPortableRuntime())) {
  initializeAdminAccount(ADMIN_PASSWORD).catch(err => {
    console.error('Failed to initialize admin account:', err);
  });
}

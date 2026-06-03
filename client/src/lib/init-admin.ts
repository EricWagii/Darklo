/**
 * 管理员账户初始化模块
 * 
 * 注意：此功能已迁移到user-auth.ts中
 * 现在使用IndexedDB存储
 */

import type { UserAccount } from './user-auth';

/**
 * 初始化管理员账户 - 同步版本
 * 在应用启动时立即调用
 * 
 * 已弃用：使用user-auth.ts中的initializeAdminAccount()替代
 */
export function initializeAdminAccountSync() {
  console.warn('[Init Admin] 此函数已弃用，请使用user-auth.ts中的initializeAdminAccount()');
}

/**
 * 获取所有账户 - 同步版本
 * 
 * 已弃用：使用user-auth.ts中的getAllAccounts()替代
 */
export function getAllAccountsSync(): UserAccount[] {
  console.warn('[Init Admin] 此函数已弃用，请使用user-auth.ts中的getAllAccounts()');
  return [];
}

/**
 * 检查管理员是否存在 - 同步版本
 * 
 * 已弃用：使用user-auth.ts中的getAllAccounts()替代
 */
export function adminExistsSync(): boolean {
  console.warn('[Init Admin] 此函数已弃用');
  return false;
}

/**
 * 应用初始化模块
 * 
 * 功能：
 * - 应用启动时初始化IndexedDB
 * - 确保数据库处于一致的状态
 * - 记录初始化日志
 */

import { emgDatabase } from './db';

/**
 * 应用初始化函数
 * 应该在App.tsx的useEffect中调用，仅执行一次
 */
export async function initializeApp(): Promise<void> {
  try {
    console.log('[应用初始化] 开始初始化...');
    
    // IndexedDB初始化
    const commands = await emgDatabase.getAllCommands();
    console.log(`[应用初始化] IndexedDB已初始化，当前有 ${commands.length} 条指令`);
    
    console.log('[应用初始化] 初始化完成!');
  } catch (error) {
    console.error('[应用初始化失败]', error);
  }
}

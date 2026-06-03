/**
 * 系统日志和审计模块
 * 
 * 功能：
 * - 记录用户操作（登录、采集、删除等）
 * - 提供审计日志查询
 * - 支持日志导出
 * 
 * 存储：使用IndexedDB中的auditLogs存储对象
 */

import { DB_CONFIG } from '@/../../shared/const';
import { emgDatabase } from './db';

export enum AuditEventType {
  // 用户操作
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_REGISTER = 'USER_REGISTER',
  USER_PASSWORD_RESET = 'USER_PASSWORD_RESET',

  // 采集操作
  COLLECTION_START = 'COLLECTION_START',
  COLLECTION_SAVE = 'COLLECTION_SAVE',
  COLLECTION_DELETE = 'COLLECTION_DELETE',

  // 导出操作
  EXPORT = 'EXPORT',

  // 管理员操作
  ADMIN_DELETE_USER_DATA = 'ADMIN_DELETE_USER_DATA',
  ADMIN_CLEAR_ALL_DATA = 'ADMIN_CLEAR_ALL_DATA',
  ADMIN_RESET_PASSWORD = 'ADMIN_RESET_PASSWORD',
}

export interface AuditLogEntry {
  id?: number;
  timestamp: number;
  eventType: AuditEventType;
  userId?: string;
  userName?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

const MAX_LOGS = 500; // 上限为500条以优化性能

/**
 * 获取所有审计日志
 */
export async function getAllAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const db = emgDatabase.getDb();
    if (!db) {
      await emgDatabase.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = (emgDatabase.getDb() || emgDatabase.getDb())!.transaction(
        [DB_CONFIG.STORES.AUDIT_LOGS],
        'readonly'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.AUDIT_LOGS);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('审计日志读取失败'));
      };
    });
  } catch (err) {
    console.error('⚠️ 警告：审计日志读取失败', err);
    return [];
  }
}

/**
 * 记录审计事件
 */
export async function logAuditEvent(
  eventType: AuditEventType,
  details: Record<string, any>,
  userId?: string,
  userName?: string
): Promise<AuditLogEntry> {
  const entry: AuditLogEntry = {
    timestamp: Date.now(),
    eventType,
    userId,
    userName,
    details,
    userAgent: navigator.userAgent,
  };

  try {
    const db = emgDatabase.getDb();
    if (!db) {
      await emgDatabase.init();
    }

    // 先添加新日志
    await new Promise<void>((resolve, reject) => {
      const transaction = (emgDatabase.getDb() || emgDatabase.getDb())!.transaction(
        [DB_CONFIG.STORES.AUDIT_LOGS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.AUDIT_LOGS);
      // ✅ 修改3：补充唯一key字段
      const addRequest = store.add({
        key: `audit-${Date.now()}-${Math.random()}`,
        ...entry,
      });

      addRequest.onsuccess = () => {
        resolve();
      };

      addRequest.onerror = () => {
        reject(new Error('审计日志保存失败'));
      };
    });

    // 检查是否超过上限，如果超过则删除最旧的日志
    const logs = await getAllAuditLogs();
    if (logs.length > MAX_LOGS) {
      const logsToDelete = logs.slice(0, logs.length - MAX_LOGS);
      for (const log of logsToDelete) {
        if (log.id) {
          await new Promise<void>((resolve) => {
            const transaction = (emgDatabase.getDb() || emgDatabase.getDb())!.transaction(
              [DB_CONFIG.STORES.AUDIT_LOGS],
              'readwrite'
            );
            const store = transaction.objectStore(DB_CONFIG.STORES.AUDIT_LOGS);
            store.delete(log.id!);
            transaction.oncomplete = () => resolve();
          });
        }
      }
    }
  } catch (err) {
    console.error('⚠️ 警告：审计日志保存失败', err);
  }

  return entry;
}

/**
 * 按事件类型查询日志
 */
export async function getLogsByEventType(eventType: AuditEventType): Promise<AuditLogEntry[]> {
  const logs = await getAllAuditLogs();
  return logs.filter(log => log.eventType === eventType);
}

/**
 * 按用户查询日志
 */
export async function getLogsByUser(userId: string): Promise<AuditLogEntry[]> {
  const logs = await getAllAuditLogs();
  return logs.filter(log => log.userId === userId);
}

/**
 * 按时间范围查询日志
 */
export async function getLogsByTimeRange(startTime: number, endTime: number): Promise<AuditLogEntry[]> {
  const logs = await getAllAuditLogs();
  return logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
}

/**
 * 获取最近的 N 条日志
 */
export async function getRecentLogs(count: number = 100): Promise<AuditLogEntry[]> {
  const logs = await getAllAuditLogs();
  return logs.slice(-count).reverse();
}

/**
 * 清空所有审计日志
 */
export async function clearAllAuditLogs(): Promise<void> {
  try {
    const db = emgDatabase.getDb();
    if (!db) {
      await emgDatabase.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = (emgDatabase.getDb() || emgDatabase.getDb())!.transaction(
        [DB_CONFIG.STORES.AUDIT_LOGS],
        'readwrite'
      );
      const store = transaction.objectStore(DB_CONFIG.STORES.AUDIT_LOGS);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('审计日志清空失败'));
      };
    });
  } catch (err) {
    console.error('⚠️ 警告：审计日志清空失败', err);
  }
}

/**
 * 导出审计日志为 CSV
 */
export async function exportAuditLogsToCSV(logs?: AuditLogEntry[]): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `audit-logs-${timestamp}.csv`;

  const logsToExport = logs || await getAllAuditLogs();

  const headers = ['日志ID', '时间', '事件类型', '用户ID', '用户名', '详情'];
  const rows: string[][] = logsToExport.map(log => [
    log.id?.toString() || 'N/A',
    new Date(log.timestamp).toLocaleString('zh-CN'),
    log.eventType,
    log.userId || 'N/A',
    log.userName || 'N/A',
    JSON.stringify(log.details),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 获取审计统计信息
 */
export async function getAuditStatistics() {
  const logs = await getAllAuditLogs();

  const stats = {
    totalEvents: logs.length,
    eventsByType: {} as Record<string, number>,
    eventsByUser: {} as Record<string, number>,
    recentEvents: logs.slice(-10).reverse(),
  };

  logs.forEach(log => {
    // 按事件类型统计
    stats.eventsByType[log.eventType] = (stats.eventsByType[log.eventType] || 0) + 1;

    // 按用户统计
    const userName = log.userName || 'Unknown';
    stats.eventsByUser[userName] = (stats.eventsByUser[userName] || 0) + 1;
  });

  return stats;
}

/**
 * IndexedDB 数据彻底清除工具
 * 用于彻底清除所有 IndexedDB 历史数据
 * 
 * 严格规则：
 * - 只清除 IndexedDB
 * - UI 删除后自动调用，不需要二次确认
 * - 确保数据完全清除，避免历史脏数据污染
 */

import { emgDatabase } from './db';

export interface WipeReport {
  timestamp: string;
  commandsDeleted: number;
  collectionsDeleted: number;
  recognitionRecordsDeleted: number;
  calibrationDataDeleted: number;
  indexedDBCleared: boolean;
  success: boolean;
  details: string[];
}

/**
 * 获取当前 IndexedDB 数据统计
 */
export async function getIndexedDBStatistics(): Promise<{
  commandCount: number;
  collectionCount: number;
  recognitionRecordCount: number;
  calibrationDataExists: boolean;
}> {
  try {
    const commands = await emgDatabase.getAllCommands();
    const recognitionRecords = await emgDatabase.getAllRecognitionRecords();
    const calibrationData = await emgDatabase.getCalibration();

    let collectionCount = 0;
    if (commands && Array.isArray(commands)) {
      collectionCount = commands.reduce((sum, cmd) => sum + (cmd.collections?.length || 0), 0);
    }

    return {
      commandCount: commands?.length || 0,
      collectionCount,
      recognitionRecordCount: recognitionRecords?.length || 0,
      calibrationDataExists: !!calibrationData,
    };
  } catch (error) {
    console.error('[Data Wipe] 获取数据统计失败:', error);
    return {
      commandCount: 0,
      collectionCount: 0,
      recognitionRecordCount: 0,
      calibrationDataExists: false,
    };
  }
}

/**
 * 彻底清除所有 IndexedDB 数据
 * 
 * 调用场景：
 * - 用户在 UI 上删除指令后自动调用
 * - 用户在 UI 上删除采集后自动调用
 * - 用户在 UI 上删除识别记录后自动调用
 * - 不需要二次确认，直接执行
 */
export async function wipeAllIndexedDBData(): Promise<WipeReport> {
  const report: WipeReport = {
    timestamp: new Date().toISOString(),
    commandsDeleted: 0,
    collectionsDeleted: 0,
    recognitionRecordsDeleted: 0,
    calibrationDataDeleted: 0,
    indexedDBCleared: false,
    success: false,
    details: [],
  };

  try {
    // 1. 清除所有 commands
    try {
      const commands = await emgDatabase.getAllCommands();
      if (commands && Array.isArray(commands)) {
        for (const cmd of commands) {
          // 计算 collections 数量
          if (cmd.collections && Array.isArray(cmd.collections)) {
            report.collectionsDeleted += cmd.collections.length;
          }
          // 删除 command
          await emgDatabase.deleteCommand(cmd.name || cmd.key);
          report.commandsDeleted++;
        }
      }
      if (report.commandsDeleted > 0) {
        report.details.push(`✅ 已删除 ${report.commandsDeleted} 个指令，${report.collectionsDeleted} 条采集`);
      }
    } catch (error) {
      report.details.push(`❌ 删除指令失败: ${error}`);
    }

    // 2. 清除所有识别记录
    try {
      const recognitionRecords = await emgDatabase.getAllRecognitionRecords();
      if (recognitionRecords && Array.isArray(recognitionRecords)) {
        for (const record of recognitionRecords) {
          if (record.id) {
            await emgDatabase.deleteRecognitionRecord(record.id);
            report.recognitionRecordsDeleted++;
          }
        }
      }
      if (report.recognitionRecordsDeleted > 0) {
        report.details.push(`✅ 已删除 ${report.recognitionRecordsDeleted} 条识别记录`);
      }
    } catch (error) {
      report.details.push(`❌ 删除识别记录失败: ${error}`);
    }

    // 3. 清除校准数据
    try {
      const calibrationData = await emgDatabase.getCalibration();
      if (calibrationData) {
        await emgDatabase.clearCalibration();
        report.calibrationDataDeleted = 1;
        report.details.push(`✅ 已清除校准数据`);
      }
    } catch (error) {
      report.details.push(`❌ 清除校准数据失败: ${error}`);
    }

    // 4. 验证 IndexedDB 是否为空
    try {
      const commands = await emgDatabase.getAllCommands();
      const recognitionRecords = await emgDatabase.getAllRecognitionRecords();
      const calibrationData = await emgDatabase.getCalibration();

      const isEmpty =
        (!commands || commands.length === 0) &&
        (!recognitionRecords || recognitionRecords.length === 0) &&
        !calibrationData;

      if (isEmpty) {
        report.indexedDBCleared = true;
        report.details.push('✅ IndexedDB 已完全清空');
      } else {
        report.details.push(
          `⚠️ IndexedDB 未完全清空: commands=${commands?.length || 0}, ` +
          `recognitionRecords=${recognitionRecords?.length || 0}, ` +
          `calibrationData=${calibrationData ? 'exists' : 'empty'}`
        );
      }
    } catch (error) {
      report.details.push(`❌ 验证 IndexedDB 失败: ${error}`);
    }

    report.success = report.indexedDBCleared;

    if (report.success) {
      report.details.push(`\n✅ 数据清除成功 - IndexedDB 已完全清空`);
    } else {
      report.details.push(`\n⚠️ 数据清除部分成功 - 请检查是否有数据残留`);
    }

    console.log('[Data Wipe] 清除报告:', report);
  } catch (error) {
    report.details.push(`❌ 清除过程出错: ${error}`);
    console.error('[Data Wipe] 清除失败:', error);
  }

  return report;
}

/**
 * 验证 IndexedDB 是否已完全清除
 */
export async function verifyIndexedDBWiped(): Promise<{
  isClean: boolean;
  remainingData: {
    commands: number;
    recognitionRecords: number;
    calibrationDataExists: boolean;
  };
}> {
  try {
    const commands = await emgDatabase.getAllCommands();
    const recognitionRecords = await emgDatabase.getAllRecognitionRecords();
    const calibrationData = await emgDatabase.getCalibration();

    const isClean =
      (!commands || commands.length === 0) &&
      (!recognitionRecords || recognitionRecords.length === 0) &&
      !calibrationData;

    return {
      isClean,
      remainingData: {
        commands: commands?.length || 0,
        recognitionRecords: recognitionRecords?.length || 0,
        calibrationDataExists: !!calibrationData,
      },
    };
  } catch (error) {
    console.error('[Data Wipe] 验证失败:', error);
    return {
      isClean: false,
      remainingData: {
        commands: 0,
        recognitionRecords: 0,
        calibrationDataExists: false,
      },
    };
  }
}

/**
 * 自动清除 - 在删除操作后自动调用
 * 用于确保删除后没有残留数据
 */
export async function autoCleanupAfterDelete(): Promise<void> {
  try {
    const stats = await getIndexedDBStatistics();
    
    // 如果检测到可能的脏数据，自动清除
    if (stats.commandCount === 0 && stats.recognitionRecordCount > 0) {
      console.warn('[Data Wipe] 检测到可能的脏数据：识别记录存在但指令为空，自动清除');
      await wipeAllIndexedDBData();
    }
    
    if (stats.commandCount === 0 && stats.calibrationDataExists) {
      console.warn('[Data Wipe] 检测到可能的脏数据：校准数据存在但指令为空，自动清除');
      await wipeAllIndexedDBData();
    }
  } catch (error) {
    console.error('[Data Wipe] 自动清除失败:', error);
  }
}

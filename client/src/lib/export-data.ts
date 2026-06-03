/**
 * 数据导出工具
 */

import { emgDatabase } from './db';
import { TrainingData } from '@/../../shared/const';

/**
 * 导出所有数据为 JSON
 */
export async function exportDataAsJSON(): Promise<string> {
  try {
    const trainingData = await emgDatabase.getAllTrainingData();
    const sessions = await emgDatabase.getAllSessions();

    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      trainingData: trainingData.map((data) => ({
        commandId: data.commandId,
        commandName: data.commandName,
        timestamp: data.timestamp,
        features: data.averageFeature,
        sampleCount: data.samples?.length || 0,
      })),
      sessions,
      summary: {
        totalTrainingRecords: trainingData.length,
        totalSessions: sessions.length,
        uniqueCommands: new Set(trainingData.map((d) => d.commandId)).size,
      },
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    throw new Error('导出 JSON 失败: ' + (error as Error).message);
  }
}

/**
 * 导出为 CSV 格式
 */
export async function exportDataAsCSV(): Promise<string> {
  try {
    const trainingData = await emgDatabase.getAllTrainingData();

    // CSV 头
    const headers = [
      '指令ID',
      '指令名称',
      '采集时间',
      '均值-CH1',
      '均值-CH2',
      '均值-CH3',
      '方差-CH1',
      '方差-CH2',
      '方差-CH3',
      'RMS-CH1',
      'RMS-CH2',
      'RMS-CH3',
      '采样次数',
    ];

    const rows = trainingData.map((data) => [
      data.commandId,
      data.commandName,
      new Date(data.timestamp).toISOString(),
      data.averageFeature.mean[0].toFixed(2),
      data.averageFeature.mean[1].toFixed(2),
      data.averageFeature.mean[2].toFixed(2),
      data.averageFeature.variance[0].toFixed(2),
      data.averageFeature.variance[1].toFixed(2),
      data.averageFeature.variance[2].toFixed(2),
      data.averageFeature.rms[0].toFixed(2),
      data.averageFeature.rms[1].toFixed(2),
      data.averageFeature.rms[2].toFixed(2),
      data.samples?.length || 0,
    ]);

    // 组合 CSV
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  } catch (error) {
    throw new Error('导出 CSV 失败: ' + (error as Error).message);
  }
}

/**
 * 下载文件
 */
export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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
 * 导出并下载 JSON
 */
export async function exportAndDownloadJSON(): Promise<void> {
  try {
    const data = await exportDataAsJSON();
    const filename = `emg-data-${new Date().toISOString().split('T')[0]}.json`;
    downloadFile(data, filename);
  } catch (error) {
    throw error;
  }
}

/**
 * 导出并下载 CSV
 */
export async function exportAndDownloadCSV(): Promise<void> {
  try {
    const data = await exportDataAsCSV();
    const filename = `emg-data-${new Date().toISOString().split('T')[0]}.csv`;
    downloadFile(data, filename);
  } catch (error) {
    throw error;
  }
}

/**
 * 生成统计报告
 */
export async function generateReport(): Promise<string> {
  try {
    const trainingData = await emgDatabase.getAllTrainingData();
    const sessions = await emgDatabase.getAllSessions();

    const commandStats = new Map<string, number>();
    trainingData.forEach((data) => {
      commandStats.set(
        data.commandName,
        (commandStats.get(data.commandName) || 0) + 1
      );
    });

    let report = '# 耳周肌电识别系统 - 数据报告\n\n';
    report += `生成时间: ${new Date().toLocaleString()}\n\n`;

    report += '## 统计摘要\n\n';
    report += `- 总训练记录数: ${trainingData.length}\n`;
    report += `- 总会话数: ${sessions.length}\n`;
    report += `- 独特指令数: ${commandStats.size}\n\n`;

    report += '## 指令统计\n\n';
    report += '| 指令 | 采集次数 |\n';
    report += '|------|--------|\n';
    commandStats.forEach((count, command) => {
      report += `| ${command} | ${count} |\n`;
    });

    report += '\n## 会话统计\n\n';
    if (sessions.length > 0) {
      report += '| 用户 | 开始时间 | 结束时间 | 训练次数 | 识别次数 |\n';
      report += '|------|---------|---------|---------|----------|\n';
      sessions.forEach((session) => {
        const startTime = new Date(session.startTime).toLocaleString();
        const endTime = session.endTime
          ? new Date(session.endTime).toLocaleString()
          : '进行中';
        report += `| ${session.userName} | ${startTime} | ${endTime} | ${session.trainingCount} | ${session.recognitionCount} |\n`;
      });
    } else {
      report += '暂无会话记录\n';
    }

    return report;
  } catch (error) {
    throw new Error('生成报告失败: ' + (error as Error).message);
  }
}

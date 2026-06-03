/**
 * 操作日志记录系统
 * 用于记录所有采集过程中的操作、错误、警告和数据
 */

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: any;
}

export interface CollectionLog {
  index: number;
  commandName: string;
  startTime: string;
  endTime?: string;
  status: 'collecting' | 'processing' | 'success' | 'failed';
  waveform?: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    duration: number;
    totalSamples: number;
  };
  firstCropping?: {
    parameters: any;
    energyAnalysis: any;
    peakDetection: any;
    result: any;
  };
  secondCropping?: {
    parameters: any;
    result: any;
  };
  timingStats?: {
    rawDurationMs: number;
    afterFirstCroppingMs: number;
    afterSecondCroppingMs: number;
  };
  qualityScore?: any;
  error?: string;
  logs: LogEntry[];
}

export class OperationLogger {
  private logs: LogEntry[] = [];
  private collectionLogs: CollectionLog[] = [];
  private currentCollectionLog: CollectionLog | null = null;
  private maxLogs = 10000; // 最多保存10000条日志

  /**
   * 记录日志
   */
  log(level: 'info' | 'warn' | 'error' | 'debug', category: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
    };

    this.logs.push(entry);

    // 同时记录到当前采集日志
    if (this.currentCollectionLog) {
      this.currentCollectionLog.logs.push(entry);
    }

    // 控制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 同时输出到浏览器控制台
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[${category}] ${message}`, data);
  }

  /**
   * 开始采集
   */
  startCollection(commandName: string, index: number) {
    this.currentCollectionLog = {
      index,
      commandName,
      startTime: new Date().toISOString(),
      status: 'collecting',
      logs: [],
    };

    this.log('info', 'Collection', `开始采集: ${commandName} #${index + 1}`);
  }

  /**
   * 更新采集数据
   */
  updateCollectionData(data: Partial<CollectionLog>) {
    if (this.currentCollectionLog) {
      Object.assign(this.currentCollectionLog, data);
    }
  }

  /**
   * 完成采集
   */
  completeCollection(status: 'success' | 'failed', error?: string) {
    if (this.currentCollectionLog) {
      this.currentCollectionLog.endTime = new Date().toISOString();
      this.currentCollectionLog.status = status;
      if (error) {
        this.currentCollectionLog.error = error;
        this.log('error', 'Collection', `采集失败: ${error}`);
      } else {
        this.log('info', 'Collection', `采集成功: ${this.currentCollectionLog.commandName} #${this.currentCollectionLog.index + 1}`);
      }

      this.collectionLogs.push(this.currentCollectionLog);
      this.currentCollectionLog = null;
    }
  }

  /**
   * 获取所有日志
   */
  getAllLogs(): LogEntry[] {
    return this.logs;
  }

  /**
   * 获取所有采集日志
   */
  getAllCollectionLogs(): CollectionLog[] {
    return this.collectionLogs;
  }

  /**
   * 获取完整的导出数据
   */
  getExportData() {
    return {
      exportTime: new Date().toISOString(),
      exportVersion: '1.0',
      systemInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
      },
      summary: {
        totalLogs: this.logs.length,
        totalCollections: this.collectionLogs.length,
        successfulCollections: this.collectionLogs.filter((c) => c.status === 'success').length,
        failedCollections: this.collectionLogs.filter((c) => c.status === 'failed').length,
      },
      operationLogs: this.logs,
      collectionLogs: this.collectionLogs,
      statistics: this.generateStatistics(),
    };
  }

  /**
   * 生成统计数据
   */
  private generateStatistics() {
    const successfulCollections = this.collectionLogs.filter((c) => c.status === 'success');
    const failedCollections = this.collectionLogs.filter((c) => c.status === 'failed');

    const timings = successfulCollections
      .filter((c) => c.timingStats)
      .map((c) => ({
        raw: c.timingStats!.rawDurationMs,
        firstCrop: c.timingStats!.afterFirstCroppingMs,
        secondCrop: c.timingStats!.afterSecondCroppingMs,
      }));

    const qualities = successfulCollections
      .filter((c) => c.qualityScore)
      .map((c) => c.qualityScore!.score || 0);

    return {
      successRate: this.collectionLogs.length > 0 ? (successfulCollections.length / this.collectionLogs.length * 100).toFixed(2) + '%' : 'N/A',
      timingStats: timings.length > 0 ? {
        rawDuration: {
          min: Math.min(...timings.map((t) => t.raw)),
          max: Math.max(...timings.map((t) => t.raw)),
          avg: (timings.reduce((sum, t) => sum + t.raw, 0) / timings.length).toFixed(0),
        },
        afterFirstCropping: {
          min: Math.min(...timings.map((t) => t.firstCrop)),
          max: Math.max(...timings.map((t) => t.firstCrop)),
          avg: (timings.reduce((sum, t) => sum + t.firstCrop, 0) / timings.length).toFixed(0),
        },
        afterSecondCropping: {
          min: Math.min(...timings.map((t) => t.secondCrop)),
          max: Math.max(...timings.map((t) => t.secondCrop)),
          avg: (timings.reduce((sum, t) => sum + t.secondCrop, 0) / timings.length).toFixed(0),
        },
      } : {},
      qualityStats: qualities.length > 0 ? {
        min: Math.min(...qualities),
        max: Math.max(...qualities),
        avg: (qualities.reduce((sum, q) => sum + q, 0) / qualities.length).toFixed(0),
      } : {},
      errorSummary: this.summarizeErrors(),
    };
  }

  /**
   * 总结错误
   */
  private summarizeErrors() {
    const errorLogs = this.logs.filter((log) => log.level === 'error');
    const errorMap = new Map<string, number>();

    for (const log of errorLogs) {
      const key = log.category + ': ' + log.message;
      errorMap.set(key, (errorMap.get(key) || 0) + 1);
    }

    return Array.from(errorMap.entries()).map(([error, count]) => ({
      error,
      count,
    }));
  }

  /**
   * 清空日志
   */
  clear() {
    this.logs = [];
    this.collectionLogs = [];
    this.currentCollectionLog = null;
  }

  /**
   * 导出为JSON字符串
   */
  exportAsJSON(): string {
    return JSON.stringify(this.getExportData(), null, 2);
  }

  /**
   * 下载为文件
   */
  downloadAsFile() {
    const data = this.exportAsJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `operation-log-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// 创建全局实例
export const operationLogger = new OperationLogger();

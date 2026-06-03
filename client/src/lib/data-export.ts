/**
 * 数据导出工具模块
 * 
 * 功能：
 * - 导出采集数据为 CSV 格式
 * - 导出采集数据为 Excel 格式
 * - 支持按用户过滤
 */

interface CommandCollection {
  userId?: string;
  userName?: string;
  timestamp: number | Date;
  duration: number;
  data?: any;
}

interface CommandData {
  name: string;
  collections: CommandCollection[];
}

/**
 * 将采集数据导出为 CSV 格式
 */
export function exportToCSV(commands: CommandData[], filename?: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `emg-data-${timestamp}.csv`;
  const finalFilename = filename || defaultFilename;

  // CSV 头部
  const headers = ['指令名称', '用户名', '用户ID', '采集时间', '采集时长(秒)', '数据点数'];
  const rows: string[][] = [];

  // 收集数据行
  commands.forEach((cmd) => {
    cmd.collections.forEach((col) => {
      const timestamp = col.timestamp instanceof Date 
        ? col.timestamp.toLocaleString('zh-CN')
        : new Date(col.timestamp).toLocaleString('zh-CN');
      
      rows.push([
        cmd.name,
        col.userName || 'Unknown',
        col.userId || 'N/A',
        timestamp,
        col.duration.toFixed(2),
        (col.data?.length || 0).toString(),
      ]);
    });
  });

  // 转换为 CSV 字符串
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  // 下载文件
  downloadFile(csvContent, finalFilename, 'text/csv;charset=utf-8;');
}

/**
 * 将采集数据导出为 Excel 格式（使用 CSV 作为中间格式）
 * 注：这里使用 CSV 格式，Excel 可直接打开
 */
export function exportToExcel(commands: CommandData[], filename?: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  // 修复：改为 .csv 扩展名，不是 .xlsx
  // 因为我们导出的是 CSV 格式，不是真正的 Excel 二进制格式
  const defaultFilename = `emg-data-${timestamp}.csv`;
  const finalFilename = filename || defaultFilename;

  // 使用 CSV 格式
  const headers = ['指令名称', '用户名', '用户ID', '采集时间', '采集时长(秒)', '数据点数'];
  const rows: string[][] = [];

  commands.forEach((cmd) => {
    cmd.collections.forEach((col) => {
      const timestamp = col.timestamp instanceof Date 
        ? col.timestamp.toLocaleString('zh-CN')
        : new Date(col.timestamp).toLocaleString('zh-CN');
      
      rows.push([
        cmd.name,
        col.userName || 'Unknown',
        col.userId || 'N/A',
        timestamp,
        col.duration.toFixed(2),
        (col.data?.length || 0).toString(),
      ]);
    });
  });

  // 转换为 CSV 字符串
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  // 下载为 .csv 文件（正确的 MIME 类型）
  downloadFile(csvContent, finalFilename, 'text/csv;charset=utf-8;');
}

/**
 * 将采集数据导出为 JSON 格式
 */
export function exportToJSON(commands: CommandData[], filename?: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `emg-data-${timestamp}.json`;
  const finalFilename = filename || defaultFilename;

  const jsonContent = JSON.stringify(commands, null, 2);
  downloadFile(jsonContent, finalFilename, 'application/json;charset=utf-8;');
}

/**
 * 导出按用户分组的统计数据
 */
export function exportUserStatistics(commands: CommandData[]): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `emg-user-stats-${timestamp}.csv`;

  // 收集用户统计
  const userStats = new Map<string, {
    userId: string;
    userName: string;
    totalCollections: number;
    totalDuration: number;
    commands: Set<string>;
  }>();

  commands.forEach((cmd) => {
    cmd.collections.forEach((col) => {
      const userId = col.userId || 'Unknown';
      const userName = col.userName || 'Unknown';

      if (!userStats.has(userId)) {
        userStats.set(userId, {
          userId,
          userName,
          totalCollections: 0,
          totalDuration: 0,
          commands: new Set(),
        });
      }

      const stat = userStats.get(userId)!;
      stat.totalCollections += 1;
      stat.totalDuration += col.duration;
      stat.commands.add(cmd.name);
    });
  });

  // 转换为 CSV
  const headers = ['用户ID', '用户名', '采集次数', '总时长(秒)', '采集指令数'];
  const rows: string[][] = Array.from(userStats.values()).map(stat => [
    stat.userId,
    stat.userName,
    stat.totalCollections.toString(),
    stat.totalDuration.toFixed(2),
    stat.commands.size.toString(),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

/**
 * 辅助函数：下载文件
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
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
 * 识别结果导出接口
 */
export interface RecognitionResultForExport {
  // ✅ 修复：添加所有需要的字段
  predictedCommand: string;  // 预测的指令
  actualCommand?: string;    // 实际的指令（用户反馈）
  command: string;           // 向下兼容
  confidence: number;
  allScores?: Array<{ command: string; score: number }>;  // ✅ 修复：改为数组格式
  threshold?: number;        // ✅ 修复：添加阈值
  topK?: number;             // ✅ 修复：添加 topK
  isCorrect?: boolean;       // ✅ 修复：添加是否正确
  recordType?: string;       // ✅ 修复：添加记录类型（feedback/prediction）
  croppingMeta?: {
    stage: string;
    confidence: number;
    originalLength?: number;
    croppedLength?: number;
    normalizedLength?: number;
  };
  timestamp: number;
}

/**
 * 导出识别结果为CSV格式
 */
export function exportRecognitionResultsToCSV(
  results: RecognitionResultForExport[],
  filename?: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `recognition-results-${timestamp}.csv`;
  const finalFilename = filename || defaultFilename;

  // ✅ 修复：CSV 头部 - 添加所有需要的字段
  const headers = [
    '预测指令',
    '实际指令',
    '是否正确',
    '识别置信度',
    '阈值',
    'topK',
    '记录类型',
    '识别时间',
  ];
  const rows: string[][] = [];

  // 收集数据行
  results.forEach((result) => {
    const recognitionTime = new Date(result.timestamp).toLocaleString('zh-CN');
    rows.push([
      result.predictedCommand || 'unknown',
      result.actualCommand || '',
      result.isCorrect ? '是' : '否',
      result.confidence.toFixed(4),
      (result.threshold ?? 0).toFixed(4),
      (result.topK ?? 0).toString(),
      result.recordType || 'unknown',
      recognitionTime,
    ]);
  });

  // 转换为 CSV 字符串
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  // 下载文件
  downloadFile(csvContent, finalFilename, 'text/csv;charset=utf-8;');
}

/**
 * 导出识别结果为JSON格式
 */
export function exportRecognitionResultsToJSON(
  results: RecognitionResultForExport[],
  filename?: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `recognition-results-${timestamp}.json`;
  const finalFilename = filename || defaultFilename;

  const data = {
    exportTime: new Date().toISOString(),
    exportFormat: 'recognitionResults',
    resultCount: results.length,
    results: results.map((result) => ({
      predictedCommand: result.predictedCommand,
      actualCommand: result.actualCommand,
      command: result.command,
      confidence: result.confidence,
      allScores: result.allScores,
      threshold: result.threshold,
      topK: result.topK,
      isCorrect: result.isCorrect,
      recordType: result.recordType,
      croppingMeta: result.croppingMeta,
      timestamp: new Date(result.timestamp).toISOString(),
    })),
  };

  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, finalFilename, 'application/json;charset=utf-8;');
}

/**
 * 导出识别统计摘要
 */
export function exportRecognitionSummary(
  results: RecognitionResultForExport[],
  filename?: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `recognition-summary-${timestamp}.csv`;
  const finalFilename = filename || defaultFilename;

  // 按指令分组统计
  const commandStats = new Map<
    string,
    {
      command: string;
      count: number;
      avgConfidence: number;
      maxConfidence: number;
      minConfidence: number;
    }
  >();

  results.forEach((result) => {
    if (!commandStats.has(result.command)) {
      commandStats.set(result.command, {
        command: result.command,
        count: 0,
        avgConfidence: 0,
        maxConfidence: 0,
        minConfidence: 1,
      });
    }

    const stat = commandStats.get(result.command)!;
    stat.count += 1;
    stat.avgConfidence += result.confidence;
    stat.maxConfidence = Math.max(stat.maxConfidence, result.confidence);
    stat.minConfidence = Math.min(stat.minConfidence, result.confidence);
  });

  // 计算平均值
  commandStats.forEach((stat) => {
    stat.avgConfidence = stat.avgConfidence / stat.count;
  });

  // 转换为 CSV
  const headers = ['指令名称', '识别次数', '平均置信度', '最高置信度', '最低置信度'];
  const rows: string[][] = Array.from(commandStats.values()).map((stat) => [
    stat.command,
    stat.count.toString(),
    stat.avgConfidence.toFixed(4),
    stat.maxConfidence.toFixed(4),
    stat.minConfidence.toFixed(4),
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  downloadFile(csvContent, finalFilename, 'text/csv;charset=utf-8;');
}

/**
 * 导出采集数据统计摘要
 */
export function exportCollectionSummary(
  commands: CommandData[],
  filename?: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `collection-summary-${timestamp}.csv`;
  const finalFilename = filename || defaultFilename;

  // 转换为 CSV
  const headers = ['指令名称', '采集次数', '平均裁剪置信度'];
  const rows: string[][] = commands.map((cmd) => {
    const avgCroppingConfidence =
      cmd.collections.length > 0
        ? (
            cmd.collections.reduce(
              (sum, c) => sum + ((c as any).croppingMeta?.confidence ?? 0),
              0
            ) / cmd.collections.length
          ).toFixed(4)
        : 'N/A';

    return [cmd.name, cmd.collections.length.toString(), avgCroppingConfidence];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  downloadFile(csvContent, finalFilename, 'text/csv;charset=utf-8;');
}

/**
 * ✅ 修复：导出完整诊断数据（包含所有 trial 明细）
 * 这是真正的诊断导出，包含：
 * - 所有 commands summary
 * - 每次 recognition trial 的完整明细
 * - predictedCommand, actualCommand, isCorrect, confidence, allScores, threshold, topK, recordType
 * - waveform / cropping / normalization 元数据
 * - 每个指令的准确率和混淆情况
 */
export function exportCompleteDiagnosticData(
  results: RecognitionResultForExport[],
  commands?: any[],
  filename?: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `diagnostic-data-complete-${timestamp}.json`;
  const finalFilename = filename || defaultFilename;

  // 1. 计算每个指令的统计信息
  const commandStats = new Map<
    string,
    {
      command: string;
      totalTrials: number;
      correctTrials: number;
      accuracy: number;
      avgConfidence: number;
      maxConfidence: number;
      minConfidence: number;
      confusionMatrix: Map<string, number>;
    }
  >();

  results.forEach((result) => {
    const actualCmd = result.actualCommand || result.predictedCommand;
    
    if (!commandStats.has(actualCmd)) {
      commandStats.set(actualCmd, {
        command: actualCmd,
        totalTrials: 0,
        correctTrials: 0,
        accuracy: 0,
        avgConfidence: 0,
        maxConfidence: 0,
        minConfidence: 1,
        confusionMatrix: new Map(),
      });
    }

    const stat = commandStats.get(actualCmd)!;
    stat.totalTrials += 1;
    if (result.isCorrect) {
      stat.correctTrials += 1;
    }
    stat.avgConfidence += result.confidence;
    stat.maxConfidence = Math.max(stat.maxConfidence, result.confidence);
    stat.minConfidence = Math.min(stat.minConfidence, result.confidence);

    // 混淆矩阵
    const predicted = result.predictedCommand || 'unknown';
    const count = stat.confusionMatrix.get(predicted) || 0;
    stat.confusionMatrix.set(predicted, count + 1);
  });

  // 计算准确率和平均置信度
  commandStats.forEach((stat) => {
    stat.accuracy = stat.totalTrials > 0 ? stat.correctTrials / stat.totalTrials : 0;
    stat.avgConfidence = stat.totalTrials > 0 ? stat.avgConfidence / stat.totalTrials : 0;
  });

  // 2. 构建完整诊断数据
  const diagnosticData = {
    exportTime: new Date().toISOString(),
    exportFormat: 'completeDiagnosticData',
    version: '1.0',
    
    // 总体统计
    summary: {
      totalTrials: results.length,
      totalCommands: commandStats.size,
      overallAccuracy: results.length > 0 
        ? results.filter(r => r.isCorrect).length / results.length 
        : 0,
      avgConfidence: results.length > 0
        ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length
        : 0,
    },

    // 每个指令的统计
    commandsSummary: Array.from(commandStats.values()).map((stat) => ({
      command: stat.command,
      totalTrials: stat.totalTrials,
      correctTrials: stat.correctTrials,
      accuracy: stat.accuracy,
      avgConfidence: stat.avgConfidence,
      maxConfidence: stat.maxConfidence,
      minConfidence: stat.minConfidence,
      confusionMatrix: Object.fromEntries(stat.confusionMatrix),
    })),

    // 所有 trial 的完整明细
    trials: results.map((result, index) => ({
      trialIndex: index + 1,
      timestamp: new Date(result.timestamp).toISOString(),
      predictedCommand: result.predictedCommand,
      actualCommand: result.actualCommand,
      isCorrect: result.isCorrect,
      confidence: result.confidence,
      allScores: result.allScores,
      threshold: result.threshold,
      topK: result.topK,
      recordType: result.recordType,
      
      // 元数据
      croppingMeta: result.croppingMeta,
      normalizationMeta: (result as any).normalizationMeta,
      
      // 诊断信息
      diagnostics: {
        topPrediction: result.allScores?.[0] || { command: 'unknown', score: 0 },
        topKPredictions: result.allScores?.slice(0, result.topK || 5) || [],
        // ✅ 修复4：修复 0-1 与 0-100 混用
        // result.confidence 是 0-100，比较值应为 80 和 60，而不是 0.8 和 0.6
        confidenceLevel: result.confidence >= 80 ? 'high' : result.confidence >= 60 ? 'medium' : 'low',
        // result.threshold 是 0-1，需要乘以 100 转换为 0-100
        meetsThreshold: result.confidence >= ((result.threshold || 0.7) * 100),
      },
    })),

    // 导出的采集指令信息（可选）
    commands: commands ? commands.map(cmd => ({
      name: cmd.name,
      collectionCount: cmd.collections?.length || 0,
      createdAt: cmd.createdAt,
    })) : undefined,
  };

  const jsonContent = JSON.stringify(diagnosticData, null, 2);
  downloadFile(jsonContent, finalFilename, 'application/json;charset=utf-8;');
}

/**
 * 导出原始波形数据并分析 ch1 饱和情况
 * 
 * 用途：判断 ch1 是"真实饱和"还是"正常"
 * - 如果 ch1 中边界值 >20% → 真实饱和（波形大量触及边界，被硬件裁剪，形状丢失）
 * - 如果 ch1 中边界值 <5% → 正常（波形完整，很少触及边界，信号形状保留完好）
 * - 如果 ch1 中边界值 5-20% → 轻微饱和（波形部分触及边界，可能影响识别准确率）
 */
export function exportRawWaveform(
  processedWaveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    meta?: any;
  },
  commandName?: string,
  filename?: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `raw-waveform-${commandName || 'unknown'}-${timestamp}.json`;
  const finalFilename = filename || defaultFilename;

  // ✅ 分析 ch1 饱和情况
  const analyzeSaturation = (channel: number[], channelName: string) => {
    const boundaryValues = [2000, -2000, 4095, -4095, 0];
    let boundaryCount = 0;
    const boundaryMap = new Map<number, number>();

    channel.forEach((value) => {
      if (boundaryValues.includes(value)) {
        boundaryCount++;
        boundaryMap.set(value, (boundaryMap.get(value) || 0) + 1);
      }
    });

    const boundaryRatio = channel.length > 0 ? (boundaryCount / channel.length) * 100 : 0;
    // ✅ 修复：正确的诊断逻辑
    // 边界值频率高（>20%）= 真实饱和（波形被硬件裁剪）
    // 边界值频率低（<5%）= 正常（波形完整）
    // 边界值频率中等（5-20%）= 轻微饱和
    const isSaturated = boundaryRatio > 20;
    const isNormal = boundaryRatio < 5;
    const isMildSaturation = boundaryRatio >= 5 && boundaryRatio <= 20;

    return {
      channelName,
      totalPoints: channel.length,
      boundaryCount,
      boundaryRatio: boundaryRatio.toFixed(2) + '%',
      boundaryDistribution: Object.fromEntries(boundaryMap),
      min: Math.min(...channel),
      max: Math.max(...channel),
      mean: (channel.reduce((a, b) => a + b, 0) / channel.length).toFixed(2),
      std: (
        Math.sqrt(
          channel.reduce((sq, n) => sq + Math.pow(n - channel.reduce((a, b) => a + b, 0) / channel.length, 2), 0) /
            channel.length
        ) || 0
      ).toFixed(2),
      diagnosis: isSaturated
        ? '⚠️ 真实饱和：波形大量触及边界（>20%），采集链路饱和或被硬件裁剪，形状已丢失'
        : isMildSaturation
          ? '⚠️ 轻微饱和：波形部分触及边界（5-20%），可能影响识别准确率'
          : '✅ 正常：波形完整，边界值很少（<5%），信号形状保留完好',
      isSaturated,
      isMildSaturation,
      isNormal,
    };
  };

  const ch1Analysis = analyzeSaturation(processedWaveform.ch1, 'ch1');
  const ch2Analysis = analyzeSaturation(processedWaveform.ch2, 'ch2');
  const ch3Analysis = analyzeSaturation(processedWaveform.ch3, 'ch3');

  // ✅ 构建导出数据
  const exportData = {
    exportTime: new Date().toISOString(),
    commandName: commandName || 'unknown',
    
    // 原始波形数据
    waveforms: {
      ch1: processedWaveform.ch1,
      ch2: processedWaveform.ch2,
      ch3: processedWaveform.ch3,
    },

    // 饱和分析
    saturationAnalysis: {
      ch1: ch1Analysis,
      ch2: ch2Analysis,
      ch3: ch3Analysis,
      summary: {
        saturatedChannels: [
          ...(ch1Analysis.isSaturated ? ['ch1'] : []),
          ...(ch2Analysis.isSaturated ? ['ch2'] : []),
          ...(ch3Analysis.isSaturated ? ['ch3'] : []),
        ],
        mildSaturationChannels: [
          ...(ch1Analysis.isMildSaturation ? ['ch1'] : []),
          ...(ch2Analysis.isMildSaturation ? ['ch2'] : []),
          ...(ch3Analysis.isMildSaturation ? ['ch3'] : []),
        ],
        normalChannels: [
          ...(ch1Analysis.isNormal ? ['ch1'] : []),
          ...(ch2Analysis.isNormal ? ['ch2'] : []),
          ...(ch3Analysis.isNormal ? ['ch3'] : []),
        ],
        recommendation:
          ch1Analysis.isSaturated || ch2Analysis.isSaturated || ch3Analysis.isSaturated
            ? '建议：调整采集增益或电极位置，避免信号饱和'
            : ch1Analysis.isMildSaturation || ch2Analysis.isMildSaturation || ch3Analysis.isMildSaturation
              ? '建议：监测信号质量，可能需要调整采集参数'
              : '建议：数据质量良好，可继续使用',
      },
    },

    // 元数据
    metadata: processedWaveform.meta || {},
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  downloadFile(jsonContent, finalFilename, 'application/json;charset=utf-8;');

  // 控制台输出诊断结果
  console.log('[Raw Waveform Export] Saturation Analysis:');
  console.log(`  ch1: ${ch1Analysis.diagnosis}`);
  console.log(`  ch2: ${ch2Analysis.diagnosis}`);
  console.log(`  ch3: ${ch3Analysis.diagnosis}`);
  console.log(`  Summary: ${exportData.saturationAnalysis.summary.recommendation}`);
}

/**
 * 导出识别结果中的原始波形数据（用于批量分析）
 */
export function exportRecognitionRawWaveforms(
  recognitionResults: Array<{
    predictedCommand?: string;
    timestamp?: number;
    processedWaveform?: {
      ch1: number[];
      ch2: number[];
      ch3: number[];
      meta?: any;
    };
  }>,
  filename?: string
): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultFilename = `recognition-raw-waveforms-${timestamp}.json`;
  const finalFilename = filename || defaultFilename;

  // 分析每个识别结果中的波形
  const waveformAnalyses = recognitionResults
    .filter((r) => r.processedWaveform)
    .map((r, index) => {
      const ch1Analysis = analyzeSaturationHelper(r.processedWaveform!.ch1, 'ch1');
      const ch2Analysis = analyzeSaturationHelper(r.processedWaveform!.ch2, 'ch2');
      const ch3Analysis = analyzeSaturationHelper(r.processedWaveform!.ch3, 'ch3');

      return {
        resultIndex: index + 1,
        predictedCommand: r.predictedCommand || 'unknown',
        timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : 'unknown',
        saturationAnalysis: {
          ch1: ch1Analysis,
          ch2: ch2Analysis,
          ch3: ch3Analysis,
        },
      };
    });

  const exportData = {
    exportTime: new Date().toISOString(),
    totalResults: recognitionResults.length,
    analyzedResults: waveformAnalyses.length,
    waveformAnalyses,
    overallSummary: {
      totalSaturatedCases: waveformAnalyses.filter(
        (w) => w.saturationAnalysis.ch1.isSaturated || w.saturationAnalysis.ch2.isSaturated || w.saturationAnalysis.ch3.isSaturated
      ).length,
      saturatedChannelFrequency: {
        ch1: waveformAnalyses.filter((w) => w.saturationAnalysis.ch1.isSaturated).length,
        ch2: waveformAnalyses.filter((w) => w.saturationAnalysis.ch2.isSaturated).length,
        ch3: waveformAnalyses.filter((w) => w.saturationAnalysis.ch3.isSaturated).length,
      },
    },
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  downloadFile(jsonContent, finalFilename, 'application/json;charset=utf-8;');
}

/**
 * 辅助函数：分析饱和情况
 */
function analyzeSaturationHelper(channel: number[], channelName: string) {
  const boundaryValues = [2000, -2000, 4095, -4095, 0];
  let boundaryCount = 0;
  const boundaryMap = new Map<number, number>();

  channel.forEach((value) => {
    if (boundaryValues.includes(value)) {
      boundaryCount++;
      boundaryMap.set(value, (boundaryMap.get(value) || 0) + 1);
    }
  });

  const boundaryRatio = channel.length > 0 ? (boundaryCount / channel.length) * 100 : 0;
  const isSaturated = boundaryRatio > 20;
  const isMildSaturation = boundaryRatio >= 5 && boundaryRatio <= 20;
  const isNormal = boundaryRatio < 5;

  return {
    channelName,
    totalPoints: channel.length,
    boundaryCount,
    boundaryRatio: boundaryRatio.toFixed(2) + '%',
    boundaryDistribution: Object.fromEntries(boundaryMap),
    min: Math.min(...channel),
    max: Math.max(...channel),
    mean: (channel.reduce((a, b) => a + b, 0) / channel.length).toFixed(2),
    std: (
      Math.sqrt(
        channel.reduce((sq, n) => sq + Math.pow(n - channel.reduce((a, b) => a + b, 0) / channel.length, 2), 0) /
          channel.length
      ) || 0
    ).toFixed(2),
    diagnosis: isSaturated
      ? '⚠️ 真实饱和（>20%）'
      : isMildSaturation
        ? '⚠️ 轻微饱和（5-20%）'
        : '✅ 正常（<5%）',
    isSaturated,
    isMildSaturation,
    isNormal,
  };
}

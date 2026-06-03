/**
 * 诊断导出模块
 * 支持导出识别诊断数据用于分析
 */

import { emgDatabase } from './db';

export interface WaveformStats {
  length: number;
  rms: number;
  peak: number;
  variance: number;
  isZero: boolean;
  isEmpty: boolean;
  isAbnormal: boolean;
}

export interface CollectionDiagnostics {
  collectionId: string;
  index: number;
  timestamp: number;
  waveformLength: number;
  ch1Stats: WaveformStats;
  ch2Stats: WaveformStats;
  ch3Stats: WaveformStats;
  croppingMeta?: any;
  normalizationMeta?: any;
}

export interface CommandSummary {
  commandName: string;
  collectionCount: number;
  collections: CollectionDiagnostics[];
  allLengthsAre512: boolean;
  hasAbnormalWaveforms: boolean;
  averageRMS: {
    ch1: number;
    ch2: number;
    ch3: number;
  };
}

export interface RecognitionTrial {
  timestamp: number;
  predictedCommand: string;
  actualCommand?: string;
  isCorrect?: boolean;
  confidence: number;
  threshold: number;
  allScores: Array<{ command: string; score: number }>;
  top1Score: number;
  top2Score: number;
  top1Top2Diff: number;
  topK: number;
  channelWeights: {
    ch1: number;
    ch2: number;
    ch3: number;
  };
  processedLength: number;
  croppingMeta?: any;
  normalizationMeta?: any;
}

export interface PerCommandAccuracy {
  commandName: string;
  totalTests: number;
  correctTests: number;
  accuracy: number;
  confusionMatrix: Map<string, number>;
}

export interface FeatureSeparation {
  commandPair: string;
  averageSimilarity: number;
  isHighRisk: boolean;
}

export interface DiagnosisData {
  timestamp: number;
  commandsSummary: CommandSummary[];
  recognitionTrials: RecognitionTrial[];
  perCommandAccuracy: PerCommandAccuracy[];
  featureSeparation: FeatureSeparation[];
  diagnosis: {
    insufficientSamples: boolean;
    abnormalSampleQuality: string[];
    thresholdIssue: string;
    smallTop1Top2Diff: boolean;
    ch2ContributionAnalysis: string;
    dataContamination: string[];
  };
}

/**
 * 计算波形统计信息
 */
export function calculateWaveformStats(waveform: number[]): WaveformStats {
  if (!waveform || waveform.length === 0) {
    return {
      length: 0,
      rms: 0,
      peak: 0,
      variance: 0,
      isZero: true,
      isEmpty: true,
      isAbnormal: true,
    };
  }

  const length = waveform.length;
  
  // 检查是否全零
  const isZero = waveform.every(v => v === 0);
  
  // 计算 RMS
  const rms = Math.sqrt(waveform.reduce((sum, v) => sum + v * v, 0) / length);
  
  // 计算峰值
  const peak = Math.max(...waveform.map(v => Math.abs(v)));
  
  // 计算方差
  const mean = waveform.reduce((sum, v) => sum + v, 0) / length;
  const variance = waveform.reduce((sum, v) => sum + (v - mean) ** 2, 0) / length;
  
  // 检查异常
  const isAbnormal = length < 400 || length > 600 || isZero || rms < 5;
  
  return {
    length,
    rms,
    peak,
    variance,
    isZero,
    isEmpty: false,
    isAbnormal,
  };
}

/**
 * 生成命令摘要
 */
export async function generateCommandsSummary(): Promise<CommandSummary[]> {
  const commands = await emgDatabase.getAllCommands();
  
  const summary: CommandSummary[] = [];
  
  for (const cmd of commands) {
    const collections = cmd.collections || [];
    const collectionDiagnostics: CollectionDiagnostics[] = [];
    
    const ch1Stats: number[] = [];
    const ch2Stats: number[] = [];
    const ch3Stats: number[] = [];
    
    for (const collection of collections) {
      const ch1 = collection.waveform?.ch1 || [];
      const ch2 = collection.waveform?.ch2 || [];
      const ch3 = collection.waveform?.ch3 || [];
      
      const ch1Stat = calculateWaveformStats(ch1);
      const ch2Stat = calculateWaveformStats(ch2);
      const ch3Stat = calculateWaveformStats(ch3);
      
      ch1Stats.push(ch1Stat.rms);
      ch2Stats.push(ch2Stat.rms);
      ch3Stats.push(ch3Stat.rms);
      
      collectionDiagnostics.push({
        collectionId: collection.id || `collection-${collection.index}`,
        index: collection.index || 0,
        timestamp: collection.timestamp?.getTime?.() || Date.now(),
        waveformLength: ch1.length,
        ch1Stats: ch1Stat,
        ch2Stats: ch2Stat,
        ch3Stats: ch3Stat,
        croppingMeta: collection.croppingMeta,
        normalizationMeta: collection.normalizationMeta,
      });
    }
    
    const allLengthsAre512 = collectionDiagnostics.every(c => c.waveformLength === 512);
    const hasAbnormalWaveforms = collectionDiagnostics.some(c => 
      c.ch1Stats.isAbnormal || c.ch2Stats.isAbnormal || c.ch3Stats.isAbnormal
    );
    
    summary.push({
      commandName: cmd.name,
      collectionCount: collections.length,
      collections: collectionDiagnostics,
      allLengthsAre512,
      hasAbnormalWaveforms,
      averageRMS: {
        ch1: ch1Stats.length > 0 ? ch1Stats.reduce((a, b) => a + b) / ch1Stats.length : 0,
        ch2: ch2Stats.length > 0 ? ch2Stats.reduce((a, b) => a + b) / ch2Stats.length : 0,
        ch3: ch3Stats.length > 0 ? ch3Stats.reduce((a, b) => a + b) / ch3Stats.length : 0,
      },
    });
  }
  
  return summary;
}

/**
 * 生成识别准确率统计
 */
export function generatePerCommandAccuracy(trials: RecognitionTrial[]): PerCommandAccuracy[] {
  const commandMap = new Map<string, { correct: number; total: number; confusions: Map<string, number> }>();
  
  for (const trial of trials) {
    if (!trial.actualCommand) continue;
    
    if (!commandMap.has(trial.actualCommand)) {
      commandMap.set(trial.actualCommand, {
        correct: 0,
        total: 0,
        confusions: new Map(),
      });
    }
    
    const stats = commandMap.get(trial.actualCommand)!;
    stats.total++;
    
    if (trial.isCorrect) {
      stats.correct++;
    } else {
      const predicted = trial.predictedCommand;
      stats.confusions.set(predicted, (stats.confusions.get(predicted) || 0) + 1);
    }
  }
  
  const result: PerCommandAccuracy[] = [];
  
  commandMap.forEach((stats, commandName) => {
    result.push({
      commandName,
      totalTests: stats.total,
      correctTests: stats.correct,
      accuracy: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
      confusionMatrix: stats.confusions,
    });
  });
  
  return result;
}

/**
 * 生成诊断数据
 */
export async function generateDiagnosisData(trials: RecognitionTrial[]): Promise<DiagnosisData> {
  const commandsSummary = await generateCommandsSummary();
  const perCommandAccuracy = generatePerCommandAccuracy(trials);
  
  // 检查样本不足
  const insufficientSamples = commandsSummary.some(cmd => cmd.collectionCount < 5);
  
  // 检查异常样本质量
  const abnormalSampleQuality = commandsSummary
    .filter(cmd => cmd.hasAbnormalWaveforms)
    .map(cmd => `${cmd.commandName}: ${cmd.collectionCount} 条样本中有异常`);
  
  // 检查阈值问题
  let thresholdIssue = '正常';
  const avgConfidence = trials.length > 0 
    ? trials.reduce((sum, t) => sum + t.confidence, 0) / trials.length 
    : 0;
  if (avgConfidence < 0.3) {
    thresholdIssue = '置信度过低，建议降低阈值';
  } else if (avgConfidence > 0.8 && perCommandAccuracy.some(cmd => cmd.accuracy < 50)) {
    thresholdIssue = '置信度过高，建议降低阈值';
  }
  
  // 检查 top1/top2 分差
  const smallTop1Top2Diff = trials.some(t => t.top1Top2Diff < 5);
  
  // 分析 ch2 贡献
  let ch2ContributionAnalysis = 'ch2 权重为 0.60，需要通过特征分析验证';
  
  // 检查数据污染
  const dataContamination: string[] = [];
  const allPredicted = trials.map(t => t.predictedCommand);
  if (allPredicted.includes('unknown')) {
    dataContamination.push('存在 unknown 指令污染');
  }
  
  return {
    timestamp: Date.now(),
    commandsSummary,
    recognitionTrials: trials,
    perCommandAccuracy,
    featureSeparation: [],
    diagnosis: {
      insufficientSamples,
      abnormalSampleQuality,
      thresholdIssue,
      smallTop1Top2Diff,
      ch2ContributionAnalysis,
      dataContamination,
    },
  };
}

/**
 * 导出诊断数据为 JSON
 */
export async function exportDiagnosisJSON(trials: RecognitionTrial[]): Promise<string> {
  const diagnosis = await generateDiagnosisData(trials);
  return JSON.stringify(diagnosis, (key, value) => {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    return value;
  }, 2);
}

/**
 * 默念测试页面 - 高端商业风格
 * 
 * 功能：
 * - 实时识别肌电信号
 * - 显示识别结果和置信度
 * - 支持连续多指令识别
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Divider,
} from '@/components/PremiumComponents';
import { EnhancedWaveformVisualization } from '@/components/EnhancedWaveformVisualization';
import { HardwareStatusComponent } from '@/components/HardwareStatus';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { extractFullFeatures, normalizeFeatures } from '@/lib/dsp-processor';
// import { dtwFeatures } from '@/lib/dtw-algorithm';  // 不再使用DTW
import { adaptiveThresholdManager } from '@/lib/multi-channel-fusion';
import { detectElectrodeStatus, isElectrodeStatusAcceptable, calculateSignalStats } from '@/lib/electrode-detection';
import { ElectrodeDetectionPanel } from '@/components/ElectrodeDetectionPanel';
import { cnnModelManager, CommandTrainingData } from '@/lib/cnn-model-manager';
import { processRecognitionFeedback, getCalibrationRecords } from '@/lib/auto-calibration-system';
import { calculateCollectionQuality, calculateQualityWeightedSimilarity } from '@/lib/collection-quality-scoring';
import { emgDatabase } from '@/lib/db';
import { submitUserFeedback, calculatePerformanceMetrics } from '@/lib/model-feedback-system';
import { processTestWaveform, processReferenceWaveform, extractAndFuseFeatures, calculateFeatureSimilarity, isProcessingAcceptable, type ProcessedWaveform } from '@/lib/recognition-processing';
import { adaptiveFilterMultiChannel } from '@/lib/adaptive-waveform-filtering';
import { FIXED_WAVEFORM_LENGTH } from '@shared/instruction-length-spec';
import { showRecognitionCroppingToast } from '@/lib/cropping-completion-toast';

interface RecognitionResult {
  historyId?: string;
  timestamp: Date;
  command: string;
  confidence: number;
  allScores: Array<any>;
  processingStatus?: string;
  userCorrection?: string;
  isCorrect?: boolean;
  processedWaveform?: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    meta?: any;
  };
  threshold?: number;
  topK?: number;
  top1Score?: number;
  top2Score?: number;
  scoreMargin?: number;
  channelWeights?: { ch1: number; ch2: number; ch3: number };
  channelSNR?: { ch1: number; ch2: number; ch3: number };
  // ✅ 修复2：添加原始分数诊断字段
  allRawScores?: number[];
  top1?: number;
  top3Median?: number;
  allMedian?: number;
  sampleCount?: number;
  // ✅ 修复3：添加通道诊断信息
  channelDiagnostics?: { ch1: any; ch2: any; ch3: any };
  // ✅ 修复1：添加匹配集合分数
  matchedCollectionScores?: number[];
}

interface StoredCommand {
  name: string;
  collections: Array<{
    waveform: { ch1: number[]; ch2: number[]; ch3: number[] };
    trimStart?: number;  // 裁切起始位置
    trimEnd?: number;    // 裁切结束位置
    croppingMeta?: {
      startIdx: number;
      endIdx: number;
      confidence: number;
      method: string;
      stage: string;
      reason: string;
    };
    normalizationMeta?: {
      originalLength: number;
      targetLength: number;
      timestamp: number;
    };
  }>;
  createdAt: Date;
}

const isUncertainRecognition = (command: string): boolean => {
  return command.startsWith('❌ 识别不确定');
};

const medianScore = (scores: number[]): number => {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
};

const createRecognitionHistoryId = (): string => {
  return `recognition-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const MIN_RECOGNITION_SAMPLES = 50;

const isValidSerialSample = (data: any): boolean => {
  return Number.isFinite(data?.channel1) &&
    Number.isFinite(data?.channel2) &&
    Number.isFinite(data?.channel3);
};

interface FeatureNormalizer {
  means: number[];
  stds: number[];
}

const meanNumber = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const stdNumber = (values: number[]): number => {
  if (values.length === 0) return 1;
  const mean = meanNumber(values);
  const variance = meanNumber(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) || 1;
};

const rmsSignal = (signal: number[]): number => {
  if (signal.length === 0) return 0;
  return Math.sqrt(meanNumber(signal.map((value) => value * value)));
};

const meanAbsSignal = (signal: number[]): number => {
  if (signal.length === 0) return 0;
  return meanNumber(signal.map((value) => Math.abs(value)));
};

const peakToPeakSignal = (signal: number[]): number => {
  if (signal.length === 0) return 0;
  return Math.max(...signal) - Math.min(...signal);
};

const diffSignal = (signal: number[]): number[] => {
  const diffs: number[] = [];
  for (let i = 1; i < signal.length; i++) {
    diffs.push(signal[i] - signal[i - 1]);
  }
  return diffs;
};

const extractAmplitudeFeatureVector = (waveform: { ch1: number[]; ch2: number[]; ch3: number[] }): number[] => {
  const features: number[] = [];
  for (const channel of [waveform.ch1, waveform.ch2, waveform.ch3]) {
    features.push(
      rmsSignal(channel),
      meanAbsSignal(channel),
      peakToPeakSignal(channel),
      rmsSignal(diffSignal(channel))
    );
  }
  return features;
};

const buildFeatureNormalizer = (vectors: number[][]): FeatureNormalizer => {
  if (vectors.length === 0) {
    return { means: [], stds: [] };
  }

  const dimensionCount = vectors[0].length;
  const means: number[] = [];
  const stds: number[] = [];
  for (let dim = 0; dim < dimensionCount; dim++) {
    const values = vectors.map((vector) => vector[dim] ?? 0);
    means.push(meanNumber(values));
    stds.push(stdNumber(values));
  }
  return { means, stds };
};

const normalizeFeatureVector = (vector: number[], normalizer: FeatureNormalizer): number[] => {
  return vector.map((value, index) => {
    const mean = normalizer.means[index] ?? 0;
    const std = normalizer.stds[index] || 1;
    return (value - mean) / std;
  });
};

const distanceSimilarity = (a: number[], b: number[]): number => {
  if (a.length === 0 || a.length !== b.length) return 0;
  const distance = Math.sqrt(a.reduce((sum, value, index) => {
    return sum + (value - b[index]) ** 2;
  }, 0));
  return 100 / (1 + distance / Math.sqrt(a.length));
};

export default function RecognitionMode() {
  const [location, navigate] = useLocation();
  const { isConnected, onDataReceived } = useSerialConnectionContext();

  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionTime, setRecognitionTime] = useState(0);
  const [currentWaveform, setCurrentWaveform] = useState<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });
  const [recognitionHistory, setRecognitionHistory] = useState<RecognitionResult[]>([]);
  const [useCNNModel, setUseCNNModel] = useState(false);
  const [cnnModelLoaded, setCNNModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCommands, setSavedCommands] = useState<StoredCommand[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);

  // ✅ 修复5：实现计算信噪比（SNR）的函数
  // ✅ 修复3：计算通道诊断信息：基于原始波形质量指标
  const calculateChannelDiagnostics = (signal: number[]): any => {
    if (!signal || signal.length === 0) {
      return { min: 0, max: 0, peak: 0, mean: 0, rms: 0, variance: 0, saturationRatio: 0, zeroRatio: 0, quality: 'poor' };
    }
    
    const min = Math.min(...signal);
    const max = Math.max(...signal);
    const peak = Math.max(Math.abs(min), Math.abs(max));
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const rms = Math.sqrt(signal.reduce((a, b) => a + b * b, 0) / signal.length);
    const variance = signal.reduce((a, b) => a + (b - mean) * (b - mean), 0) / signal.length;
    
    // 饱和比：信号是否接近最大值（饱和风险）
    // ✅ 修复3：上一轮真实数据中 ch1 曾出现 2000 触顶，修改为 1995
    const saturationThreshold = 1995;
    const saturationRatio = signal.filter(v => Math.abs(v) > saturationThreshold).length / signal.length;
    
    // 零值比：信号是否低波动
    const zeroThreshold = 50;
    const zeroRatio = signal.filter(v => Math.abs(v) < zeroThreshold).length / signal.length;
    
    // 计算通道质量
    let quality = 'poor';
    if (rms > 100 && variance > 500 && saturationRatio < 0.1 && zeroRatio < 0.3) {
      quality = 'good';
    } else if (rms > 50 && variance > 200 && saturationRatio < 0.2 && zeroRatio < 0.5) {
      quality = 'fair';
    }
    
    return { min, max, peak, mean, rms, variance, saturationRatio, zeroRatio, quality };
  };
  
  // ✅ 修复：计算通道权重。ch2 是当前硬件安装下的主判别通道，质量评分只做校准，不覆盖先验。
  const calculateChannelWeights = (ch1Diag: any, ch2Diag: any, ch3Diag: any): any => {
    const qualityScore = (quality: string) => {
      switch (quality) {
        case 'good': return 1.2;
        case 'fair': return 1.0;
        default: return 0.6;
      }
    };
    
    const score1 = 0.25 * qualityScore(ch1Diag.quality);
    const score2 = 0.65 * qualityScore(ch2Diag.quality);
    const score3 = 0.10 * qualityScore(ch3Diag.quality);
    
    const totalScore = score1 + score2 + score3;
    const weight1 = totalScore > 0 ? score1 / totalScore : 0.30;
    const weight2 = totalScore > 0 ? score2 / totalScore : 0.60;
    const weight3 = totalScore > 0 ? score3 / totalScore : 0.10;
    
    return { ch1: weight1, ch2: weight2, ch3: weight3 };
  };
  const [adaptiveThreshold, setAdaptiveThreshold] = useState(0.7);
  
  // 电极检测状态
  const [showElectrodeCheck, setShowElectrodeCheck] = useState(false);
  const [electrodeCheckResult, setElectrodeCheckResult] = useState<any>(null);
  const [globalElectrodeBaseline, setGlobalElectrodeBaseline] = useState<any>(null);
  
  // 反馈面板状态
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastRecognitionResult, setLastRecognitionResult] = useState<RecognitionResult | null>(null);
  const [selectedTrueCommand, setSelectedTrueCommand] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const waveformBufferRef = useRef<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });
  const lastRecognitionSampleAtRef = useRef<number | null>(null);

  // 从 IndexedDB 加载已保存的指令和自适应阈值
  useEffect(() => {
    (async () => {
      try {
        const saved = await emgDatabase.getAllCommands();
        if (saved && saved.length > 0) {
          // 对相同名称的指令进行合并：将所有采集数据合并到一个指令对象下
          // 这样反馈面板中不会出现重复指令，且保留所有采集数据
          const commandsMap = new Map<string, any>();
          saved.forEach((cmd: any) => {
            if (commandsMap.has(cmd.name)) {
              // 如果已存在相同名称的指令，合并采集数据
              const existing = commandsMap.get(cmd.name);
              existing.collections = [
                ...existing.collections,
                ...(cmd.collections || [])
              ];
              // 更新createdAt为最早的时间
              const existingTime = new Date(existing.createdAt).getTime();
              const newTime = new Date(cmd.createdAt).getTime();
              if (newTime < existingTime) {
                existing.createdAt = new Date(cmd.createdAt);
              }
            } else {
              // 新的指令名称，直接添加
              commandsMap.set(cmd.name, {
                name: cmd.name,
                collections: cmd.collections || [],
                createdAt: new Date(cmd.createdAt),
              });
            }
          });
          const commands = Array.from(commandsMap.values());
          setSavedCommands(commands);
        }
      } catch (error) {
        console.error('加载指令失败:', error);
        // 不再使用localStorage备用，确保数据一致性
        setSavedCommands([]);
      }
    })();
    
    // 加载自适应阈值
    adaptiveThresholdManager.loadFromStorage();
    setAdaptiveThreshold(adaptiveThresholdManager.getThreshold());
  }, []);

  // 注册数据接收回调
  useEffect(() => {
    const handleDataReceived = (data: any) => {
      if (isRecognizing) {
        if (!isValidSerialSample(data)) {
          console.warn('[识别] 收到无效串口样本，已忽略:', data);
          return;
        }

        waveformBufferRef.current.ch1.push(data.channel1);
        waveformBufferRef.current.ch2.push(data.channel2);
        waveformBufferRef.current.ch3.push(data.channel3);
        lastRecognitionSampleAtRef.current = data.timestamp || Date.now();

        // 实时显示（最多显示 3000 个点，约6秒采集时长）
        setCurrentWaveform((prev) => ({
          ch1: [...prev.ch1, data.channel1].slice(-3000),
          ch2: [...prev.ch2, data.channel2].slice(-3000),
          ch3: [...prev.ch3, data.channel3].slice(-3000),
        }));
      }
    };

    onDataReceived(handleDataReceived);
  }, [isRecognizing, onDataReceived]);

  // 自动停止识别（3秒后）
  useEffect(() => {
    if (isRecognizing && recognitionTime >= 3) {
      console.log('[识别] 3秒时间到，自动停止识别');
      handleStopRecognition();
    }
  }, [isRecognizing, recognitionTime]);

  // 检查 CNN 模型是否已加载
  useEffect(() => {
    let isMounted = true;
    
    const loadCNNModel = async () => {
      try {
        const modelLoaded = await cnnModelManager.loadModel();
        if (isMounted) {
          setCNNModelLoaded(modelLoaded);
          if (modelLoaded) {
            setUseCNNModel(true);
          }
        }
      } catch (error) {
        console.error('[RecognitionMode] CNN模型加载失败:', error);
        if (isMounted) {
          setCNNModelLoaded(false);
        }
      }
    };
    
    loadCNNModel();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // 计算欧几里得距离
  const euclideanDistance = (a: number[], b: number[]): number => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  };

  // 计算欧氏距离相似度
  const calculateSimilarity = (testFeatures: number[], refFeatures: number[]): number => {
    if (testFeatures.length !== refFeatures.length) {
      return 0;
    }
    
    // 计算欧氏距离
    let sumSquaredDiff = 0;
    for (let i = 0; i < testFeatures.length; i++) {
      const diff = testFeatures[i] - refFeatures[i];
      sumSquaredDiff += diff * diff;
    }
    const euclideanDist = Math.sqrt(sumSquaredDiff);
    
    // 转换为相似度（0-100）
    // 假设最大距离为 10，超过 10 的距离相似度为 0
    return Math.max(0, 100 - (euclideanDist / 10) * 100);
  };

  const addRecognitionHistoryRecord = (record: RecognitionResult) => {
    const recordWithId: RecognitionResult = {
      ...record,
      historyId: record.historyId || createRecognitionHistoryId(),
    };
    setRecognitionHistory(prevHistory => [recordWithId, ...prevHistory].slice(0, 50));
  };

  // 开始识别
  // 检查电极状态
  const handleCheckElectrode = async () => {
    if (!isConnected) {
      setError('请先连接 STM32 设备');
      return;
    }

    // 从 IndexedDB 加载全局电极基准
    try {
      const baseline = await emgDatabase.getCalibration();
      if (!baseline) {
        setError('系统未采集电极基准，请在调试页面采集');
        return;
      }
      setGlobalElectrodeBaseline(baseline);
      setShowElectrodeCheck(true);
    } catch (err) {
      setError('电极基准数据损坏，请重新采集');
    }
  };

  const handleStartRecognition = () => {
    if (!isConnected) {
      setError('请先连接 STM32 设备');
      return;
    }

    if (savedCommands.length === 0) {
      setError('请先完成采集训练');
      return;
    }

    // 检查电极状态
    if (electrodeCheckResult && !isElectrodeStatusAcceptable(electrodeCheckResult)) {
      setError('电极状态不符合要求，请先调节电极');
      return;
    }

    setIsRecognizing(true);
    setError(null);
    setShowFeedback(false);
    setLastRecognitionResult(null);
    setSelectedTrueCommand('');
    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
    waveformBufferRef.current = { ch1: [], ch2: [], ch3: [] };
    lastRecognitionSampleAtRef.current = null;
    setRecognitionTime(0);
    setShowElectrodeCheck(false);
    setElectrodeCheckResult(null);

    // 计时器
    timerRef.current = setInterval(() => {
      setRecognitionTime((t) => t + 1);
    }, 1000);
  };

  // 停止识别
  const handleStopRecognition = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsRecognizing(false);

    const sampleCount = waveformBufferRef.current.ch1.length;
    console.log(`[识别] 停止识别，采集到 ${sampleCount} 个有效样本`);

    if (sampleCount < MIN_RECOGNITION_SAMPLES) {
      const lastSampleText = lastRecognitionSampleAtRef.current
        ? `最后样本时间: ${new Date(lastRecognitionSampleAtRef.current).toLocaleTimeString()}`
        : '未收到任何有效串口样本';
      const errorMsg = `未采集到足够有效信号（${sampleCount}/${MIN_RECOGNITION_SAMPLES}），请确认设备仍在输出数据后重试。${lastSampleText}`;
      console.warn('[识别]', errorMsg);
      setError(errorMsg);
      setShowFeedback(false);
      setLastRecognitionResult(null);
      addRecognitionHistoryRecord({
        timestamp: new Date(),
        command: '无法识别',
        confidence: 0,
        allScores: [],
        processingStatus: errorMsg,
      });
      return;
    }

    // 识别
    if (sampleCount > 0) {
      let result: RecognitionResult;

      // 使用与采集相同的处理流程：空白裁剪 + 缩放到统一长度
      const processedWaveform = processTestWaveform(
        waveformBufferRef.current.ch1,
        waveformBufferRef.current.ch2,
        waveformBufferRef.current.ch3
      );

      // 显示处理完成提示
      const originalLength = waveformBufferRef.current.ch1.length;
      // 获取裁剪后但未缩放的长度
      const croppingMeta = processedWaveform.meta.croppingMeta;
      const croppedLength = croppingMeta.endIdx - croppingMeta.startIdx;
      const processedLength = processedWaveform.ch1.length;
      showRecognitionCroppingToast({
        originalLength,
        croppedLength,  // 这是裁剪后的长度
        targetLength: 512,
        isCroppingSuccess: isProcessingAcceptable(processedWaveform),
        isScalingSuccess: processedLength === 512,
      });

      // 检查处理结果
      if (!isProcessingAcceptable(processedWaveform)) {
        const errorMsg = `信号质量不达标: ${croppingMeta.reason}，请重新测试`;
        console.warn(errorMsg);
        setError(errorMsg);
        addRecognitionHistoryRecord({
          timestamp: new Date(),
          command: '无法识别',
          confidence: 0,
          allScores: [],
          processingStatus: processedWaveform.meta.croppingMeta.stage,
        });
        return;
      }

      // 使用处理后的波形进行识别
      const normalizedWaveform = {
        ch1: processedWaveform.ch1,
        ch2: processedWaveform.ch2,
        ch3: processedWaveform.ch3,
      };

      if (useCNNModel && cnnModelLoaded) {
        // 使用 CNN 模型识别
        const cnnResult = cnnModelManager.recognize(
          normalizedWaveform.ch1,
          normalizedWaveform.ch2,
          normalizedWaveform.ch3,
          confidenceThreshold
        );

        if (cnnResult.success) {
          const scores = cnnResult.allProbabilities?.map(p => ({
            command: p.command,
            score: p.probability * 100
          })) || [];

          result = {
            timestamp: new Date(),
            command: cnnResult.command || '❌ 识别不确定',
            confidence: cnnResult.confidence || 0,
            allScores: scores,
            processingStatus: `${processedWaveform.meta.croppingMeta.stage} (置信度: ${(processedWaveform.meta.croppingMeta.confidence * 100).toFixed(0)}%)`,
          };
        } else {
          setError(cnnResult.message);
          addRecognitionHistoryRecord({
            timestamp: new Date(),
            command: '无法识别',
            confidence: 0,
            allScores: [],
            processingStatus: 'CNN模型识别失败',
          });
          return;
        }
      } else {
        // 使用通道独立特征比对，再按通道质量权重合成指令分数。
        // ✅ 修复：提取每个通道的特征（不融合）
        // 原因：通道比对比融合比对更有效，可以避免干扰通道的干扰
        const testFeatures = extractFullFeatures(
          processedWaveform.ch1,
          processedWaveform.ch2,
          processedWaveform.ch3
        );
        
        // Z-score 标准化
        const zscoreNorm = (arr: number[]): number[] => {
          const m = arr.reduce((a, b) => a + b, 0) / arr.length;
          const s = Math.sqrt(arr.map(x => (x - m) ** 2).reduce((a, b) => a + b, 0) / arr.length) || 1;
          return arr.map(x => (x - m) / s);
        };
        
        const testCh1 = zscoreNorm([...testFeatures.timeDomain.ch1, ...testFeatures.frequencyDomain.ch1]);
        const testCh2 = zscoreNorm([...testFeatures.timeDomain.ch2, ...testFeatures.frequencyDomain.ch2]);
        const testCh3 = zscoreNorm([...testFeatures.timeDomain.ch3, ...testFeatures.frequencyDomain.ch3]);

        const amplitudeReferenceVectors = savedCommands.flatMap((cmd) =>
          cmd.collections.map((collection) => extractAmplitudeFeatureVector(collection.waveform))
        );
        const amplitudeNormalizer = buildFeatureNormalizer(amplitudeReferenceVectors);
        const testAmplitudeFeatures = normalizeFeatureVector(
          extractAmplitudeFeatureVector(normalizedWaveform),
          amplitudeNormalizer
        );

        // 与每个指令的特征库比对
        // ✅ 修复5：扩展类型定义以包含通道权重信息
        const scores: Array<any> = [];

        let topKValue = 1;  // ✅ 修复：定义一个外部变量保存 topK 值
        // ✅ 修复5：保存最后一个样本的通道权重信息
        let lastChannelWeights = { ch1: 0.30, ch2: 0.60, ch3: 0.10 };
        let lastChannelSNR = { ch1: 0, ch2: 0, ch3: 0 };
        let lastChannelDiagnostics = { ch1: {}, ch2: {}, ch3: {} };
        
        for (const cmd of savedCommands) {
          // ✅ 修复5：收集所有样本的相似度分数，用于计算top-k均值
          const sampleScores: number[] = [];
          const amplitudeScores: number[] = [];
          const shapeScores: number[] = [];

          // 与该指令的所有采集样本比对
          for (const collection of cmd.collections) {
            // 重要：不要重复处理已经处理过的波形
            // 采集时已经上过滤波、裁剪、缩放，直接使用已处理的波形
            const refProcessedWaveform: ProcessedWaveform = {
              ch1: collection.waveform.ch1,
              ch2: collection.waveform.ch2,
              ch3: collection.waveform.ch3,
              meta: {
                croppingMeta: collection.croppingMeta || {
                  startIdx: 0,
                  endIdx: collection.waveform.ch1.length,
                  confidence: 1.0,
                  method: 'unified-pipeline',
                  stage: 'success',
                  reason: '采集时已处理',
                },
                normalizationMeta: collection.normalizationMeta || {
                  originalLength: collection.waveform.ch1.length,
                  targetLength: 512,
                  timestamp: Date.now(),
                },
              },
            };
            
            // 提取参考波形的特征（每个通道分开）
            const refFeatures = extractFullFeatures(
              refProcessedWaveform.ch1,
              refProcessedWaveform.ch2,
              refProcessedWaveform.ch3
            );
            
            // Z-score 标准化
            const refCh1 = zscoreNorm([...refFeatures.timeDomain.ch1, ...refFeatures.frequencyDomain.ch1]);
            const refCh2 = zscoreNorm([...refFeatures.timeDomain.ch2, ...refFeatures.frequencyDomain.ch2]);
            const refCh3 = zscoreNorm([...refFeatures.timeDomain.ch3, ...refFeatures.frequencyDomain.ch3]);
            
            // ✅ 修复：通道独立比对，然后根据权重投票
            // ch2 是真正的判别通道，给予60%权重
            // ch1 是干扰通道（工频），给予30%权重
            // ch3 是辅助通道，给予10%权重
            const simCh1 = calculateFeatureSimilarity(testCh1, refCh1);
            const simCh2 = calculateFeatureSimilarity(testCh2, refCh2);
            const simCh3 = calculateFeatureSimilarity(testCh3, refCh3);
            
            // ✅ 修复2：计算通道质量诊断：基于原始波形而非特征向量
            const ch1Diag = calculateChannelDiagnostics(processedWaveform.ch1);
            const ch2Diag = calculateChannelDiagnostics(processedWaveform.ch2);
            const ch3Diag = calculateChannelDiagnostics(processedWaveform.ch3);
            
            // ✅ 修复3：根据质量指标计算权重
            const weights = calculateChannelWeights(ch1Diag, ch2Diag, ch3Diag);
            
            // ✅ 修复3：保存最后一个样本的权重和诊断信息
            lastChannelWeights = weights;
            lastChannelSNR = { ch1: ch1Diag.rms, ch2: ch2Diag.rms, ch3: ch3Diag.rms };
            lastChannelDiagnostics = { ch1: ch1Diag, ch2: ch2Diag, ch3: ch3Diag };
            
            // ✅ 修复3：使用动态权重计算结合相似度
            const shapeSim = weights.ch1 * simCh1 + weights.ch2 * simCh2 + weights.ch3 * simCh3;
            const refAmplitudeFeatures = normalizeFeatureVector(
              extractAmplitudeFeatureVector(collection.waveform),
              amplitudeNormalizer
            );
            const amplitudeSim = distanceSimilarity(testAmplitudeFeatures, refAmplitudeFeatures);
            const combinedSim = amplitudeSim * 0.7 + shapeSim * 0.3;
            sampleScores.push(combinedSim);
            amplitudeScores.push(amplitudeSim);
            shapeScores.push(shapeSim);
          }

          // ✅ 修复2：修复 topK 策略
          // 不固定取前70%，而是导出原始分数用于诊断
          const sampleCount = sampleScores.length;
          const sortedScores = [...sampleScores].sort((a, b) => b - a);
          const sortedAmplitudeScores = [...amplitudeScores].sort((a, b) => b - a);
          const sortedShapeScores = [...shapeScores].sort((a, b) => b - a);
          
          // 计算三种策略的分数，用于诊断对比
          const top1Score = sortedScores[0] || 0;
          const top3Scores = sortedScores.slice(0, Math.min(3, sortedScores.length));
          const top3Median = medianScore(top3Scores);
          const allMedian = medianScore(sortedScores);
          const amplitudeTop3Median = medianScore(sortedAmplitudeScores.slice(0, Math.min(3, sortedAmplitudeScores.length)));
          const shapeTop3Median = medianScore(sortedShapeScores.slice(0, Math.min(3, sortedShapeScores.length)));
          
          // 真实肌电样本波动较大，单条模板 top1 容易偶然高分；>=3 条采集时用 top3 中位数作为主分数。
          const score = sampleCount >= 3 ? top3Median : top1Score;
          topKValue = Math.max(topKValue, top3Scores.length || 1);
          
          scores.push({
            command: cmd.name,
            score: score,
            // ✅ 修复2：保存所有原始分数用于诊断
            allRawScores: sortedScores,
            allAmplitudeScores: sortedAmplitudeScores,
            allShapeScores: sortedShapeScores,
            amplitudeScore: amplitudeTop3Median,
            shapeScore: shapeTop3Median,
            top1: top1Score,
            top3Median: top3Median,
            allMedian: allMedian,
            sampleCount: sampleCount,
            // ✅ 修复5：保存通道权重信息用于诊断
            channelWeights: lastChannelWeights,
            channelSNR: lastChannelSNR,
            // ✅ 修复1：保存通道诊断信息
            channelDiagnostics: lastChannelDiagnostics,
          });
        }

        // 排序并获取最高分
        scores.sort((a, b) => b.score - a.score);
        const topCommand = scores[0];
        const secondCommand = scores[1];

        // ✅ 修复4：计算 margin 和 top2Score
        const top1Score = topCommand.score;
        const top2Score = secondCommand ? secondCommand.score : 0;
        const scoreMargin = top1Score - top2Score;

        // ✅ 修复1：修复置信度单位错误
        // top1Score 是 0-100 分，confidenceThreshold 是 0-1
        const thresholdScore = confidenceThreshold * 100;
        const minMarginScore = 5; // 5-10 分的 margin 作为不确定阈值
        
        let confidence = top1Score;
        let command = topCommand.command;
        
        if (top1Score < thresholdScore) {
          command = '❌ 识别不确定 (低于阈值)';
          confidence = top1Score;
        } else if (scoreMargin < minMarginScore) {
          command = '❌ 识别不确定 (margin较小)';
          // 置信度应结合 margin 进行校准
          confidence = Math.max(top1Score - (minMarginScore - scoreMargin) * 2, 0);
        }

        result = {
          timestamp: new Date(),
          command: command,
          confidence: confidence,
          allScores: scores,
          threshold: confidenceThreshold,
          topK: topKValue,
          top1Score: top1Score,
          top2Score: top2Score,
          scoreMargin: scoreMargin,
          // ✅ 修复5：添加通道权重信息
          channelWeights: topCommand.channelWeights,
          channelSNR: topCommand.channelSNR,
          // ✅ 修复1：添加诊断字段到 result 对象
          channelDiagnostics: topCommand.channelDiagnostics,
          allRawScores: topCommand.allRawScores,
          matchedCollectionScores: topCommand.allRawScores,
          processingStatus: `${processedWaveform.meta.croppingMeta.stage} (置信度: ${(processedWaveform.meta.croppingMeta.confidence * 100).toFixed(0)}%)`,
          processedWaveform: {
            ch1: processedWaveform.ch1,
            ch2: processedWaveform.ch2,
            ch3: processedWaveform.ch3,
            meta: processedWaveform.meta,
          },
        };
      }
      
      // 显示反馈面板（仅在识别成功时）
      setLastRecognitionResult(result);
      // 只有当识别成功且置信度足够高时才显示反馈
      const isRecognitionSuccess = !isUncertainRecognition(result.command);
      setShowFeedback(isRecognitionSuccess);
      if (!isRecognitionSuccess) {
        addRecognitionHistoryRecord(result);
      }
      setSelectedTrueCommand('');
      setError(null);
      setCurrentWaveform(normalizedWaveform);  // 显示裁剪后的波形
      
      // ✅ 修复：不在识别后自动保存。只有用户反馈后才保存一条正式记录
      // 如果需要保存预测结果，应标记为 recordType: "prediction" 且不参与准确率统计
      
      // ✅ 修复：不添加预测结果到历史记录
      // 历史记录只在用户反馈后添加，避免双记录
      // setRecognitionHistory([...recognitionHistory, result]);
    }
  };

  // 提交反馈
  const handleSubmitFeedback = async () => {
    if (!selectedTrueCommand || !lastRecognitionResult) return;

    try {
      // 1. 计算相似度和置信度
      const similarity = lastRecognitionResult.confidence;
      const confidence = lastRecognitionResult.confidence;
      
      // 2. 加载已保存的指令模板
      const templates = savedCommands.map(cmd => ({
        commandName: cmd.name,
        meanFeatureVector: [],
      }));
      
      // 3. 调用反馈纠偶系统
      const calibrationRecord = await processRecognitionFeedback(
        lastRecognitionResult.command,
        selectedTrueCommand,
        similarity,
        confidence,
        templates as any
      );
      
      // 4. 记录用户反馈
      const feedbackRecord = submitUserFeedback(
        {
          testId: `test-${Date.now()}`,
          timestamp: new Date(),
          predictedCommand: lastRecognitionResult.command,
          predictedSimilarity: similarity,
          predictedConfidence: confidence,
          trueCommand: selectedTrueCommand,
          isCorrect: !isUncertainRecognition(lastRecognitionResult.command) && lastRecognitionResult.command === selectedTrueCommand,
          topMatches: lastRecognitionResult.allScores.map((s: any) => ({ command: s.command, similarity: s.score })),
        },
        selectedTrueCommand
      );
      
      // 5. 更新自适应阈值
      const isCorrect = !isUncertainRecognition(lastRecognitionResult.command) && lastRecognitionResult.command === selectedTrueCommand;
      if (isCorrect) {
        const newThreshold = Math.max(0.5, adaptiveThreshold - 0.05);
        setAdaptiveThreshold(newThreshold);
      } else {
        const newThreshold = Math.min(0.95, adaptiveThreshold + 0.05);
        setAdaptiveThreshold(newThreshold);
      }
      
      // 6. 计算性能指标
      const calibrationRecords = getCalibrationRecords();
      const allFeedback = calibrationRecords.map((record: any) => ({
        testId: `test-${record.timestamp}`,
        timestamp: new Date(record.timestamp),
        predictedCommand: record.predictedCommand,
        predictedSimilarity: record.similarity,
        predictedConfidence: record.confidence,
        trueCommand: record.actualCommand,
        isCorrect: record.isCorrect,
        topMatches: [],
      }));
      const metrics = calculatePerformanceMetrics(allFeedback);
      // 7. 保存反馈记录到历史
      const historyRecord = {
        ...lastRecognitionResult,
        userCorrection: selectedTrueCommand,
        isCorrect,
        calibrationApplied: calibrationRecord.adjustmentApplied,
        timestamp: new Date(),
      };
      
      // 反馈记录始终新增到历史顶部。成功预测不会预先写入历史，
      // 因此这里不再替换最后一条记录，避免覆盖失败/不确定结果。
      addRecognitionHistoryRecord(historyRecord as RecognitionResult);
      
      // 8. 保存识别结果到独立的识别记录表（仅在用户反馈后保存）
      try {
        const recognitionRecord = {
          commandName: selectedTrueCommand,
          predictedCommand: lastRecognitionResult.command,
          actualCommand: selectedTrueCommand,  // ✅ 修复：添加 actualCommand 字段
          isCorrect,
          similarity: similarity,
          confidence: confidence,
          allScores: lastRecognitionResult.allScores,  // ✅ 修复：保存所有分数
          threshold: lastRecognitionResult.threshold,  // ✅ 修复：保存阈值
          topK: lastRecognitionResult.topK,  // ✅ 修复：保存 topK
          recordType: 'feedback',  // ✅ 修复：标记为反馈记录，用于准确率统计
          timestamp: new Date(),
          userId: currentUser?.userId,
          userName: currentUser?.userName,
          // ✅ 修复4：保存关键诊断字段
          top1Score: lastRecognitionResult.top1Score,
          top2Score: lastRecognitionResult.top2Score,
          scoreMargin: lastRecognitionResult.scoreMargin,
          channelWeights: lastRecognitionResult.channelWeights,
          channelDiagnostics: lastRecognitionResult.channelDiagnostics,
          matchedCollectionScores: lastRecognitionResult.allRawScores,
        };
        
        await emgDatabase.saveRecognitionRecord(recognitionRecord);
        console.log('[识别记录] 已保存到IndexedDB');
      } catch (error) {
        console.error('[识别记录保存失败]', error);
        // ✅ 修复：不要吞掉错误，而是抛出来让外层catch处理
        throw new Error(`保存识别记录失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
      
      setError(null);
      
    } catch (err) {
      console.error('反馈处理失败:', err);
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      setError(`反馈处理失败: ${errorMsg}`);
      // ✅ 修复：错误时不关闭reflection对话框，让用户看到错误信息
      return;
    }
    
    // ✅ 修复：只有成功时才关闭reflection对话框
    setShowFeedback(false);
    setLastRecognitionResult(null);
    setSelectedTrueCommand('');
  };

  return (
    <div className="min-h-screen" style={{
      color: '#fff',
      paddingBottom: '40px',
    }}>
      {/* 返回按钮 */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '10px 20px',
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ← 返回主页
        </button>
      </div>
      <Container>
        <Section>
          {/* 硬件连接状态 */}
          <SectionLabel number="00">HARDWARE CONNECTION</SectionLabel>
          <SectionTitle>硬件连接</SectionTitle>
          <HardwareStatusComponent />

          <Divider />

          {/* 识别指导 */}
          <SectionLabel number="01">RECOGNITION GUIDE</SectionLabel>
          <SectionTitle>识别流程</SectionTitle>

          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              <div style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', color: '#d4af37', marginBottom: '8px' }}>①</div>
                <div style={{ fontSize: '12px', color: '#888' }}>点击"开始识别"</div>
              </div>

              <div style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', color: '#d4af37', marginBottom: '8px' }}>②</div>
                <div style={{ fontSize: '12px', color: '#888' }}>等待倒计时完成</div>
              </div>

              <div style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', color: '#d4af37', marginBottom: '8px' }}>③</div>
                <div style={{ fontSize: '12px', color: '#888' }}>默念指令 (2-3 秒)</div>
              </div>

              <div style={{
                backgroundColor: '#2a2a2a',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '12px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', color: '#d4af37', marginBottom: '8px' }}>④</div>
                <div style={{ fontSize: '12px', color: '#888' }}>查看识别结果</div>
              </div>
            </div>
          </div>

          <Divider />

          {/* 实时波形显示 */}
          <SectionLabel number="02">REAL-TIME WAVEFORM</SectionLabel>
          <SectionTitle>实时波形</SectionTitle>

          {!isConnected && (
            <div style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              padding: '16px',
              marginBottom: '16px',
              color: '#ef4444',
            }}>
              ⚠️ 请先连接 STM32 设备
            </div>
          )}

          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '16px',
          }}>
            <EnhancedWaveformVisualization
              ch1={currentWaveform.ch1}
              ch2={currentWaveform.ch2}
              ch3={currentWaveform.ch3}
              height={250}
              isLive={isRecognizing}
              showLayers={false}
              title="实时波形"
            />
          </div>

          {/* 置信度阈值设置 */}
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <div style={{ marginBottom: '12px', color: '#888' }}>
              置信度阈值：{(confidenceThreshold * 100).toFixed(0)}% (当前使用中)
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={confidenceThreshold * 100}
              onChange={(e) => setConfidenceThreshold(parseInt(e.target.value) / 100)}
              style={{
                width: '100%',
                cursor: 'pointer',
              }}
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>
              低于阈值的识别结果将被标记为"识别不确定"
            </div>
          </div>

          {/* 识别控制 */}
          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '24px',
            justifyContent: 'center',
          }}>
            {!isRecognizing ? (
              <button
                onClick={handleStartRecognition}
                disabled={!isConnected || savedCommands.length === 0}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isConnected && savedCommands.length > 0 ? '#d4af37' : '#666',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isConnected && savedCommands.length > 0 ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                开始识别
              </button>
            ) : (
              <button
                onClick={handleStopRecognition}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                停止识别 ({recognitionTime}s)
              </button>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #ef4444',
              borderRadius: '4px',
              padding: '12px',
              color: '#ef4444',
              marginBottom: '16px',
              fontSize: '14px',
            }}>
              {error}
            </div>
          )}

          {/* 诊断导出按钮 */}
          {/* 诊断导出按钮 - 总是显示，但无数据时禁用 */}
          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '24px',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <button
              onClick={async () => {
                if (recognitionHistory.length === 0) {
                  alert('没有识别数据可导出，请先进行识别测试');
                  return;
                }
                try {
                  const { exportCompleteDiagnosticData } = await import('@/lib/data-export');
                  const exportData = recognitionHistory.map(r => ({
                    predictedCommand: r.command,
                    command: r.command,
                    actualCommand: r.userCorrection || '',
                    isCorrect: r.isCorrect,
                    confidence: r.confidence,
                    allScores: r.allScores,
                    timestamp: r.timestamp instanceof Date ? r.timestamp.getTime() : r.timestamp,
                    threshold: r.threshold || 0.7,
                    topK: r.topK || 5,
                    recordType: r.userCorrection ? 'feedback' : 'recognition',
                    croppingMeta: (r as any).croppingMeta,
                    normalizationMeta: (r as any).normalizationMeta,
                  }));
                  await exportCompleteDiagnosticData(exportData, savedCommands);
                } catch (err) {
                  console.error('诊断导出失败:', err);
                  alert('诊断导出失败，请查看控制台');
                }
              }}
              disabled={recognitionHistory.length === 0}
              style={{
                padding: '10px 20px',
                backgroundColor: recognitionHistory.length > 0 ? '#8b5cf6' : '#666',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: recognitionHistory.length > 0 ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '12px',
              }}
              title={recognitionHistory.length > 0 ? '导出本次会话的识别诊断数据（不包含波形）' : '请先进行识别测试'}
            >
              📄 诊断导出 (本次会话)
            </button>
            {recognitionHistory.length > 0 && (
              <span style={{
                color: '#d4af37',
                fontSize: '12px',
                fontStyle: 'italic',
              }}>
                {recognitionHistory.length} 条数据 · 不含波形
              </span>
            )}
          </div>

          {/* 反馈面板 */}
          {showFeedback && lastRecognitionResult && (
            <>
              <Divider />
              <SectionLabel number="03">USER FEEDBACK</SectionLabel>
              <SectionTitle>用户反馈</SectionTitle>

              <div style={{
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '16px',
                marginBottom: '24px',
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>系统识别结果</div>
                  <div style={{ fontSize: '18px', color: '#d4af37', fontWeight: 'bold' }}>
                    {lastRecognitionResult.command}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    置信度：{lastRecognitionResult.confidence.toFixed(0)}%
                  </div>
                </div>

                <div style={{
                  backgroundColor: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  padding: '12px',
                  marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>请选择您实际默念的指令：</div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: '8px',
                  }}>
                    {savedCommands.map((cmd) => (
                      <button
                        key={cmd.name}
                        onClick={() => setSelectedTrueCommand(cmd.name)}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: selectedTrueCommand === cmd.name ? '#d4af37' : '#333',
                          color: selectedTrueCommand === cmd.name ? '#000' : '#fff',
                          border: selectedTrueCommand === cmd.name ? '2px solid #d4af37' : '1px solid #555',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: selectedTrueCommand === cmd.name ? 'bold' : 'normal',
                        }}
                      >
                        {cmd.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}>
                  <button
                    onClick={async () => {
                      // ✅ 导出原始波形数据用于饱和分析
                      try {
                        const { exportRawWaveform } = await import('@/lib/data-export');
                        if ((lastRecognitionResult as any).processedWaveform) {
                          exportRawWaveform(
                            (lastRecognitionResult as any).processedWaveform,
                            lastRecognitionResult.command,
                            `raw-waveform-${lastRecognitionResult.command}-${Date.now()}.json`
                          );
                          console.log('[导出] 原始波形数据已导出，请查看浏览器下载文件夹');
                        } else {
                          alert('该识别结果中没有波形数据');
                        }
                      } catch (err) {
                        console.error('导出失败:', err);
                        alert('导出失败，请查看控制台');
                      }
                    }}
                    title="导出原始波形数据用于 ch1 饱和分析"
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#555',
                      color: '#fff',
                      border: '1px solid #777',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    📊 导出波形
                  </button>
                  <button
                    onClick={() => {
                      setShowFeedback(false);
                      setLastRecognitionResult(null);
                      setSelectedTrueCommand('');
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#333',
                      color: '#fff',
                      border: '1px solid #555',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmitFeedback}
                    disabled={!selectedTrueCommand}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: selectedTrueCommand ? '#d4af37' : '#666',
                      color: selectedTrueCommand ? '#000' : '#999',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: selectedTrueCommand ? 'pointer' : 'not-allowed',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    提交反馈
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 识别历史 */}
          {recognitionHistory.length > 0 && (
            <>
              <Divider />
              <SectionLabel number="03">RECOGNITION HISTORY</SectionLabel>
              <SectionTitle>识别历史</SectionTitle>
              <div style={{ color: '#888', fontSize: '12px', marginBottom: '12px' }}>
                显示最近 {Math.min(10, recognitionHistory.length)} / {recognitionHistory.length} 条
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
                maxHeight: '720px',
                overflowY: 'auto',
                paddingRight: '8px',
              }}>
                {recognitionHistory.slice(0, 10).map((result, idx) => (
                  <div
                    key={result.historyId || `${result.timestamp instanceof Date ? result.timestamp.getTime() : result.timestamp}-${result.command}-${idx}`}
                    style={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      padding: '16px',
                    }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                        #{idx + 1} · {(result.timestamp instanceof Date ? result.timestamp : new Date(result.timestamp)).toLocaleTimeString()}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ fontSize: '20px', color: '#d4af37', fontWeight: 'bold' }}>
                          {result.command}
                        </div>
                        {result.isCorrect !== undefined && (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            backgroundColor: result.isCorrect ? '#22c55e20' : '#ef444420',
                            border: `1px solid ${result.isCorrect ? '#22c55e' : '#ef4444'}`,
                            borderRadius: '3px',
                            fontSize: '10px'
                          }}>
                            <span>{result.isCorrect ? '✅' : '❌'}</span>
                            <span style={{ color: result.isCorrect ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                              {result.isCorrect ? '正确' : '错误'}
                            </span>
                          </div>
                        )}
                        {!result.isCorrect && result.processingStatus && (
                          <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 6px',
                            backgroundColor: '#10b98120',
                            border: '1px solid #10b981',
                            borderRadius: '3px',
                            fontSize: '10px'
                          }}>
                            <span>✅</span>
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                              {result.processingStatus}
                            </span>
                          </div>
                        )}
                      </div>
                      {result.userCorrection && (
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                          正确指令：<span style={{ color: '#22c55e', fontWeight: 'bold' }}>{result.userCorrection}</span>
                        </div>
                      )}
                    </div>

                    <div style={{
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '8px',
                      marginBottom: '12px',
                    }}>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                        识别置信度
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <div style={{
                          flex: 1,
                          backgroundColor: '#333',
                          height: '6px',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            backgroundColor: result.confidence >= 80 ? '#22c55e' : result.confidence >= 60 ? '#f59e0b' : '#ef4444',
                            height: '100%',
                            width: `${result.confidence}%`,
                          }} />
                        </div>
                        <div style={{ fontSize: '12px', color: '#d4af37', minWidth: '40px' }}>
                          {result.confidence.toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {result.processingStatus && !result.isCorrect && (
                      <div style={{
                        backgroundColor: '#2a2a2a',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        padding: '8px',
                        marginBottom: '12px',
                      }}>
                        <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                          处理状态
                        </div>
                        <div style={{ fontSize: '11px', color: '#999' }}>
                          {result.processingStatus}
                        </div>
                      </div>
                    )}

                    <div style={{
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '8px',
                    }}>
                      <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                        所有得分
                      </div>
                      {result.allScores.slice(0, 3).map((score, scoreIdx) => (
                        <div
                          key={scoreIdx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '11px',
                            color: '#888',
                            marginBottom: scoreIdx < 2 ? '4px' : '0',
                          }}
                        >
                          <span>{score.command}</span>
                          <span>{score.score.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      </Container>
    </div>
  );
}

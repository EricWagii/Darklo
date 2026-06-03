/**
 * 采集训练页面 - 高端商业风格
 * 
 * 功能：
 * - 指令输入和管理
 * - 实时波形采集和显示（来自 STM32 串口）
 * - 波形裁剪（去除无效片段）
 * - 历史采集对比
 * - 特征库生成
 * - 支持继续采集已有指令
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
  Input,
  Divider,
  ProgressBar,
  ConfirmDialog,
} from '@/components/PremiumComponents';
import { WaveformVisualization, ThumbnailWaveform } from '@/components/WaveformVisualization';
import { EnhancedWaveformVisualization } from '@/components/EnhancedWaveformVisualization';
import { HardwareStatusComponent } from '@/components/HardwareStatus';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { useUserSession } from '@/contexts/UserSessionContext';
import { detectValidSegment, cropWaveform } from '@/lib/dsp-processor';
import { DebugPanel } from '@/components/DebugPanel';
import { evaluateAllCollections, autoCropCollection, alignMultipleCollections } from '@/lib/auto-segmentation';
import { alignMultipleCollectionsImproved, batchCropCollections } from '@/lib/improved-segmentation';
import { alignMultipleCollectionsAfterPreprocessing } from '@/lib/preprocessing-aware-cropping';
import { batchCropCollectionsFast, applyCropping } from '@/lib/fast-cropping-optimized';
import { batchCropCollectionsMultiPeak, applyCropping as applyMultiPeakCropping } from '@/lib/multi-peak-detection';
import { batchSimpleCroppingCompat, applyCroppingToWaveforms as applySimpleCropping } from '@/lib/simple-front-rear-cropping';
import { processWaveformUnified, WaveformPipelineConfig } from '@/lib/unified-waveform-pipeline';
import { integratedCroppingSystem } from '@/lib/integrated-cropping-system';
import { anomalyDiscardSystem, generateUserPrompt } from '@/lib/anomaly-discard-system';
import { WaveformQualityScorer } from '@/lib/cropping-logger-and-quality';
import { INSTRUCTION_LENGTH_SPECS } from '@shared/instruction-length-spec';
import { evaluateAllCollectionsImproved } from '@/lib/quality-scoring-improved';
import { emgDatabase } from '@/lib/db';
import { dataChangeEventManager, DataChangeEventType } from '@/lib/data-change-events';
import { generateUUID } from '@/lib/collection-uuid-manager';
import {
  inferCroppingStage,
  getMethodForStage,
  getReasonForStage,
} from '@/lib/cropping-stage-inference';
import { ImprovedQualityScoreList } from '@/components/ImprovedQualityScoreDisplay';
import { QualityScoreList } from '@/components/QualityScoreDisplay';
import { detectElectrodeStatus, isElectrodeStatusAcceptable } from '@/lib/electrode-detection';
import { normalizeWaveformLengthMultiChannel } from '@/lib/waveform-normalizer';
import { showCollectionCroppingToast } from '@/lib/cropping-completion-toast';
import { ElectrodeDetectionPanel } from '@/components/ElectrodeDetectionPanel';
import { WaveformComparisonPanel } from '@/components/WaveformComparisonPanel';
import { AnomalyPromptDialog, type AnomalyWaveform } from '@/components/AnomalyPromptDialog';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { operationLogger } from '@/lib/operation-logger';
import {
  handleCompleteCollectionV2,
  handleSaveAfterAnomalyRemoval,
  type CollectionHandlerConfig
} from '@/lib/collection-handler-v2';
import {
  SAMPLE_RATE,
  FIXED_WAVEFORM_LENGTH,
  validateInstructionLength,
  calculateDurationMs,
  getInstructionSpec,
} from '@shared/instruction-length-spec';

// 操作日志导出函数
const handleExportLog = () => {
  try {
    operationLogger.downloadAsFile();
    toast.success('✅ 日志已导出');
  } catch (error) {
    console.error('导出日志失败:', error);
    toast.error('❌ 导出日志失败');
  }
}

interface CollectionData {
  id: string;  // UUID主键，不会因为削除而错位
  index: number;
  timestamp: Date;
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] };
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  peakCount?: number;           // 多峰值检测的峰值数
  detectionStrategy?: 'single' | 'multi'; // 检测策略
  // 处理元数据
  croppingMeta?: {
    stage: 'primary' | 'fallback' | 'full_segment';
    confidence: number;
    method: 'resting-baseline' | 'otsu' | 'full-segment';
    reason: string;
  };
  normalizationMeta?: {
    targetLength: number;
    originalLength: number;
  };
  pipelineMetadata?: {
    filteringParams?: {
      highPassCutoff: number;
      adaptiveFilterParams?: { windowSize: number; mu: number };
    };
    cropRange?: {
      startIdx: number;
      endIdx: number;
    };
    scalingInfo?: {
      originalLength: number;
      targetLength: number;
    };
  };
}

interface StoredCommand {
  name: string;
  collections: CollectionData[];
  createdAt: Date;
}

export default function CollectionMode() {
  const [location, navigate] = useLocation();
  const { isConnected, onDataReceived } = useSerialConnectionContext();
  const { currentUser, isLoggedIn } = useUserSession();
  const [showLoginDialog, setShowLoginDialog] = useState(!isLoggedIn);
  
  // 电极检测状态
  const [showElectrodeCheck, setShowElectrodeCheck] = useState(false);
  const [electrodeCheckResult, setElectrodeCheckResult] = useState<any>(null);
  const [globalElectrodeBaseline, setGlobalElectrodeBaseline] = useState<any>(null);

  const [commandName, setCommandName] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectionCount, setCollectionCount] = useState(0);
  const [collectionHistory, setCollectionHistory] = useState<CollectionData[]>([]);
  const [currentWaveform, setCurrentWaveform] = useState<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'complete' | 'discard' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collectionTime, setCollectionTime] = useState(0);
  const [countdownTime, setCountdownTime] = useState(0);  // ✅ 修复：采集倒计时
  
  // 波形裁剪状态
  const [showTrimUI, setShowTrimUI] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [pendingWaveform, setPendingWaveform] = useState<CollectionData | null>(null);
  
  // 已保存的指令库
  // ✅ 修复：完全移除savedCommands内存缓存，改为直接查询IndexedDB
  // 这样确保任何时刻都是最新数据，不会出现删除后数据重现的问题
  const [isAppendingMode, setIsAppendingMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);  // 防止重复点击
  const [commandExists, setCommandExists] = useState(false);

  // ✅ 修复：监听commandName变化，检查指令是否存在
  useEffect(() => {
    const checkExists = async () => {
      if (!commandName) {
        setCommandExists(false);
        return;
      }
      try {
        const cmd = await emgDatabase.getCommand(commandName);
        setCommandExists(!!cmd);
      } catch (error) {
        console.error('[CollectionMode] 检查指令失败:', error);
        setCommandExists(false);
      }
    };
    checkExists();
  }, [commandName]);

  const [qualityScores, setQualityScores] = useState<Array<any>>([]);
  const [showComparisonPanel, setShowComparisonPanel] = useState(false);
  
  // 异常波形提示对话框状态
  const [showAnomalyDialog, setShowAnomalyDialog] = useState(false);
  const [anomalies, setAnomalies] = useState<AnomalyWaveform[]>([]);
  const [pendingCollections, setPendingCollections] = useState<CollectionData[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 检查用户登录状态
  useEffect(() => {
    setShowLoginDialog(!isLoggedIn);
  }, [isLoggedIn]);

  // ✅ 修复：完全移除内存缓存，不再维护savedCommands
  // 每次需要查询指令时直接从IndexedDB查询，确保任何时刻都是最新数据





  // 检查指令是否已存在 - ✅ 修复：直接查询IndexedDB而不是内存缓存
  const checkCommandExists = async (name: string): Promise<boolean> => {
    try {
      const cmd = await emgDatabase.getCommand(name);
      return !!cmd;
    } catch (error) {
      console.error('[checkCommandExists] 查询失败:', error);
      return false;
    }
  };

  // 更新质量评分（使用改进的算法）
  useEffect(() => {
    if (collectionHistory.length >= 1) {
      try {
        const scores = evaluateAllCollectionsImproved(
          collectionHistory.map((col) => col.waveform)
        );
        const scoresWithIndex = scores.map((score, idx) => ({
          ...score,
          id: collectionHistory[idx].id,  // 问题3.1修复：添加UUID
          index: idx,
        }));
        setQualityScores(scoresWithIndex);
      } catch (err) {
        console.error('质量评分计算失败:', err);
      }
    }
  }, [collectionHistory]);

  // 删除指定采集
  const handleDeleteCollection = (id: string) => {
    // 问题3.1修复：使用UUID而不是数组下标
    const deletedCollection = collectionHistory.find(col => col.id === id);
    const newHistory = collectionHistory.filter(col => col.id !== id);
    setCollectionHistory(newHistory);
    setCollectionCount(newHistory.length);
    const collectionIndex = deletedCollection ? deletedCollection.index : '?';
    toast.success(`已削除采集 #${collectionIndex}`);
  };

  // 重录指定采集（削除并提示用户重新采集）
  const handleRetryCollection = (id: string) => {
    const collection = collectionHistory.find(col => col.id === id);
    handleDeleteCollection(id);
    if (collection) {
      toast.info(`请重新采集数据来替换采集 #${collection.index}`);
    }
  };

  // 一键自动裁剪所有采集 - 使用预处理后裁剪（方案 B）
  const handleAutoCropAll = () => {
    if (collectionHistory.length === 0) {
      setError('没有采集数据可裁剪');
      return;
    }

    try {
      // 使用预处理后的对齐算法（方案 B）
      // 这个算法会：
      // 1. 对每个采集进行完整预处理（陷波、高通、ICA）
      // 2. 计算三通道 SNR 权重
      // 3. 融合三通道特征
      // 4. 在融合信号上进行裁剪
      // 5. 使用中位数对齐多个采集
      const alignment = alignMultipleCollectionsAfterPreprocessing(
        collectionHistory.map((col) => col.waveform),
        SAMPLE_RATE  // 采样率 500Hz
      );

      // 检查裁剪结果是否有效
      if (alignment.startIdx >= alignment.endIdx) {
        setError('无法识别有效波形，请检查采集数据');
        return;
      }

      // 裁剪所有采集
      const croppedHistory = collectionHistory.map((col) => ({
        ...col,
        waveform: {
          ch1: col.waveform.ch1.slice(alignment.startIdx, alignment.endIdx),
          ch2: col.waveform.ch2.slice(alignment.startIdx, alignment.endIdx),
          ch3: col.waveform.ch3.slice(alignment.startIdx, alignment.endIdx),
        },
        trimStart: alignment.startIdx,
        trimEnd: alignment.endIdx,
      }));

      // 检查裁剪后的数据是否有效
      const validCrops = croppedHistory.filter((col) => col.waveform.ch2.length > 10);
      if (validCrops.length === 0) {
        setError('裁剪后没有有效数据，请重新采集');
        return;
      }

      setCollectionHistory(validCrops);
      setCollectionCount(validCrops.length);
      setError(null);
      
      // 显示详细的裁剪结果
      const snrInfo = `SNR权重 - CH1: ${(alignment.snrWeights.ch1 * 100).toFixed(1)}%, CH2: ${(alignment.snrWeights.ch2 * 100).toFixed(1)}%, CH3: ${(alignment.snrWeights.ch3 * 100).toFixed(1)}%`;
      alert(`✓ 已使用预处理后裁剪算法\n裁剪数据: ${validCrops.length}/${collectionHistory.length}\n有效片段比例: ${(alignment.confidence * 100).toFixed(1)}%\n${snrInfo}`);
    } catch (err) {
      console.error('自动裁剪失败:', err);
      setError(`自动裁剪失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // 注册数据接收回调
  useEffect(() => {
    const handleDataReceived = (data: any) => {
      if (isCollecting) {
        setCurrentWaveform((prev) => ({
          ch1: [...prev.ch1, data.channel1],
          ch2: [...prev.ch2, data.channel2],
          ch3: [...prev.ch3, data.channel3],
        }));
      }
    };

    onDataReceived(handleDataReceived);
  }, [isCollecting, onDataReceived]);

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
      
      // 实际检测当前电极状态
      // 使用最近的采集数据（如果有的话）
      if (collectionHistory.length > 0) {
        const latestCollection = collectionHistory[collectionHistory.length - 1];
        const result = detectElectrodeStatus(
          latestCollection.waveform.ch1,
          latestCollection.waveform.ch2,
          latestCollection.waveform.ch3,
          baseline
        );
        setElectrodeCheckResult(result);
        setShowElectrodeCheck(true);
      } else {
        // ✅ 修复19：移除随机模拟mock数据，提示用户先采集真实信号
        toast.warning('请先采集一段真实信号后再检查电极状态');
        return;
      }
      
      setError(null);
    } catch (err) {
      console.error('电极检测失败:', err);
      setError('电极检测失败，请重试');
    }
  };

  // 开始采集
  const handleStartCollection = () => {
    if (!commandName.trim()) {
      setError('请输入指令名称');
      return;
    }

    if (!isConnected) {
      setError('请先连接 STM32 设备');
      return;
    }

    // 检查电极状态
    if (electrodeCheckResult && !isElectrodeStatusAcceptable(electrodeCheckResult)) {
      setError('电极状态不符合要求，请先调节电极');
      return;
    }

    // ✅ 修复：先显示 3 秒倒计时
    setCountdownTime(3);
    setIsCollecting(false);
    setError(null);
    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
    setCollectionTime(0);
    setShowElectrodeCheck(false);
    setElectrodeCheckResult(null);

    // ✅ 修复：倒计时逻辑
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      countdown -= 1;
      setCountdownTime(countdown);
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        // ✅ 修复：倒计时结束后开始实际采集
        setIsCollecting(true);
        timerRef.current = setInterval(() => {
          setCollectionTime((t) => t + 10);
        }, 10);
      }
    }, 1000);
  };

  // 停止采集
  const handleStopCollection = () => {
    setIsCollecting(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    // 检查采集数据是否有效
    if (currentWaveform.ch1.length === 0) {
      setError('未采集到有效数据');
      return;
    }

    // 执行统一的波形处理流程：滤波降噪 -> 裁剪空白 -> 统一缩放
    const pipelineConfig: WaveformPipelineConfig = {
      targetLength: FIXED_WAVEFORM_LENGTH || 512,
      samplingRate: SAMPLE_RATE || 500,
      restingBaseline: undefined,
      highPassCutoff: 20,
      adaptiveFilterParams: { windowSize: 50, mu: 0.01 },
    };

    const pipelineResult = processWaveformUnified(currentWaveform, pipelineConfig);
    const processedWaveform = pipelineResult.processed;
    const qualityScore = pipelineResult.metadata.qualityScore;

    // 执行简单裁剪以获取处理状态
    const croppingResult = batchSimpleCroppingCompat(
      [processedWaveform],
      undefined,
      'auto'
    );

    // 问题4.1修复：使用专用的阶段推断函数
    const croppingStage = inferCroppingStage(croppingResult);
    const croppingConfidence = croppingResult.confidence || 1.0;

    // 保存采集（使用处理后的波形）
    const newCollection: CollectionData = {
      id: generateUUID(),  // 问题3.1修复：UUID主键
      index: collectionHistory.length + 1,
      timestamp: new Date(),
      waveform: processedWaveform,
      duration: collectionTime,
      croppingMeta: {
        stage: croppingStage,
        confidence: croppingConfidence,
        method: getMethodForStage(croppingStage) as 'resting-baseline' | 'otsu' | 'full-segment',
        reason: getReasonForStage(croppingStage),
      },
      pipelineMetadata: pipelineResult.metadata,
    };

    // 添加详细的波形诊断日志
    const rawDurationMs = (currentWaveform.ch1.length / 500) * 1000;
    console.log(`[采集 #${newCollection.index}] 原始波形长度: ${currentWaveform.ch1.length} 样本 (${rawDurationMs.toFixed(0)}ms)`);
    console.log(`[采集 #${newCollection.index}] 计时器时长: ${collectionTime}ms`);
    console.log(`[采集 #${newCollection.index}] 指令: ${commandName || '未设置'}`);
    console.log(`[采集 #${newCollection.index}] 处理流程: ${pipelineResult.metadata.steps.join(' -> ')}`);
    console.log(`[采集 #${newCollection.index}] 质量评分: ${qualityScore.toFixed(1)}/100`);

    setCollectionHistory([...collectionHistory, newCollection]);
    setCollectionCount(collectionCount + 1);
    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
    setCollectionTime(0);
    setError(null);

    // 自动显示裁剪 UI
    setShowTrimUI(true);
    setPendingWaveform(newCollection);
    setTrimStart(0);
    setTrimEnd(currentWaveform.ch1.length);
  };

  // 应用裁剪
  const handleApplyTrim = () => {
    if (!pendingWaveform) return;

    const croppedWaveform = {
      ch1: pendingWaveform.waveform.ch1.slice(trimStart, trimEnd),
      ch2: pendingWaveform.waveform.ch2.slice(trimStart, trimEnd),
      ch3: pendingWaveform.waveform.ch3.slice(trimStart, trimEnd),
    };

    // 更新历史记录
    const updated = [...collectionHistory];
    updated[updated.length - 1] = {
      ...pendingWaveform,
      waveform: croppedWaveform,
      trimStart,
      trimEnd,
    };

    setCollectionHistory(updated);
    setShowTrimUI(false);
    setPendingWaveform(null);
  };

  // 处理异常波形对话框的确认
    // 处理异常波形对话框的确认
  const handleAnomalyDialogConfirm = async (indicesToDelete: number[]) => {
    logger.log(`用户选择删除 ${indicesToDelete.length} 个异常波形`);
    
    const remainingCount = pendingCollections.length - indicesToDelete.length;
    if (remainingCount < 1) {
      toast.error('至少需要保留 1 个波形');
      return;
    }
    
    setShowAnomalyDialog(false);
    setAnomalies([]);
    
    try {
      setIsSaving(true);
      toast.loading('正在保存...');

      // 使用新的保存函数
      if (!currentUser) {
        toast.error('请先登录');
        return;
      }
      
      const result = await handleSaveAfterAnomalyRemoval(
        {
          commandName,
          collectionHistory,
          currentUser,
          
          emgDatabase,
          logger,
          operationLogger,
          FIXED_WAVEFORM_LENGTH,
          SAMPLE_RATE
        },
        pendingCollections,
        indicesToDelete
      );

      if (!result.success) {
        toast.dismiss();
        setError(result.message);
        return;
      }

      toast.dismiss();
      
      // 重置状态
      setCommandName('');
      setCollectionHistory([]);
      setCollectionCount(0);
      setError(null);
      setPendingCollections([]);
      setShowConfirm(false);
      setConfirmAction(null);
      setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
      setCollectionTime(0);

      setTimeout(() => {
        setShowTrimUI(false);
        setTrimStart(0);
        setTrimEnd(0);
        setPendingWaveform(null);
        setIsAppendingMode(false);
      }, 2000);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      logger.error(`保存失败: ${errorMsg}`);
      toast.dismiss();
      setError(`保存失败: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 完成采集 - 使用新的独立裁剪算法
  const handleCompleteCollection = async () => {
    if (isSaving) {
      logger.warn('保存已在进行中，请勿重复点击');
      return;
    }

    if (!currentUser) {
      logger.error('用户未登录');
      toast.error('请先登录');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      toast.loading('正在处理采集数据...');

      // 使用新的采集处理函数
      const result = await handleCompleteCollectionV2({
        commandName,
        collectionHistory,
        currentUser,
        
        emgDatabase,
        logger,
        operationLogger,
        FIXED_WAVEFORM_LENGTH,
        SAMPLE_RATE
      });

      if (!result.success) {
        // 检查是否需要用户处理异常
        if (result.requiresUserAction && result.anomalies && result.processedWaveforms) {
          logger.log(`检测到 ${result.anomalies.length} 个异常波形`);
          
          // 保存已处理的波形，以便删除后保存
          setPendingCollections(result.processedWaveforms);
          
          // 转换为AnomalyWaveform格式
          const anomalyWaveforms: AnomalyWaveform[] = result.anomalies.map(a => ({
            collectionIndex: a.index,
            reason: a.reason,
            qualityScore: a.confidence,
            recommendation: '请检查并删除异常波形'
          }));
          
          setAnomalies(anomalyWaveforms);
          setShowAnomalyDialog(true);
          toast.dismiss();
          setIsSaving(false);
          return;
        }

        toast.dismiss();
        setError(result.message);
        return;
      }

      // 保存成功
      toast.dismiss();
      
      // 重置状态
      setCommandName('');
      setCollectionHistory([]);
      setCollectionCount(0);
      setError(null);
      setShowConfirm(false);
      setConfirmAction(null);
      setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
      setCollectionTime(0);

      // 延迟重置UI
      setTimeout(() => {
        setShowTrimUI(false);
        setTrimStart(0);
        setTrimEnd(0);
        setPendingWaveform(null);
        setIsAppendingMode(false);
      }, 2000);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      logger.error(`采集处理失败: ${errorMsg}`);
      toast.dismiss();
      setError(`保存失败: ${errorMsg}`);
    } finally {
      setIsSaving(false);
    }
  };



  // 丢弃采集
  const handleDiscardCollection = () => {
    setCommandName('');
    setCollectionHistory([]);
    setCollectionCount(0);
    setError(null);
    setShowConfirm(false);
    setConfirmAction(null);
    setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
    setCollectionTime(0);
    setShowTrimUI(false);
    setTrimStart(0);
    setTrimEnd(0);
    setPendingWaveform(null);
    setIsAppendingMode(false);
    setElectrodeCheckResult(null);
  };

  if (showLoginDialog) {
    return (
      <Container>
        <Section>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
            <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px', backgroundColor: '#1a1a1a', border: '1px solid #d4af37', borderRadius: '8px' }}>
              <h2 style={{ color: '#d4af37', marginBottom: '20px', fontSize: '24px' }}>访问受限</h2>
              <p style={{ color: '#999', marginBottom: '30px', lineHeight: '1.6' }}>采集训练需要先登录。请返回首页登录后再进入。</p>
              <Button onClick={() => navigate('/')} className="w-full">
                返回首页登录
              </Button>
            </div>
          </div>
        </Section>
      </Container>
    );
  }

  return (
    <Container>
      <Section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <SectionLabel>02 / COLLECTION MODE</SectionLabel>
            <SectionTitle>采集模式</SectionTitle>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleExportLog}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '12px',
              }}
              title="导出完整的操作日志和波形数据"
            >
              📋 导出日志
            </button>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#666',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '12px',
              }}
            >
              ← 返回主页
            </button>
          </div>
        </div>
        <Divider />

        {/* 硬件状态 */}
        <div style={{ marginBottom: '32px' }}>
          <HardwareStatusComponent />
        </div>

        {/* 指令名称输入 */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#d4af37', fontSize: '14px', fontWeight: '600' }}>
            指令名称
          </label>
          <Input
            value={commandName}
            onChange={(e) => setCommandName(e.target.value)}
            placeholder="输入指令名称（如：向上、向下）"
            disabled={isCollecting}
          />
          {commandExists && commandName && (
            <div style={{ color: '#fbbf24', fontSize: '12px', marginTop: '4px' }}>
              ℹ️ 该指令已存在，继续采集将追加数据
            </div>
          )}
        </div>

        {/* 采集计数 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#888', fontSize: '12px' }}>采集进度</span>
            <span style={{ color: '#d4af37', fontWeight: 'bold' }}>{collectionHistory.length} / 5+</span>
          </div>
          <ProgressBar value={Math.min(collectionHistory.length / 5, 1)} />
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '24px',
            color: '#fca5a5',
            fontSize: '12px',
          }}>
            {error}
          </div>
        )}

        {/* 波形显示 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ color: '#888', fontSize: '12px' }}>
              {isCollecting ? '采集中...' : '波形显示'}
            </span>
          </div>
          <EnhancedWaveformVisualization
            ch1={isCollecting ? currentWaveform.ch1 : collectionHistory.length > 0 ? collectionHistory[collectionHistory.length - 1].waveform.ch1 : []}
            ch2={isCollecting ? currentWaveform.ch2 : collectionHistory.length > 0 ? collectionHistory[collectionHistory.length - 1].waveform.ch2 : []}
            ch3={isCollecting ? currentWaveform.ch3 : collectionHistory.length > 0 ? collectionHistory[collectionHistory.length - 1].waveform.ch3 : []}
            showLayers={true}
            title="三层波形显示 (Raw / Filtered / Envelope)"
          />
        </div>

        {/* 电极检测面板 */}
        {showElectrodeCheck && electrodeCheckResult && (
          <ElectrodeDetectionPanel
            result={electrodeCheckResult}
            isAcceptable={isElectrodeStatusAcceptable(electrodeCheckResult)}
          />
        )}

        {/* 采集控制 */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          justifyContent: 'center',
        }}>
          {/* ✅ 修复：倒计时显示 */}
          {countdownTime > 0 && (
            <div style={{
              textAlign: 'center',
              marginBottom: '24px',
              fontSize: '48px',
              fontWeight: 'bold',
              color: '#d4af37',
            }}>
              {countdownTime}
            </div>
          )}

          {!isCollecting ? (
            <>
              <button
                onClick={handleCheckElectrode}
                disabled={!isConnected}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isConnected ? '#4ade80' : '#666',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isConnected ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                检查电极
              </button>
              <button
                onClick={handleStartCollection}
                disabled={!isConnected}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isConnected ? '#d4af37' : '#666',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isConnected ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                开始采集
              </button>
            </>
          ) : (
            <button
              onClick={handleStopCollection}
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
              停止采集 ({(collectionTime / 1000).toFixed(1)}s)
            </button>
          )}
        </div>

        {/* 采集历史 */}
        {collectionHistory.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ marginBottom: '12px' }}>
              <span style={{ color: '#888', fontSize: '12px' }}>采集历史</span>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '500px',
              overflowY: 'auto',
            }}>
              {collectionHistory.map((col, idx) => {
                // 问题4.1修复：使用专用的颜色函数
                const statusIcon = col.croppingMeta?.stage === 'primary' ? '✅' : col.croppingMeta?.stage === 'fallback' ? '⚠️' : '❌';
                const statusLabel = col.croppingMeta?.stage === 'primary' ? '已裁剪/已缩放' : col.croppingMeta?.stage === 'fallback' ? '已裁剪/已缩放(降级)' : '使用全段';
                const statusColor = col.croppingMeta?.stage === 'primary' ? '#10b981' : col.croppingMeta?.stage === 'fallback' ? '#f59e0b' : '#ef4444';
                const confidencePercent = col.croppingMeta ? (col.croppingMeta.confidence * 100).toFixed(0) : 'N/A';
                
                return (
                  <div key={idx} style={{
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    padding: '12px',
                  }}>
                    <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold' }}>
                        采集 #{col.index} - {col.duration}s
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        backgroundColor: statusColor + '20',
                        border: '1px solid ' + statusColor,
                        borderRadius: '3px',
                        fontSize: '11px'
                      }}>
                        <span>{statusIcon}</span>
                        <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusLabel}</span>
                        <span style={{ color: '#999', marginLeft: '4px' }}>置信度: {confidencePercent}%</span>
                      </div>
                    </div>
                    <div style={{ height: '120px', backgroundColor: '#1a1a1a', borderRadius: '4px', padding: '8px' }}>
                      <ThumbnailWaveform ch1={col.waveform.ch1} ch2={col.waveform.ch2} ch3={col.waveform.ch3} index={col.index} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 质量评分 */}
        {qualityScores.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <ImprovedQualityScoreList
              scores={qualityScores}
              onDelete={handleDeleteCollection}
              onRetry={handleRetryCollection}
            />
          </div>
        )}

        {/* 操作按钮 */}
        {collectionHistory.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            marginBottom: '24px',
          }}>
            <button
              onClick={() => setShowComparisonPanel(true)}
              disabled={collectionHistory.length < 2}
              style={{
                padding: '12px 24px',
                backgroundColor: collectionHistory.length >= 2 ? '#8b5cf6' : '#666',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: collectionHistory.length >= 2 ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              波形对比
            </button>
            <button
              onClick={() => {
                setShowConfirm(true);
                setConfirmAction('complete');
              }}
              disabled={isSaving}  // 禁用按钮
              style={{
                padding: '12px 24px',
                backgroundColor: isSaving ? '#999' : '#4ade80',  // 禁用时变灰
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: isSaving ? 'not-allowed' : 'pointer',  // 禁用时改变光标
                fontWeight: 'bold',
                fontSize: '14px',
                opacity: isSaving ? 0.6 : 1,  // 禁用时降低透明度
              }}
            >
              {isSaving ? '保存中...' : '确认保存'}
            </button>
            <button
              onClick={() => {
                setShowConfirm(true);
                setConfirmAction('discard');
              }}
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
              丢弃数据
            </button>
          </div>
        )}

        {/* 确认对话框 */}
        {showConfirm && (
          <ConfirmDialog
            title={confirmAction === 'complete' ? '保存数据' : '丢弃数据'}
            message={confirmAction === 'complete' ? `确认保存 ${collectionCount} 次采集数据？` : '确认丢弃所有采集数据？'}
            onConfirm={() => {
              if (confirmAction === 'complete') {
                handleCompleteCollection();
              } else {
                handleDiscardCollection();
              }
            }}
            onCancel={() => {
              setShowConfirm(false);
              setConfirmAction(null);
            }}
            isOpen={showConfirm}
          />
        )}

        {/* 波形对比面板 */}
        {showComparisonPanel && collectionHistory.length > 0 && (
          <WaveformComparisonPanel
            waveforms={collectionHistory.map((col) => ({
              index: col.index,
              ch1: col.waveform.ch1,
              ch2: col.waveform.ch2,
              ch3: col.waveform.ch3,
            }))}
            onClose={() => setShowComparisonPanel(false)}
          />
        )}
        
        {/* 异常波形提示对话框 */}
        <AnomalyPromptDialog
          isOpen={showAnomalyDialog}
          commandName={commandName}
          anomalies={anomalies}
          totalWaveforms={pendingCollections.length}
          onConfirm={(indicesToDelete) => handleAnomalyDialogConfirm(indicesToDelete)}
          onCancel={() => setShowAnomalyDialog(false)}
        />
      </Section>
    </Container>
  );

  // 执行保存，不进行异常检测
  const performSaveWithoutAnomalyDetection = async (collectionsToSave: CollectionData[]) => {
    try {
      if (!currentUser) {
        logger.error('用户未登录');
        toast.error('请先登录');
        return;
      }

      setIsSaving(true);
      toast.loading('正在保存采集数据...');
      
      // 为每个采集添加用户信息
      const collectionsWithUser = collectionsToSave.map(col => ({
        ...col,
        userId: currentUser.userId,
        userName: currentUser.userName,
      }));

      // 保存到 IndexedDB
      // ✅ 关键修复：不使用内存缓存，直接从IndexedDB查询最新数据
      const existingCmd = await emgDatabase.getCommand(commandName);
      
      if (existingCmd) {
        // 追加采集到现有指令
        logger.log(`追加采集到指令 "${commandName}"`);
        const updatedCollections = (existingCmd.collections || []).concat(collectionsWithUser.map((col, colIdx) => ({
          index: col.index ?? colIdx,
          timestamp: col.timestamp instanceof Date ? col.timestamp.getTime() : Date.now(),
          waveform: col.waveform,
          duration: col.duration,
          quality: 0.8,
          croppingMeta: col.croppingMeta,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })));
        
        const storedCmd = {
          id: existingCmd.id || `cmd-${commandName}`,
          name: commandName,
          userId: currentUser.userId,
          timestamp: existingCmd.timestamp || Date.now(),
          collections: updatedCollections,
          createdAt: existingCmd.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        await emgDatabase.saveCommand(storedCmd);
      } else {
        // 创建新指令
        logger.log(`创建新指令 "${commandName}"`);
        const storedCmd = {
          id: `cmd-${commandName}`,
          name: commandName,
          userId: currentUser.userId,
          timestamp: Date.now(),
          collections: collectionsWithUser.map((col, colIdx) => ({
            index: col.index ?? colIdx,
            timestamp: col.timestamp instanceof Date ? col.timestamp.getTime() : Date.now(),
            waveform: col.waveform,
            duration: col.duration,
            quality: 0.8,
            croppingMeta: col.croppingMeta,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await emgDatabase.saveCommand(storedCmd);
      }

      logger.log(`保存成功: ${collectionsWithUser.length} 条采集`);
      toast.dismiss();
      toast.success(`保存成功！已保存 ${collectionsWithUser.length} 条采集数据`);
      
      // 重置状态，清空采集历史
      setCollectionHistory([]);
      setCommandName('');
      setError(null);
      setCollectionCount(0);
      setShowConfirm(false);
      setConfirmAction(null);
      setCurrentWaveform({ ch1: [], ch2: [], ch3: [] });
      setCollectionTime(0);
      
    } catch (err) {
      logger.error(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`);
      toast.dismiss();
      toast.error(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };
}
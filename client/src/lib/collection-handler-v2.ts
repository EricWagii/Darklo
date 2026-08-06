/**
 * 采集完成处理函数 V2 - 使用新的独立裁剪算法
 * 
 * 完全替代旧的 handleCompleteCollection 函数
 * 使用 collection-integration 层提供的新算法
 */

import { toast } from 'sonner';
import {
  processCollections,
  getCroppingStatusDescription,
  getSummary,
  removeAnomalies,
  convertToStorageFormat,
  canSave
} from './collection-integration';
import { dataChangeEventManager } from './data-change-events';

export interface CollectionHandlerConfig {
  commandName: string;
  collectionHistory: Array<{
    index?: number;
    timestamp: Date;
    waveform: {
      ch1: number[];
      ch2: number[];
      ch3: number[];
    };
    pipelineMetadata?: any;
    preprocessingMeta?: any;
    croppingMeta?: any;
    normalizationMeta?: any;
  }>;
  currentUser: {
    userId: string | number;
    userName: string;
    isAdmin?: boolean;
  };
  // ✅ 修复：移除savedCommands，改为直接查询IndexedDB
  emgDatabase: any;
  logger: any;
  operationLogger: any;
  FIXED_WAVEFORM_LENGTH?: number;
  SAMPLE_RATE?: number;
}

export interface CollectionHandlerResult {
  success: boolean;
  message: string;
  anomalies?: Array<{
    index: number;
    reason: string;
    confidence: number;
  }>;
  requiresUserAction?: boolean; // 是否需要用户处理异常
  processedWaveforms?: any[]; // 已处理的波形（用于异常删除后保存）
}

export function buildPersistedCollectionRecord(params: {
  waveform: any;
  source?: CollectionHandlerConfig['collectionHistory'][number];
  index: number;
  currentUser: CollectionHandlerConfig['currentUser'];
  now?: number;
}) {
  const now = params.now ?? Date.now();
  const wf = params.waveform;
  return {
    id: `col-${now}-${params.index}-${Math.random().toString(36).substr(2, 9)}`,
    index: params.index,
    timestamp: params.source?.timestamp?.getTime?.() ?? now,
    waveform: { ch1: wf.ch1, ch2: wf.ch2, ch3: wf.ch3 },
    userId: params.currentUser.userId,
    userName: params.currentUser.userName,
    croppingMeta: wf.meta.croppingMeta,
    normalizationMeta: wf.meta.normalizationMeta,
    pipelineMetadata: wf.meta.pipelineMetadata,
    preprocessingMeta: wf.meta.preprocessingMeta ?? params.source?.preprocessingMeta,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 处理采集完成
 */
export async function handleCompleteCollectionV2(
  config: CollectionHandlerConfig
): Promise<CollectionHandlerResult> {
  const {
    commandName,
    collectionHistory,
    currentUser,
    emgDatabase,
    logger,
    operationLogger,
    FIXED_WAVEFORM_LENGTH = 512,
    SAMPLE_RATE = 500
  } = config;

  try {
    // 验证输入
    if (!commandName) {
      return { success: false, message: '请输入指令名称' };
    }

    if (collectionHistory.length === 0) {
      return { success: false, message: '请先采集数据' };
    }

    if (!currentUser) {
      return { success: false, message: '请先登录' };
    }

    // ✅ 修复：直接从IndexedDB查询指令是否存在
    const existingCmd = await emgDatabase.getCommand(commandName);
    const isExistingCommand = !!existingCmd;
    const minCollections = isExistingCommand ? 1 : 5;

    if (collectionHistory.length < minCollections) {
      return {
        success: false,
        message: `${isExistingCommand ? '继续采集' : '新指令'}至少需要 ${minCollections} 条数据`
      };
    }

    logger.log('=== 开始采集完成处理 ===');
    toast.loading('正在处理采集数据...');

    // 采集时已完成三步处理（滤波 -> 裁剪 -> 缩放），直接使用处理结果
    logger.log(`直接使用采集时已处理的 ${collectionHistory.length} 条波形...`);
    
    // 构建已处理的波形对象，用于异常检测
    const processedWaveforms = collectionHistory.map((col, idx) => ({
      ch1: col.waveform.ch1,
      ch2: col.waveform.ch2,
      ch3: col.waveform.ch3,
      meta: {
        // ✅ 修复问题5：添加 croppingMeta 属性
        croppingMeta: (col as any).croppingMeta || {
          startIdx: 0,
          endIdx: col.waveform.ch1.length,
          confidence: 1.0,
          method: 'unified-pipeline',
          stage: 'primary',
          reason: '采集时已完成三步处理'
        },
        // ✅ 修复问题5：添加 pipelineMetadata 属性
        pipelineMetadata: (col as any).pipelineMetadata || {
          originalLength: col.waveform.ch1.length,
          targetLength: FIXED_WAVEFORM_LENGTH,
          timestamp: Date.now(),
          steps: ['filtering', 'cropping', 'normalization']
        },
        // ✅ 修复问题5：保留 normalizationMeta 用于兼容性
        normalizationMeta: col.normalizationMeta || {
          originalLength: col.waveform.ch1.length,
          targetLength: FIXED_WAVEFORM_LENGTH,
          timestamp: Date.now(),
          steps: ['filtering', 'cropping', 'normalization']
        },
        preprocessingMeta: col.preprocessingMeta
      }
    }));

    logger.log(`准备进行异常检测...`);
    operationLogger.log('info', 'Collection', `准备进行异常检测: ${collectionHistory.length} 条波形`);

    // 直接进行异常检测（不重复处理）
    const { detectAnomaliesUsingMahalanobis, formatAnomalyReport } = await import('./anomaly-detection-integration');
    const anomalyReport = detectAnomaliesUsingMahalanobis(processedWaveforms);
    const anomalies = anomalyReport.anomalies.map(a => ({
      index: a.index,
      reason: a.reason,
      confidence: a.confidence
    }));

    // 检查是否有异常
    if (anomalies.length > 0) {
      logger.log(`检测到 ${anomalies.length} 个异常波形`);
      
      // 返回异常信息和已处理的波形，让调用方处理
      return {
        success: false,
        message: `检测到 ${anomalies.length} 个异常波形`,
        anomalies,
        requiresUserAction: true,
        processedWaveforms // 返回已处理的波形
      };
    }

    // 验证是否可以保存
    if (processedWaveforms.length < minCollections) {
      return {
        success: false,
        message: `至少需要 ${minCollections} 条数据`
      };
    }

    // 准备保存数据
    // ✅ 修复15：第一阶段：先查询现有数据以确定下一个索引
    const existingCommand = await emgDatabase.getCommand(commandName);
    const nextIndex = (existingCommand?.collections?.length || 0);
    
    const collectionsToSave = processedWaveforms.map((wf, idx) =>
      buildPersistedCollectionRecord({
        waveform: wf,
        source: collectionHistory[idx],
        index: nextIndex + idx,
        currentUser,
      })
    );

    // 保存到数据库
    logger.log(`保存 ${collectionsToSave.length} 条采集到数据库...`);

    // ✅ 修复2布3：直接从 IndexedDB 查询指令，并合并旧样本
    const commandId = existingCommand?.id || `cmd-${Date.now()}`;

    // ✅ 修复2：合并旧样本和新样本，而不是覆盖
    const mergedCollections = existingCommand
      ? [...(existingCommand.collections || []), ...collectionsToSave]
      : collectionsToSave;

    const storedCommand = {
      id: commandId,
      name: commandName,
      userId: currentUser.userId,
      timestamp: existingCommand?.timestamp || Date.now(),
      collections: mergedCollections,
      createdAt: existingCommand?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    await emgDatabase.saveCommand(storedCommand);
    logger.log(`指令 "${commandName}" 已保存到数据库（本次新增 ${collectionsToSave.length} 条，累计 ${mergedCollections.length} 条`);

    // ✅ 修改7：发送指令保存事件，通知其他页面刷新缓存
    dataChangeEventManager.emitCommandSaved(commandName, 'CollectionMode');

    // 生成成功消息
    const durationMs = (FIXED_WAVEFORM_LENGTH / SAMPLE_RATE) * 1000;
    const successMsg = `✓ 指令 "${commandName}" 已保存！
本次新增：${collectionsToSave.length} 条
累计采集：${mergedCollections.length} 条
归一化时长：${durationMs.toFixed(0)}ms

✓ 所有采集已自动处理，数据质量已保证。`;

    logger.log(`指令 "${commandName}" 保存成功`);
    operationLogger.log('info', 'Collection', `指令 "${commandName}" 保存成功: 本次新增 ${collectionsToSave.length} 条，累计 ${mergedCollections.length} 条`);
    
    toast.dismiss();
    toast.success(successMsg, { duration: 5000 });

    logger.log('=== 采集完成处理成功 ===');
    operationLogger.log('info', 'Collection', `采集保存成功: 新增${collectionsToSave.length}条，累计${mergedCollections.length}条`);

    return {
      success: true,
      message: successMsg,
      processedWaveforms // 返回已处理的波形供后续使用
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误';
    logger.error(`采集处理失败: ${errorMsg}`);
    operationLogger.log('error', 'Collection', `采集处理失败: ${errorMsg}`);

    toast.dismiss();
    toast.error(`保存失败: ${errorMsg}`, { duration: 5000 });

    return {
      success: false,
      message: `保存失败: ${errorMsg}`
    };
  }
}

/**
 * 处理用户删除异常波形后的保存
 */
export async function handleSaveAfterAnomalyRemoval(
  config: CollectionHandlerConfig,
  processedWaveforms: any[],
  indicesToRemove: number[]
): Promise<CollectionHandlerResult> {
  const {
    commandName,
    currentUser,
    emgDatabase,
    logger,
    operationLogger,
    SAMPLE_RATE = 500
  } = config;

  try {
    // 删除异常波形
    const filteredWaveforms = removeAnomalies(processedWaveforms, indicesToRemove);

    if (filteredWaveforms.length === 0) {
      return {
        success: false,
        message: '至少需要保留 1 条波形'
      };
    }

    logger.log(`删除 ${indicesToRemove.length} 条异常波形后，剩余 ${filteredWaveforms.length} 条`);

    // 准备保存数据
    const existingCommand = await emgDatabase.getCommand(commandName);
    const nextIndex = existingCommand?.collections?.length || 0;

    const collectionsToSave = filteredWaveforms.map((wf, idx) =>
      buildPersistedCollectionRecord({
        waveform: wf,
        index: nextIndex + idx,
        currentUser,
      })
    );

    // 保存到数据库
    // ✅ 修复3：直接从IndexedDB查询指令，并合并旧样本
    const commandId = existingCommand?.id || `cmd-${Date.now()}`;

    // ✅ 修复3：合并旧样本和新样本，而不是覆盖
    const mergedCollections = existingCommand
      ? [...(existingCommand.collections || []), ...collectionsToSave]
      : collectionsToSave;

    const storedCommand = {
      id: commandId,
      name: commandName,
      userId: currentUser.userId,
      timestamp: existingCommand?.timestamp || Date.now(),
      collections: mergedCollections,
      createdAt: existingCommand?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    await emgDatabase.saveCommand(storedCommand);
    logger.log(`指令 "${commandName}" 已保存到数据库（已删除异常波形，本次新增 ${collectionsToSave.length} 条，累计 ${mergedCollections.length} 条）`);

    toast.dismiss();
    toast.success(`✓ 已保存 ${collectionsToSave.length} 条采集（累计 ${mergedCollections.length} 条）`, { duration: 5000 });

    return {
      success: true,
      message: `已保存 ${collectionsToSave.length} 条采集（累计 ${mergedCollections.length} 条）`
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '未知错误';
    logger.error(`保存失败: ${errorMsg}`);

    toast.dismiss();
    toast.error(`保存失败: ${errorMsg}`, { duration: 5000 });

    return {
      success: false,
      message: `保存失败: ${errorMsg}`
    };
  }
}

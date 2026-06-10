/**
 * 数据管理页面 - 高端商业风格
 * 
 * 功能：
 * - 查看所有采集数据
 * - 按指令分类显示
 * - 查看每条指令的所有采集波形
 * - 删除单条采集
 * - 继续采集已有指令
 * - 导出数据
 * - 识别准确率统计
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Divider,
  Grid,
} from '@/components/PremiumComponents';
import { ThumbnailWaveform } from '@/components/WaveformVisualization';
import { useUserSession } from '@/contexts/UserSessionContext';
import { logAuditEvent, AuditEventType } from '@/lib/audit-log';
import { dataChangeEventManager, DataChangeEventType } from '@/lib/data-change-events';
import { emgDatabase } from '@/lib/db';
import { LengthDistributionChart } from '@/components/LengthDistributionChart';
import { analyzeLengthDistribution, LengthDistributionStats } from '@/lib/length-distribution-analysis';
import { AccuracyDiagnostic, AccuracyDiagnosticReport } from '@/lib/accuracy-diagnostic';
import {
  exportRecognitionResultsToCSV,
  exportRecognitionResultsToJSON,
  exportRecognitionSummary,
  exportCollectionSummary,
  exportToCSV,
  exportToJSON,
  type RecognitionResultForExport,
} from '@/lib/data-export';
import { CroppingStatusBadgeSimple } from '@/components/CroppingStatusBadge';


interface CollectionData {
  id: string;  // UUID主键，不会因为削除而错位
  index: number;
  timestamp: number | Date;
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] };
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  userId?: string;  // 采集用户 ID
  userName?: string;  // 采集用户名
  // 识别结果字段
  recognitionResults?: Array<{
    timestamp: number | Date;
    predicted: string;  // 模型预测的指令
    actual: string;     // 用户选择的正确指令
    isCorrect: boolean; // 是否正确
    similarity?: number;
    confidence?: number;
  }>;
}

interface CommandData {
  name: string;
  collections: CollectionData[];
  createdAt: number | Date;
  accuracy?: number;
}

export default function DataManagement() {
  const [location, navigate] = useLocation();
  const { currentUser, isLoggedIn } = useUserSession();

  const [commandsData, setCommandsData] = useState<CommandData[]>([]);
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string | 'all'>('all');  // 用户过滤
  const [allUsers, setAllUsers] = useState<Array<{userId: string; userName: string}>>([]);  // 所有用户列表
  const [lengthStats, setLengthStats] = useState<Map<string, LengthDistributionStats>>(new Map());  // 长度分布统计
  const [selectedCommandForStats, setSelectedCommandForStats] = useState<string | null>(null);  // 选中的指令用于显示统计
  const [isClearingData, setIsClearingData] = useState(false);

  // 检查用户登录状态
  if (!isLoggedIn) {
    return (
      <Container>
        <Section>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
            <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px', backgroundColor: '#1a1a1a', border: '1px solid #d4af37', borderRadius: '8px' }}>
              <h2 style={{ color: '#d4af37', marginBottom: '20px', fontSize: '24px' }}>访问受限</h2>
              <p style={{ color: '#999', marginBottom: '30px', lineHeight: '1.6' }}>数据管理需要先登录。请返回首页登录后再进入。</p>
              <Button onClick={() => navigate('/')} className="w-full">
                返回首页登录
              </Button>
            </div>
          </div>
        </Section>
      </Container>
    );
  }

  // 计算指令的平均准确率
  const calculateCommandAccuracy = (recognitionRecords: any[], validCommandNames?: Set<string>): number => {
    if (!recognitionRecords || recognitionRecords.length === 0) return 0;
    
    // ✅ 修复3：只计算有效指令的识别记录
    // 并且只计算有效的 isCorrect 值（必须是布尔类型）
    let validRecords = recognitionRecords.filter((r: any) => typeof r.isCorrect === 'boolean');
    
    // ✅ 修复3：如果提供了有效指令名称集合，进一步过滤
    if (validCommandNames) {
      validRecords = validRecords.filter((r: any) => {
        const cmdName = r.actualCommand || r.commandName;
        return validCommandNames.has(cmdName);
      });
    }
    
    if (validRecords.length === 0) return 0;
    
    let correctTests = 0;
    validRecords.forEach((record) => {
      if (record.isCorrect === true) {
        correctTests++;
      }
    });
    
    return correctTests / validRecords.length;
  };

  // 从 IndexedDB 加载数据
  const loadData = async () => {
    try {
      // 直接从 emgDatabase 加载，不使用 getDataStatistics 以避免竞态条件
      const [commands, recognitionRecords] = await Promise.all([
        emgDatabase.getAllCommands(),
        emgDatabase.getAllRecognitionRecords(),
      ]);
      console.log(`[数据加载] 从 IndexedDB 读取 ${commands?.length || 0} 条指令, ${recognitionRecords?.length || 0} 条识别记录`);
      if (commands && commands.length > 0) {
        // ✅ 修复：不再合并同名指令
        // 因为现在每个指令都有唯一的key（commandName），不应该有重复
        // 如果有重复，说明数据有问题，应该直接显示
        const mergedCommands = commands.map((cmd: any) => ({
          ...cmd,
          collections: cmd.collections || [],
        }));
        console.log(`[数据加载] 加载 ${mergedCommands.length} 条指令（不再合并同名指令）`);
        
        // 计算每个指令的平均准确率
        // ✅ 修复3：传递有效指令名称集合，确保只统计当前有效指令
        const validCommandNames = new Set(mergedCommands.map((cmd: any) => cmd.name));
        const commandsWithAccuracy = mergedCommands.map((cmd: any) => {
          // ✅ 修复3：兼容新旧数据格式
          // 优先使用 actualCommand（新格式），回退到 commandName（旧格式）
          const cmdRecords = recognitionRecords?.filter((r: any) => {
            const actual = r.actualCommand || r.commandName;
            return actual === cmd.name;
          }) || [];
          return {
            ...cmd,
            accuracy: calculateCommandAccuracy(cmdRecords, validCommandNames),
          };
        });
        setCommandsData(commandsWithAccuracy);

        // 收集所有用户
        const userSet = new Set<string>();
        const userMap = new Map<string, {userId: string; userName: string}>();
        commands.forEach((cmd: any) => {
          cmd.collections?.forEach((col: any) => {
            if (col.userId && col.userName) {
              userSet.add(col.userId);
              userMap.set(col.userId, { userId: col.userId, userName: col.userName });
            }
          });
        });
        setAllUsers(Array.from(userMap.values()));

        // 计算长度分布统计
        const statsMap = new Map<string, LengthDistributionStats>();
        commands.forEach((cmd: any) => {
          const stats = analyzeLengthDistribution(cmd.name, cmd.collections || []);
          statsMap.set(cmd.name, stats);
        });
        setLengthStats(statsMap);
      } else {
        // 修复：当没有数据时，清空所有状态
        console.log(`[数据加载] 没有指令数据，清空所有状态`);
        setCommandsData([]);
        setAllUsers([]);
        setLengthStats(new Map());
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };

  useEffect(() => {
    loadData();
    // 注意：垃圾数据清理已移到应用初始化阶段（app-initialization.ts）
    // 这样可以避免重复清理，并确保数据一致性
  }, []);

  // 删除单条采集
  const handleDeleteCollection = async (commandName: string, collectionId: string | undefined, collectionIndex?: number) => {
    // 直接删除，不需要确认
    try {
      // ✅ 修复：只在数据库中删除，不要修改内存状态
      if (collectionId && collectionId !== 'undefined') {
        // 新数据：使用UUID删除
        await emgDatabase.deleteCollection(collectionId);
        console.log(`[删除波形成功] 指令: ${commandName}, 采集ID: ${collectionId}`);
      } else if (collectionIndex !== undefined) {
        // 旧数据：使用index删除（需要找到对应的collectionId）
        const cmd = commandsData.find(c => c.name === commandName);
        if (!cmd) throw new Error('指令不存在');
        const collection = cmd.collections[collectionIndex];
        if (!collection) throw new Error('采集不存在');
        await emgDatabase.deleteCollection(collection.id);
        console.log(`[删除波形成功] 指令: ${commandName}, 采集索引: ${collectionIndex}`)
      } else {
        throw new Error('无法确定删除的采集');
      }
      
      // ✅ 修复：重新加载数据而不是手动修改UI
      // 这样可以确保UI和数据库保持一致
      await loadData();
      
      // 显示成功提示
      toast.success(`采集已永久删除`);
      
      // ✅ 关键修复：发送数据变更事件，通知所有页面清空缓存
      if (collectionId && collectionId !== 'undefined') {
        dataChangeEventManager.emitCollectionDeleted(commandName, collectionId, 'DataManagement');
      } else {
        dataChangeEventManager.emitCollectionDeleted(commandName, `index-${collectionIndex}`, 'DataManagement');
      }
      
      // 记录删除事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.COLLECTION_DELETE,
          { commandName, collectionId, collectionIndex },
          currentUser.userId.toString()
        );
      }
    } catch (error) {
      console.error('删除波形失败:', error);
      toast.error(`删除波形失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 删除指令
  const handleDeleteCommand = async (commandName: string) => {
    // 直接删除，不需要确认
    if (true) {
      const command = commandsData.find(cmd => cmd.name === commandName);
      
      try {
        console.log(`[开始删除指令] ${commandName}`);
        
        // ✅ 修复：直接删除，不再验证
        await emgDatabase.deleteCommand(commandName);
        console.log(`[指令已从数据库删除] ${commandName}`);
        
        // ✅ 修复：重新加载数据而不是手动修改UI
        await loadData();
        
        // 清除长度统计缓存
        const newStats = new Map(lengthStats);
        newStats.delete(commandName);
        setLengthStats(newStats);
        
        // 如果删除的是当前选中的指令，清除选中状态
        if (selectedCommandForStats === commandName) {
          setSelectedCommandForStats(null);
        }
        
        // 显示成功提示
        toast.success(`已删除指令 "${commandName}"`);
        
        // ✅ 关键修复：发送数据变更事件，通知所有页面清空缓存
        dataChangeEventManager.emitCommandDeleted(commandName, 'DataManagement');
        
        // 记录删除事件
        if (currentUser) {
          logAuditEvent(
            AuditEventType.COLLECTION_DELETE,
            { commandName, collectionsCount: command?.collections.length || 0 },
            currentUser.userId.toString()
          );
        }
      } catch (error) {
        console.error(`[指令删除失败]`, error);
        toast.error('删除指令失败，请重试');
      }
    }
  };

  // 继续采集
  const handleContinueCollection = (commandName: string) => {
    // 导航到采集页面并传递指令名称
    navigate(`/collection?command=${encodeURIComponent(commandName)}`);
  };

  // 导出采集数据为CSV
  const handleExportCollectionsCSV = () => {
    if (commandsData.length === 0) {
      toast.error('没有采集数据可导出');
      return;
    }
    try {
      exportToCSV(commandsData);
      toast.success('采集数据已导出为CSV');
      logAuditEvent(AuditEventType.EXPORT, { action: '导出采集数据为CSV', format: 'csv' });
    } catch (error) {
      toast.error('导出失败');
      console.error('Export error:', error);
    }
  };

  // 导出采集数据为JSON
  const handleExportCollectionsJSON = () => {
    if (commandsData.length === 0) {
      toast.error('没有采集数据可导出');
      return;
    }
    try {
      exportToJSON(commandsData);
      toast.success('采集数据已导出为JSON');
      logAuditEvent(AuditEventType.EXPORT, { action: '导出采集数据为JSON', format: 'json' });
    } catch (error) {
      toast.error('导出失败');
      console.error('Export error:', error);
    }
  };

  // 导出采集统计摘要
  const handleExportCollectionSummary = () => {
    if (commandsData.length === 0) {
      toast.error('没有采集数据可导出');
      return;
    }
    try {
      exportCollectionSummary(commandsData);
      toast.success('采集统计摘要已导出');
      logAuditEvent(AuditEventType.EXPORT, { action: '导出采集统计摘要' });
    } catch (error) {
      toast.error('导出失败');
      console.error('Export error:', error);
    }
  };

  // 导出识别结果为CSV
  const handleExportRecognitionResultsCSV = async () => {
    try {
      // 从 RECOGNITION_RECORDS 表中读取识别结果
      const recognitionRecords = await emgDatabase.getAllRecognitionRecords();
      
      if (!recognitionRecords || recognitionRecords.length === 0) {
        toast.error('没有识别结果可导出');
        return;
      }

      // ✅ 修复3：只导出当前有效指令的识别记录
      const allCommands = await emgDatabase.getAllCommands();
      const validCommandNames = new Set(allCommands.map((cmd: any) => cmd.name));
      
      const validRecords = recognitionRecords.filter((record: any) => {
        const cmdName = record.actualCommand || record.commandName;
        return validCommandNames.has(cmdName);
      });

      if (validRecords.length === 0) {
        toast.error('没有有效的识别结果可导出（已删除指令的记录被过滤）');
        return;
      }

      // ✅ Phase 5：转换为导出格式，包含所有诊断字段（统一为 0-100 分）
      const recognitionResults: RecognitionResultForExport[] = validRecords.map((record: any) => ({
        command: record.actualCommand || record.commandName || 'unknown',
        predictedCommand: record.predictedCommand || record.commandName || 'unknown',
        actualCommand: record.actualCommand || undefined,
        isCorrect: record.isCorrect,
        confidence: record.confidence ?? record.similarity ?? 0,  // 0-100 分
        allScores: record.allScores || [],
        threshold: record.threshold ?? 0.7,
        topK: record.topK ?? 5,
        recordType: record.recordType || 'unknown',
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
        // ✅ Phase 5：添加诊断字段（统一为 0-100 分）
        top1Score: record.top1Score ?? 0,  // 0-100
        top2Score: record.top2Score ?? 0,  // 0-100
        scoreMargin: record.scoreMargin ?? 0,  // 0-100
        channelWeights: record.channelWeights || { ch1: 0.30, ch2: 0.60, ch3: 0.10 },
        channelDiagnostics: record.channelDiagnostics || {},
        matchedCollectionScores: record.matchedCollectionScores || [],
      }));

      exportRecognitionResultsToCSV(recognitionResults);
      toast.success(`识别结果已导出Csv (${validRecords.length}/${recognitionRecords.length} 条有效记录 - 包含诊断信息)`);
      logAuditEvent(AuditEventType.EXPORT, { action: '导出识别结果为CSV', count: validRecords.length, total: recognitionRecords.length, withDiagnostics: true });
    } catch (error) {
      toast.error('导出失败');
      console.error('Export error:', error);
    }
  };

  // 导出识别结果为JSON
  const handleExportRecognitionResultsJSON = async () => {
    try {
      // 从 RECOGNITION_RECORDS 表中读取识别结果
      const recognitionRecords = await emgDatabase.getAllRecognitionRecords();
      
      if (!recognitionRecords || recognitionRecords.length === 0) {
        toast.error('没有识别结果可导出');
        return;
      }

      // ✅ 修复3：只导出当前有效指令的识别记录
      const allCommands = await emgDatabase.getAllCommands();
      const validCommandNames = new Set(allCommands.map((cmd: any) => cmd.name));
      
      const validRecords = recognitionRecords.filter((record: any) => {
        const cmdName = record.actualCommand || record.commandName;
        return validCommandNames.has(cmdName);
      });

      if (validRecords.length === 0) {
        toast.error('没有有效的识别结果可导出（已删除指令的记录被过滤）');
        return;
      }

      // ✅ 修复：转换为导出格式，包含所有字段
      const recognitionResults: RecognitionResultForExport[] = validRecords.map((record: any) => ({
        command: record.actualCommand || record.commandName || 'unknown',
        predictedCommand: record.predictedCommand || record.commandName || 'unknown',
        actualCommand: record.actualCommand || undefined,
        isCorrect: record.isCorrect,
        confidence: record.confidence ?? record.similarity ?? 0,
        allScores: record.allScores || [],
        threshold: record.threshold ?? 0.7,  // ✅ 修复：添加 threshold
        topK: record.topK ?? 5,  // ✅ 修复：添加 topK
        recordType: record.recordType || 'unknown',  // ✅ 修复：添加 recordType
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
        // ✅ Phase 6：JSON 导出与 CSV 保持一致，避免诊断包缺失关键字段
        top1Score: record.top1Score ?? 0,
        top2Score: record.top2Score ?? 0,
        scoreMargin: record.scoreMargin ?? 0,
        channelWeights: record.channelWeights || { ch1: 0.30, ch2: 0.60, ch3: 0.10 },
        channelDiagnostics: record.channelDiagnostics || {},
        matchedCollectionScores: record.matchedCollectionScores || [],
      }));

      exportRecognitionResultsToJSON(recognitionResults);
      toast.success(`识别结果已导出为JSON (${validRecords.length}/${recognitionRecords.length} 条有效记录)`);
      logAuditEvent(AuditEventType.EXPORT, { action: '导出识别结果为JSON', count: validRecords.length, total: recognitionRecords.length });
    } catch (error) {
      toast.error('导出失败');
      console.error('Export error:', error);
    }
  };

  // 导出识别统计摘要
  const handleExportRecognitionSummary = async () => {
    try {
      const recognitionRecords = await emgDatabase.getAllRecognitionRecords();
      if (!recognitionRecords || recognitionRecords.length === 0) {
        toast.error('没有识别结果可导出');
        return;
      }
      const recognitionResults: RecognitionResultForExport[] = recognitionRecords.map((record: any) => ({
        // ✅ 修复：添加所有字段
        predictedCommand: record.predictedCommand || record.commandName || 'unknown',
        actualCommand: record.actualCommand,
        command: record.actualCommand || record.commandName || 'unknown',
        confidence: record.confidence ?? record.similarity ?? 0,
        allScores: record.allScores,
        threshold: record.threshold,
        topK: record.topK,
        isCorrect: record.isCorrect,
        recordType: record.recordType,
        croppingMeta: undefined,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : new Date(record.timestamp).getTime(),
      }));
      exportRecognitionSummary(recognitionResults);
      toast.success('识别统计摘要已导出');
      logAuditEvent(AuditEventType.EXPORT, { action: '导出识别统计摘要', count: recognitionResults.length });
    } catch (error) {
      toast.error('导出失败');
      console.error('Export error:', error);
    }
  };

  // 导出数据（保留原有的JSON导出）
  const handleExportData = () => {
    handleExportCollectionsJSON();
  };

  // 清除指定日期范围内的数据
  const handleDeleteDataByDateRange = async () => {
    const startDateStr = prompt('请输入开始日期 (YYYY-MM-DD)，例如: 2026-05-22');
    if (!startDateStr) return;

    const endDateStr = prompt('请输入结束日期 (YYYY-MM-DD)，例如: 2026-05-27');
    if (!endDateStr) return;

    try {
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);
      
      // 设置结束日期为该天的23:59:59
      endDate.setHours(23, 59, 59, 999);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        toast.error('日期格式不正确，请使用 YYYY-MM-DD 格式');
        return;
      }

      if (startDate > endDate) {
        toast.error('开始日期不能晚于结束日期');
        return;
      }

      const confirmed = window.confirm(
        `确定要删除 ${startDateStr} 到 ${endDateStr} 期间的所有采集数据吗？此操作无法撤销。`
      );
      
      if (!confirmed) return;

      // 使用emgDatabase删除指定日期范围内的采集数据
      const commands = await emgDatabase.getAllCommands();
      let deletedCount = 0;
      
      for (const command of commands) {
        if (command.collections && command.collections.length > 0) {
          const filteredCollections = command.collections.filter((col: any) => {
            const colDate = new Date(col.timestamp);
            return !(colDate >= startDate && colDate <= endDate);
          });
          
          const countDeleted = command.collections.length - filteredCollections.length;
          if (countDeleted > 0) {
            deletedCount += countDeleted;
            
            // 如果该指令的所有采集都被删除，则删除整个指令
            if (filteredCollections.length === 0) {
              await emgDatabase.deleteCommand(command.name);
            } else {
              // 否则只删除指定日期范围内的采集
              command.collections = filteredCollections;
              await emgDatabase.saveCommand(command);
            }
          }
        }
      }
      
      // 重新加载数据
      await loadData();
      
      toast.success(`已删除 ${deletedCount} 条采集数据`);
      logAuditEvent(
        AuditEventType.COLLECTION_DELETE,
        { action: '删除日期范围内的数据', startDate: startDateStr, endDate: endDateStr, deletedCount },
        currentUser?.userId.toString()
      );
    } catch (error) {
      toast.error(`删除数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
      console.error('Delete by date range error:', error);
    }
  };

  // 过滤采集数据
  const getFilteredCommands = () => {
    if (filterUserId === 'all') {
      return commandsData;
    }
    return commandsData.map((cmd) => ({
      ...cmd,
      collections: cmd.collections.filter((col) => col.userId === filterUserId),
    })).filter((cmd) => cmd.collections.length > 0);
  };

  const filteredCommands = getFilteredCommands();

  return (
    <div className="min-h-screen">
      {/* 顶部导航 */}
      <div
        className="border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'rgba(26, 26, 26, 0.7)',
        }}
      >
        <Container className="py-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="label mb-2">DATA MANAGEMENT</div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                采集数据管理
              </h1>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={() => navigate('/')}>
                返回首页
              </Button>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={handleExportCollectionsCSV} 
                  disabled={commandsData.length === 0}
                >
                  采集(CSV)
                </Button>
                <Button 
                  onClick={handleExportCollectionsJSON} 
                  disabled={commandsData.length === 0}
                >
                  采集(JSON)
                </Button>
                <Button 
                  onClick={handleExportCollectionSummary} 
                  disabled={commandsData.length === 0}
                >
                  采集摘要
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={handleExportRecognitionResultsCSV} 
                  disabled={commandsData.length === 0}
                >
                  识别(CSV)
                </Button>
                <Button 
                  onClick={handleExportRecognitionResultsJSON} 
                  disabled={commandsData.length === 0}
                >
                  识别(JSON)
                </Button>
                <Button 
                  onClick={handleExportRecognitionSummary} 
                  disabled={commandsData.length === 0}
                >
                  识别摘要
                </Button>
              </div>
              <Button 
                variant="secondary" 
                onClick={handleDeleteDataByDateRange}
                disabled={commandsData.length === 0}
              >
                删除日期范围内的数据
              </Button>
              <Button 
                variant="error" 
                onClick={async () => {
                  if (window.confirm('确定要清除所有采集数据吗？此操作无法撤销。')) {
                    setIsClearingData(true);
                    try {
                      await emgDatabase.clearAllCommands();
                      setCommandsData([]);
                      setLengthStats(new Map());
                      setExpandedCommand(null);
                      setSelectedCommandForStats(null);
                      dataChangeEventManager.emitAllDataCleared('DataManagement');
                      toast.success('所有数据已清除');
                    } catch (error) {
                      toast.error('清除数据失败');
                      console.error(error);
                    } finally {
                      setIsClearingData(false);
                    }
                  }
                }}
                disabled={isClearingData}
              >
                {isClearingData ? '清除中...' : '清除所有数据'}
              </Button>
            </div>
          </div>
        </Container>
      </div>

      {/* 主内容 */}
      <Container>
        <Section>
          <SectionLabel number="01">COLLECTION OVERVIEW</SectionLabel>
          <SectionTitle>
            采集数据统计
          </SectionTitle>

          <Grid cols={3} gap="lg" className="mb-12">
            <Card>
              <div className="label mb-4">已采集指令</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {filteredCommands.length}
              </div>
              <p className="text-secondary text-sm">个指令</p>
            </Card>

            <Card>
              <div className="label mb-4">总采集数</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {filteredCommands.reduce((sum, cmd) => sum + cmd.collections.length, 0)}
              </div>
              <p className="text-secondary text-sm">条波形</p>
            </Card>

            <Card>
              <div className="label mb-4">平均准确率</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {filteredCommands.length > 0
                  ? ((filteredCommands.reduce((sum, cmd) => sum + (cmd.accuracy || 0), 0) / filteredCommands.length) * 100).toFixed(1)
                  : '0'}
                %
              </div>
              <p className="text-secondary text-sm">平均</p>
            </Card>
          </Grid>

          <Divider />

          {/* 用户过滤 */}
          <Section className="py-8">
            <SectionLabel>FILTER BY USER</SectionLabel>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filterUserId === 'all' ? 'primary' : 'secondary'}
                onClick={() => setFilterUserId('all')}
              >
                所有用户
              </Button>
              {allUsers.map((user) => (
                <Button
                  key={user.userId}
                  variant={filterUserId === user.userId ? 'primary' : 'secondary'}
                  onClick={() => setFilterUserId(user.userId)}
                >
                  {user.userName}
                </Button>
              ))}
            </div>
          </Section>

          <Divider />

          {/* 指令列表 */}
          <Section className="py-8">
            <SectionLabel>COMMANDS</SectionLabel>

            {filteredCommands.length === 0 ? (
              <Card>
                <p className="text-center text-secondary py-12">暂无采集数据</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredCommands.map((cmd, idx) => (
                  <Card key={idx}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-accent mb-2">{cmd.name}</h3>
                        <p className="text-secondary text-sm">
                          {cmd.collections.length} 条采集 · 准确率: {((cmd.accuracy || 0) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleContinueCollection(cmd.name)}
                        >
                          继续采集
                        </Button>
                        <Button
                          variant="error"
                          onClick={() => handleDeleteCommand(cmd.name)}
                        >
                          删除指令
                        </Button>
                      </div>
                    </div>

                    {/* 展开/收起按钮 */}
                    <div className="mb-4">
                      <Button
                        variant="secondary"
                        onClick={() => setExpandedCommand(expandedCommand === cmd.name ? null : cmd.name)}
                      >
                        {expandedCommand === cmd.name ? '收起' : '展开'} ({cmd.collections.length} 条)
                      </Button>
                    </div>

                    {/* 展开的采集列表 */}
                    {expandedCommand === cmd.name && (
                      <div className="space-y-4 mt-4 pt-4 border-t border-border">
                        {cmd.collections.map((col, colIdx) => (
                          <div key={colIdx} className="flex justify-between items-center p-4 bg-background rounded">
                            <div className="flex-1">
                              <div className="flex gap-4 items-start">
                                <div style={{ width: '200px', height: '60px' }}>
                                  <ThumbnailWaveform
                                    ch1={col.waveform.ch1}
                                    ch2={col.waveform.ch2}
                                    ch3={col.waveform.ch3}
                                    index={col.index}
                                    onDelete={() => handleDeleteCollection(cmd.name, col.id, colIdx)}
                                  />
                                </div>
                                <div>
                                  <p className="text-secondary text-sm">
                                    采集 #{col.index} - {col.duration}s
                                  </p>
                                  {col.userName && (
                                    <p className="text-secondary text-sm">
                                      用户: {col.userName}
                                    </p>
                                  )}
                                  {col.timestamp && (
                                    <p className="text-secondary text-sm">
                                      时间: {new Date(col.timestamp).toLocaleString()}
                                    </p>
                                  )}
                                  {/* 问题4.2修复：显示处理状态徽章 */}
                                  {(col as any).croppingMeta && (
                                    <div className="mt-2">
                                      <CroppingStatusBadgeSimple
                                        croppingMeta={(col as any).croppingMeta}
                                        showConfidence={true}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="error"
                              onClick={() => handleDeleteCollection(cmd.name, col.id, colIdx)}
                            >
                              删除
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 长度分布统计 */}
                    {selectedCommandForStats === cmd.name && lengthStats.has(cmd.name) && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <LengthDistributionChart stats={lengthStats.get(cmd.name)!} />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Section>
        </Section>
      </Container>
    </div>
  );
}

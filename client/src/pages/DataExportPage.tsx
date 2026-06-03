import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { emgDatabase } from '@/lib/db';
import { useUserSession } from '@/contexts/UserSessionContext';
import { toast } from 'sonner';
import JSZip from 'jszip';

interface CommandInfo {
  name: string;
  collectionCount: number;
}

export default function DataExportPage() {
  const [, navigate] = useLocation();
  const { isLoggedIn } = useUserSession();
  const [commands, setCommands] = useState<CommandInfo[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  // 访问控制
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>访问受限</CardTitle>
            <CardDescription>数据导出页面仅供已登录用户使用</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              返回首页
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 加载指令列表
  useEffect(() => {
    const loadCommands = async () => {
      try {
        const allCommands = await emgDatabase.getAllCommands();
        if (allCommands && allCommands.length > 0) {
          const commandInfos = allCommands.map((cmd: any) => ({
            name: cmd.name,
            collectionCount: cmd.collections ? cmd.collections.length : 0,
          }));
          setCommands(commandInfos);
          if (commandInfos.length > 0) {
            setSelectedCommand(commandInfos[0].name);
          }
        }
      } catch (err) {
        console.error('加载指令列表失败:', err);
        toast.error('❌ 加载指令列表失败');
      }
    };

    loadCommands();
  }, []);

  // 导出完整数据为JSON
  const handleExportJSON = async () => {
    if (!selectedCommand) {
      toast.error('请选择一条指令');
      return;
    }

    setIsExporting(true);
    try {
      let command = await emgDatabase.getCommand(selectedCommand);
      
      if (!command) {
        throw new Error('无法找到指令数据');
      }

      // 确保数据格式正确
      if (!command.name) command.name = selectedCommand;
      if (!command.collections || !Array.isArray(command.collections)) {
        command.collections = [];
      }

      // 生成完整的导出数据（使用新的统一处理流程）
      const exportData = {
        exportTime: new Date().toISOString(),
        exportVersion: '3.0',
        commandName: selectedCommand,
        totalCollections: command.collections.length,
        processingAlgorithm: '空白裁剪 + 线性插值缩放',
        collections: command.collections.map((collection: any, index: number) => ({
          index: index,
          timestamp: collection.timestamp || Date.now(),
          userId: collection.userId,
          userName: collection.userName,
          processedWaveform: {
            ch1: collection.waveform?.ch1 || [],
            ch2: collection.waveform?.ch2 || [],
            ch3: collection.waveform?.ch3 || [],
            length: collection.waveform?.ch1?.length || 0,
          },
          croppingMetadata: {
            stage: collection.croppingMeta?.stage || 'unknown',
            method: collection.croppingMeta?.method || 'unknown',
            confidence: collection.croppingMeta?.confidence || 0,
            startIdx: collection.croppingMeta?.startIdx || 0,
            endIdx: collection.croppingMeta?.endIdx || 0,
            reason: collection.croppingMeta?.reason || '',
          },
          quality: collection.quality || 0.8,
          createdAt: collection.createdAt || Date.now(),
          updatedAt: collection.updatedAt || Date.now(),
        })),
        statistics: generateStatistics(command.collections),
      };

      // 下载JSON文件
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedCommand}-export-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`✅ 已导出 ${command.collections.length} 条采集数据`);
    } catch (error) {
      console.error('导出失败:', error);
      toast.error(`❌ 导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 导出完整数据为ZIP
  const handleExportZIP = async () => {
    if (!selectedCommand) {
      toast.error('请选择一条指令');
      return;
    }

    setIsExporting(true);
    try {
      let command = await emgDatabase.getCommand(selectedCommand);
      
      if (!command) {
        throw new Error('无法找到指令数据');
      }

      // 确保数据格式正确
      if (!command.name) command.name = selectedCommand;
      if (!command.collections || !Array.isArray(command.collections)) {
        command.collections = [];
      }

      const zip = new JSZip();

      // 生成完整的导出数据
      const exportData = {
        exportTime: new Date().toISOString(),
        exportVersion: '3.0',
        commandName: selectedCommand,
        totalCollections: command.collections.length,
        processingAlgorithm: '空白裁剪 + 线性插值缩放',
        collections: command.collections.map((collection: any, index: number) => ({
          index: index,
          timestamp: collection.timestamp || Date.now(),
          userId: collection.userId,
          userName: collection.userName,
          processedWaveform: {
            ch1: collection.waveform?.ch1 || [],
            ch2: collection.waveform?.ch2 || [],
            ch3: collection.waveform?.ch3 || [],
            length: collection.waveform?.ch1?.length || 0,
          },
          croppingMetadata: {
            stage: collection.croppingMeta?.stage || 'unknown',
            method: collection.croppingMeta?.method || 'unknown',
            confidence: collection.croppingMeta?.confidence || 0,
            startIdx: collection.croppingMeta?.startIdx || 0,
            endIdx: collection.croppingMeta?.endIdx || 0,
            reason: collection.croppingMeta?.reason || '',
          },
          quality: collection.quality || 0.8,
          createdAt: collection.createdAt || Date.now(),
          updatedAt: collection.updatedAt || Date.now(),
        })),
        statistics: generateStatistics(command.collections),
      };

      // 添加JSON文件
      zip.file('complete-data.json', JSON.stringify(exportData, null, 2));

      // 添加CSV汇总表
      const csvContent = generateCSV(exportData);
      zip.file('summary.csv', csvContent);

      // 添加分析报告
      const reportContent = generateReport(exportData);
      zip.file('analysis-report.md', reportContent);

      // 生成ZIP文件
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedCommand}-export-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`✅ 已导出 ${command.collections.length} 条采集数据到ZIP文件`);
    } catch (error) {
      console.error('导出失败:', error);
      toast.error(`❌ 导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">📊 采集数据导出</h1>
            <p className="text-muted-foreground">
              一键导出完整的采集数据，包含所有处理结果
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="h-fit"
          >
            ← 返回首页
          </Button>
        </div>

        {commands.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-12 pb-12 text-center">
              <p className="text-muted-foreground mb-4">暂无采集数据</p>
              <p className="text-sm text-muted-foreground mb-4">
                请先进行采集训练，然后返回此页面导出数据
              </p>
              <Button onClick={() => navigate('/collection')}>
                前往采集训练
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>选择指令并导出</CardTitle>
              <CardDescription>
                选择要导出的指令，系统将导出该指令的所有采集数据和处理结果
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 指令选择 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">指令</label>
                <Select value={selectedCommand} onValueChange={setSelectedCommand}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择指令..." />
                  </SelectTrigger>
                  <SelectContent>
                    {commands.map((cmd) => (
                      <SelectItem key={cmd.name} value={cmd.name}>
                        {cmd.name} ({cmd.collectionCount} 条采集)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 导出按钮 */}
              <div className="space-y-2">
                <p className="text-sm font-medium">导出格式</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handleExportJSON}
                    disabled={isExporting || !selectedCommand}
                    className="w-full"
                  >
                    {isExporting ? '导出中...' : '📄 JSON'}
                  </Button>
                  <Button
                    onClick={handleExportZIP}
                    disabled={isExporting || !selectedCommand}
                    variant="default"
                    className="w-full"
                  >
                    {isExporting ? '导出中...' : '📦 ZIP'}
                  </Button>
                </div>
              </div>

              {/* 导出内容说明 */}
              <div className="bg-blue-950 p-4 rounded-lg text-sm text-blue-200 space-y-2">
                <p className="font-medium">📋 导出包含的完整内容：</p>
                <ul className="space-y-1 ml-4">
                  <li>✓ 所有采集的处理后波形数据（CH1、CH2、CH3）</li>
                  <li>✓ 空白裁剪的完整参数和结果</li>
                  <li>✓ 线性插值缩放到512样本的结果</li>
                  <li>✓ 裁剪置信度和处理阶段信息</li>
                  <li>✓ 采集用户信息和时间戳</li>
                  <li>✓ 质量评分</li>
                  <li>✓ 统计分析（采集数量、质量分布等）</li>
                  <li>✓ 自动生成的分析报告</li>
                </ul>
              </div>

              {/* 使用建议 */}
              <div className="bg-slate-900 p-4 rounded-lg text-sm text-slate-300 space-y-2">
                <p className="font-medium">💡 使用建议：</p>
                <ul className="space-y-1 ml-4">
                  <li>• 采集5-10条数据后导出，分析采集质量</li>
                  <li>• 根据裁剪置信度判断信号质量</li>
                  <li>• 对比不同指令的特征差异</li>
                  <li>• 将导出文件发送给开发者进行技术支持</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// 生成统计数据
function generateStatistics(collections: any[]) {
  if (!collections || collections.length === 0) {
    return {
      totalCollections: 0,
      qualityStats: {},
      croppingStats: {},
    };
  }

  const qualities = collections.map((c: any) => c.quality || 0.8);
  const confidences = collections.map((c: any) => c.croppingMeta?.confidence || 0);
  const stages = collections.map((c: any) => c.croppingMeta?.stage || 'unknown');

  const stageCounts: Record<string, number> = {};
  stages.forEach((stage: string) => {
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });

  return {
    totalCollections: collections.length,
    qualityStats: {
      min: Math.min(...qualities),
      max: Math.max(...qualities),
      avg: qualities.reduce((sum, q) => sum + q, 0) / qualities.length,
    },
    croppingStats: {
      averageConfidence: confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
      stageCounts,
    },
  };
}

// 生成CSV文件
function generateCSV(data: any): string {
  const lines: string[] = [];

  lines.push('采集数据导出汇总表');
  lines.push(`导出时间,${data.exportTime}`);
  lines.push(`指令名称,${data.commandName}`);
  lines.push(`总采集数,${data.totalCollections}`);
  lines.push(`处理算法,${data.processingAlgorithm}`);
  lines.push('');

  lines.push('采集详情');
  lines.push('索引,用户,时间戳,波形长度,裁剪阶段,裁剪置信度,质量评分');

  data.collections.forEach((col: any) => {
    lines.push(
      `${col.index},${col.userName || '未知'},${new Date(col.timestamp).toISOString()},${col.processedWaveform.length},${col.croppingMetadata.stage},${(col.croppingMetadata.confidence * 100).toFixed(1)}%,${col.quality.toFixed(2)}`
    );
  });

  lines.push('');
  lines.push('统计信息');
  lines.push(`平均质量评分,${data.statistics.qualityStats.avg.toFixed(2)}`);
  lines.push(`平均裁剪置信度,${(data.statistics.croppingStats.averageConfidence * 100).toFixed(1)}%`);

  return lines.join('\n');
}

// 生成分析报告
function generateReport(data: any): string {
  const lines: string[] = [];

  lines.push('# 采集数据分析报告');
  lines.push('');
  lines.push(`**导出时间**: ${data.exportTime}`);
  lines.push(`**指令名称**: ${data.commandName}`);
  lines.push(`**总采集数**: ${data.totalCollections}`);
  lines.push(`**处理算法**: ${data.processingAlgorithm}`);
  lines.push('');

  lines.push('## 处理流程说明');
  lines.push('');
  lines.push('本系统使用统一的处理流程：');
  lines.push('1. **空白裁剪**: 使用双端静息估计或Otsu二值化移除前后空白');
  lines.push('2. **线性插值缩放**: 将裁剪后的信号缩放到512个样本');
  lines.push('3. **质量评估**: 基于裁剪置信度和处理阶段进行评分');
  lines.push('');

  lines.push('## 质量统计');
  lines.push('');
  lines.push(`- **最低质量**: ${data.statistics.qualityStats.min.toFixed(2)}`);
  lines.push(`- **最高质量**: ${data.statistics.qualityStats.max.toFixed(2)}`);
  lines.push(`- **平均质量**: ${data.statistics.qualityStats.avg.toFixed(2)}`);
  lines.push(`- **平均裁剪置信度**: ${(data.statistics.croppingStats.averageConfidence * 100).toFixed(1)}%`);
  lines.push('');

  lines.push('## 裁剪阶段分布');
  lines.push('');
  Object.entries(data.statistics.croppingStats.stageCounts).forEach(([stage, count]) => {
    const percentage = ((count as number) / data.totalCollections * 100).toFixed(1);
    lines.push(`- **${stage}**: ${count} 条 (${percentage}%)`);
  });
  lines.push('');

  lines.push('## 建议');
  lines.push('');
  if (data.statistics.qualityStats.avg < 0.6) {
    lines.push('- ⚠️ 平均质量较低，建议检查电极佩戴位置和信号质量');
  }
  if (data.statistics.croppingStats.averageConfidence < 0.7) {
    lines.push('- ⚠️ 平均裁剪置信度较低，建议重新采集或调整参数');
  }
  if (data.statistics.croppingStats.stageCounts['final-fallback'] > data.totalCollections * 0.2) {
    lines.push('- ⚠️ 超过20%的采集使用了最终降级裁剪，建议改进采集质量');
  }

  return lines.join('\n');
}

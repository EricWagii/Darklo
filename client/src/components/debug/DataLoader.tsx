import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { emgDatabase } from '@/lib/db';
import { DebugData } from '@/pages/DebugPage';
import {
  calculateEnergyDistribution,
  calculateDuration,
  calculateEnergyThreshold,
  detectValidSegment,
  detectPeaks,
  calculateQualityScore,
} from '@/lib/debug-utils';
import { toast } from 'sonner';

interface DataLoaderProps {
  onDataLoaded: (data: DebugData) => void;
  onError: (error: string) => void;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

export default function DataLoader({
  onDataLoaded,
  onError,
  isLoading,
  setLoading,
}: DataLoaderProps) {
  const [commands, setCommands] = useState<string[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<string>('');
  const [collectionCount, setCollectionCount] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // 加载指令列表
  useEffect(() => {
    const loadCommands = async () => {
      try {
        const allCommands = await emgDatabase.getAllCommands();
        console.log('[DataLoader] 加载的指令列表:', allCommands);
        
        if (!allCommands || allCommands.length === 0) {
          setDebugInfo('⚠️ 数据库中没有指令数据，请先进行采集');
          return;
        }
        
        const commandNames = allCommands.map((cmd) => cmd.name);
        setCommands(commandNames);
        if (commandNames.length > 0) {
          setSelectedCommand(commandNames[0]);
        }
      } catch (err) {
        console.error('加载指令列表失败:', err);
        setDebugInfo(`❌ 加载指令列表失败: ${err instanceof Error ? err.message : '未知错误'}`);
        onError('无法加载指令列表');
      }
    };

    loadCommands();
  }, [onError]);

  // 当选择的指令改变时，更新采集数量
  useEffect(() => {
    const updateCollectionCount = async () => {
      if (!selectedCommand) return;

      try {
        const command = await emgDatabase.getCommand(selectedCommand);
        console.log('[DataLoader] 获取的指令数据:', command);
        
        if (command) {
          // 支持多种数据格式
          let count = 0;
          if (command.collections && Array.isArray(command.collections)) {
            count = command.collections.length;
            console.log('[DataLoader] 使用旧格式（collections数组）:', count);
          } else if (command.waveform) {
            count = 1;
            console.log('[DataLoader] 使用新格式（单个波形）');
          } else {
            console.warn('[DataLoader] 指令数据格式不支持:', command);
            setDebugInfo('⚠️ 指令数据格式不支持');
            return;
          }
          
          setCollectionCount(count);
          setSelectedIndex(0);
          setDebugInfo('');
        } else {
          setDebugInfo('⚠️ 无法找到指令数据');
        }
      } catch (err) {
        console.error('获取采集数量失败:', err);
        setDebugInfo(`❌ 获取采集数量失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    };

    updateCollectionCount();
  }, [selectedCommand]);

  // 加载数据
  const handleLoadData = async () => {
    if (!selectedCommand) {
      onError('请选择一条指令');
      return;
    }

    setLoading(true);
    try {
      console.log('[DataLoader] 开始加载数据:', { selectedCommand, selectedIndex });
      
      const command = await emgDatabase.getCommand(selectedCommand);
      console.log('[DataLoader] 获取的指令数据:', command);
      
      if (!command) {
        throw new Error('无法找到指令数据');
      }

      // 处理多种数据格式
      let collection: any = null;
      
      // 格式1: 旧格式（指令有collections数组）
      if (command.collections && Array.isArray(command.collections)) {
        collection = command.collections[selectedIndex];
        console.log('[DataLoader] 使用旧格式加载，采集数据:', collection);
      } 
      // 格式2: 新格式（指令是单个波形对象）
      else if (command.waveform) {
        collection = command;
        console.log('[DataLoader] 使用新格式加载，采集数据:', collection);
      }
      // 格式3: 直接是波形数据
      else if (command.ch1 || command.data) {
        collection = command;
        console.log('[DataLoader] 使用直接波形格式加载');
      }

      if (!collection) {
        throw new Error(`无法找到采集数据 (格式: ${JSON.stringify(Object.keys(command))})`);
      }

      // 获取波形数据（支持多种字段名）
      let waveformData = {
        ch1: collection.waveform?.ch1 || collection.ch1 || [],
        ch2: collection.waveform?.ch2 || collection.ch2 || [],
        ch3: collection.waveform?.ch3 || collection.ch3 || [],
      };

      if (!waveformData.ch1 || waveformData.ch1.length === 0) {
        throw new Error('波形数据为空或格式不正确');
      }

      console.log('[DataLoader] 波形数据长度:', waveformData.ch1.length);

      // 计算能量分布
      const energyValues = calculateEnergyDistribution(waveformData.ch1);

      // 计算时长
      const rawDurationMs = calculateDuration(waveformData.ch1.length);
      const trimStart = collection.trimStart || 0;
      const trimEnd = collection.trimEnd || waveformData.ch1.length;
      const croppedDurationMs = calculateDuration(trimEnd - trimStart);

      // 使用debug-utils计算能量分析参数
      const { threshold } = calculateEnergyThreshold(energyValues);
      const validSegment = detectValidSegment(energyValues, threshold);
      const peaks = detectPeaks(energyValues, threshold);
      const qualityScore = calculateQualityScore(
        energyValues,
        validSegment.end - validSegment.start,
        peaks.length,
        validSegment.confidence
      );

      // 构建DebugData
      const debugData: DebugData = {
        commandName: selectedCommand,
        collectionIndex: selectedIndex,
        rawWaveform: {
          ch1: waveformData.ch1,
          ch2: waveformData.ch2,
          ch3: waveformData.ch3,
          duration: rawDurationMs,
        },
        energyAnalysis: {
          energyValues,
          threshold,
          validSegmentStart: validSegment.start,
          validSegmentEnd: validSegment.end,
          confidence: validSegment.confidence,
          peakCount: peaks.length,
        },
        croppingParams: {
          startIdx: trimStart,
          endIdx: trimEnd,
          strategy: peaks.length > 1 ? 'multi-peak' : 'single-peak',
          peakCount: peaks.length,
          mergedPeaks: peaks.map((p) => ({
            start: Math.max(0, p.index - 20),
            end: Math.min(waveformData.ch1.length, p.index + 20),
            energy: p.value,
          })),
        },
        timingStats: {
          rawDurationMs,
          croppedDurationMs,
          normalizedDurationMs: 1024,
          samplingRate: 500,
        },
        qualityScore: {
          isAcceptable: qualityScore.score >= 60,
          score: Math.round(qualityScore.score),
          reason: qualityScore.reason,
        },
      };

      console.log('[DataLoader] 数据加载成功:', debugData);
      toast.success('✅ 数据加载成功');
      onDataLoaded(debugData);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '加载数据失败';
      console.error('加载数据错误:', err);
      setDebugInfo(`❌ ${errorMsg}`);
      onError(errorMsg);
      toast.error(`❌ ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>📂 数据加载</CardTitle>
        <CardDescription>选择要分析的指令和采集序号</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 调试信息 */}
        {debugInfo && (
          <div className="bg-slate-900 p-3 rounded-lg text-sm text-slate-300 border border-slate-700">
            {debugInfo}
          </div>
        )}

        {/* 指令列表为空的提示 */}
        {commands.length === 0 && (
          <div className="bg-yellow-950 p-3 rounded-lg text-sm text-yellow-200 border border-yellow-700">
            <p>⚠️ 数据库中没有指令数据</p>
            <p className="text-xs mt-2">请先进行采集训练，然后返回此页面</p>
          </div>
        )}

        {/* 指令选择 */}
        {commands.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">指令</label>
            <Select value={selectedCommand} onValueChange={setSelectedCommand}>
              <SelectTrigger>
                <SelectValue placeholder="选择指令..." />
              </SelectTrigger>
              <SelectContent>
                {commands.map((cmd) => (
                  <SelectItem key={cmd} value={cmd}>
                    {cmd}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 采集序号选择 */}
        {collectionCount > 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              采集序号 ({selectedIndex + 1}/{collectionCount})
            </label>
            <Slider
              min={0}
              max={collectionCount - 1}
              step={1}
              value={[selectedIndex]}
              onValueChange={(value) => setSelectedIndex(value[0])}
              className="w-full"
            />
          </div>
        )}

        {/* 加载按钮 */}
        {commands.length > 0 && (
          <Button
            onClick={handleLoadData}
            disabled={isLoading || !selectedCommand}
            className="w-full"
          >
            {isLoading ? '加载中...' : '加载数据'}
          </Button>
        )}

        {/* 信息提示 */}
        {selectedCommand && collectionCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {selectedCommand}: {collectionCount} 条采集
          </p>
        )}
      </CardContent>
    </Card>
  );
}

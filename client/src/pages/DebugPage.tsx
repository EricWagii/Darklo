import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { emgDatabase } from '@/lib/db';
import { useUserSession } from '@/contexts/UserSessionContext';
import DataLoader from '@/components/debug/DataLoader';
import WaveformViewer from '@/components/debug/WaveformViewer';
import CroppingAnalysis from '@/components/debug/CroppingAnalysis';
import TimingStatistics from '@/components/debug/TimingStatistics';
import ComparisonPanel from '@/components/debug/ComparisonPanel';
import ExportPanel from '@/components/debug/ExportPanel';

export interface DebugData {
  commandName: string;
  collectionIndex: number;
  
  // 原始波形
  rawWaveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    duration: number;
  };
  
  // 能量检测结果
  energyAnalysis: {
    energyValues: number[];
    threshold: number;
    validSegmentStart: number;
    validSegmentEnd: number;
    confidence: number;
    peakCount: number;
  };
  
  // 裁切参数
  croppingParams: {
    startIdx: number;
    endIdx: number;
    strategy: 'single-peak' | 'multi-peak';
    peakCount: number;
    mergedPeaks: Array<{ start: number; end: number; energy: number }>;
  };
  
  // 时长统计
  timingStats: {
    rawDurationMs: number;
    croppedDurationMs: number;
    normalizedDurationMs: number;
    samplingRate: number;
  };
  
  // 质量评分
  qualityScore: {
    isAcceptable: boolean;
    score: number;
    reason: string;
  };
}

export default function DebugPage() {
  const [, navigate] = useLocation();
  const { isLoggedIn } = useUserSession();
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 访问控制
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>访问受限</CardTitle>
            <CardDescription>DEBUG页面仅供已登录用户使用</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              请返回首页登录后再访问此页面。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题和导航 */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">🔧 DEBUG调试页面</h1>
            <p className="text-muted-foreground">
              实时分析信号处理流程，诊断采集、裁切和识别问题
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

        {/* 错误提示 */}
        {error && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* 数据加载器 */}
        <DataLoader
          onDataLoaded={(data: DebugData) => {
            setDebugData(data);
            setError(null);
          }}
          onError={(err: string) => setError(err)}
          isLoading={loading}
          setLoading={setLoading}
        />

        {/* 如果加载了数据，显示分析面板 */}
        {debugData && (
          <div className="space-y-6">
            {/* 数据导出 */}
            <ExportPanel debugData={debugData} />

            {/* 波形可视化 */}
            <WaveformViewer data={debugData} />

            {/* 裁切分析 */}
            <CroppingAnalysis data={debugData} />

            {/* 时长统计 */}
            <TimingStatistics data={debugData} />

            {/* 对比分析 */}
            <ComparisonPanel referenceData={debugData} />
          </div>
        )}

        {/* 空状态 */}
        {!debugData && !loading && (
          <Card className="border-dashed">
            <CardContent className="pt-12 pb-12 text-center">
              <p className="text-muted-foreground mb-4">
                选择一条指令和采集序号，点击"加载"开始分析
              </p>
              <p className="text-sm text-muted-foreground">
                DEBUG页面将显示波形、能量分布、裁切参数和时长统计
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

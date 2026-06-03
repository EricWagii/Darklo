import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DebugData } from '@/pages/DebugPage';

interface CroppingAnalysisProps {
  data: DebugData;
}

export default function CroppingAnalysis({ data }: CroppingAnalysisProps) {
  const croppingLength = data.croppingParams.endIdx - data.croppingParams.startIdx;
  const croppingDurationMs = (croppingLength / data.timingStats.samplingRate) * 1000;

  // 计算质量星级
  const getQualityStars = (score: number) => {
    const stars = Math.round(score / 20);
    return '★'.repeat(stars) + '☆'.repeat(5 - stars);
  };

  // 计算质量颜色
  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-4">
      {/* 裁切参数表 */}
      <Card>
        <CardHeader>
          <CardTitle>🎯 裁切参数</CardTitle>
          <CardDescription>信号处理的关键参数</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {/* 原始长度 */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">原始长度</p>
              <p className="text-lg font-mono font-semibold">
                {data.rawWaveform.ch1.length}
              </p>
              <p className="text-xs text-muted-foreground">样本</p>
            </div>

            {/* 裁切起点 */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">裁切起点</p>
              <p className="text-lg font-mono font-semibold text-green-500">
                {data.croppingParams.startIdx}
              </p>
              <p className="text-xs text-muted-foreground">样本</p>
            </div>

            {/* 裁切终点 */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">裁切终点</p>
              <p className="text-lg font-mono font-semibold text-red-500">
                {data.croppingParams.endIdx}
              </p>
              <p className="text-xs text-muted-foreground">样本</p>
            </div>

            {/* 裁切长度 */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">裁切长度</p>
              <p className="text-lg font-mono font-semibold">
                {croppingLength}
              </p>
              <p className="text-xs text-muted-foreground">样本</p>
            </div>

            {/* 裁切时长 */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">裁切时长</p>
              <p className="text-lg font-mono font-semibold">
                {croppingDurationMs.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground">ms</p>
            </div>

            {/* 峰值数 */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">峰值数</p>
              <p className="text-lg font-mono font-semibold">
                {data.croppingParams.peakCount}
              </p>
              <p className="text-xs text-muted-foreground">个</p>
            </div>
          </div>

          {/* 检测策略 */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm font-medium mb-2">检测策略</p>
            <div className="inline-block px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-sm font-mono">
              {data.croppingParams.strategy}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 质量评分 */}
      <Card>
        <CardHeader>
          <CardTitle>⭐ 质量评分</CardTitle>
          <CardDescription>信号质量的综合评估</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 评分条 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">总体评分</p>
              <p className={`text-lg font-bold ${getQualityColor(data.qualityScore.score)}`}>
                {data.qualityScore.score}/100
              </p>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  data.qualityScore.score >= 80
                    ? 'bg-green-500'
                    : data.qualityScore.score >= 60
                    ? 'bg-yellow-500'
                    : data.qualityScore.score >= 40
                    ? 'bg-orange-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${data.qualityScore.score}%` }}
              />
            </div>
          </div>

          {/* 星级显示 */}
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">星级</p>
            <p className={`text-2xl ${getQualityColor(data.qualityScore.score)}`}>
              {getQualityStars(data.qualityScore.score)}
            </p>
          </div>

          {/* 评价理由 */}
          <div className="pt-2 border-t border-border">
            <p className="text-sm text-muted-foreground mb-1">评价</p>
            <p className="text-sm">
              {data.qualityScore.isAcceptable ? (
                <span className="text-green-400">✅ {data.qualityScore.reason}</span>
              ) : (
                <span className="text-red-400">❌ {data.qualityScore.reason}</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 多峰值检测结果 */}
      {data.croppingParams.mergedPeaks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🔍 多峰值检测</CardTitle>
            <CardDescription>
              检测到 {data.croppingParams.mergedPeaks.length} 个峰值
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.croppingParams.mergedPeaks.map((peak, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded bg-gray-800/50 border border-gray-700"
                >
                  <div>
                    <p className="text-sm font-medium">峰值 #{idx + 1}</p>
                    <p className="text-xs text-muted-foreground">
                      范围: {peak.start} - {peak.end} (长度: {peak.end - peak.start})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-semibold">
                      {peak.energy.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">能量</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

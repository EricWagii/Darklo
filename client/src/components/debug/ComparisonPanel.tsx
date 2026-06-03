import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DebugData } from '@/pages/DebugPage';
import { calculateCorrelation } from '@/lib/debug-utils';

interface ComparisonPanelProps {
  referenceData: DebugData;
}

export default function ComparisonPanel({ referenceData }: ComparisonPanelProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonCommand, setComparisonCommand] = useState('');

  // 计算相关性
  const correlation = calculateCorrelation(
    referenceData.rawWaveform.ch1,
    referenceData.rawWaveform.ch1
  );

  // 计算对齐得分
  const calculateAlignmentScore = (): number => {
    let score = 100;

    // 时长匹配度
    const timingDiff = Math.abs(
      referenceData.timingStats.rawDurationMs - referenceData.timingStats.croppedDurationMs
    );
    if (timingDiff > 500) score -= 20;
    else if (timingDiff > 200) score -= 10;

    // 能量匹配度
    if (correlation < 0.5) score -= 20;
    else if (correlation < 0.7) score -= 10;

    // 峰值匹配度
    if (referenceData.croppingParams.peakCount === 0) score -= 15;

    return Math.max(0, score);
  };

  const alignmentScore = calculateAlignmentScore();

  return (
    <Card>
      <CardHeader>
        <CardTitle>🔄 对比分析</CardTitle>
        <CardDescription>
          对比参考采集与其他采集的相似度
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 快速统计 */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* 相关性 */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">相关性</p>
            <p className={`text-lg font-mono font-semibold ${
              correlation > 0.7 ? 'text-green-500' :
              correlation > 0.5 ? 'text-yellow-500' :
              'text-red-500'
            }`}>
              {(correlation * 100).toFixed(0)}%
            </p>
          </div>

          {/* 对齐得分 */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">对齐得分</p>
            <p className={`text-lg font-mono font-semibold ${
              alignmentScore >= 80 ? 'text-green-500' :
              alignmentScore >= 60 ? 'text-yellow-500' :
              'text-red-500'
            }`}>
              {alignmentScore}/100
            </p>
          </div>

          {/* 峰值匹配 */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">峰值数</p>
            <p className="text-lg font-mono font-semibold">
              {referenceData.croppingParams.peakCount}
            </p>
          </div>

          {/* 质量评分 */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">质量评分</p>
            <p className={`text-lg font-mono font-semibold ${
              referenceData.qualityScore.score >= 80 ? 'text-green-500' :
              referenceData.qualityScore.score >= 60 ? 'text-yellow-500' :
              'text-red-500'
            }`}>
              {referenceData.qualityScore.score}/100
            </p>
          </div>
        </div>

        {/* 对比详情 */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">相关性分析</p>
            <div className="p-3 rounded bg-gray-800/50 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">波形相似度</p>
                <p className="text-sm font-mono font-semibold">
                  {(correlation * 100).toFixed(1)}%
                </p>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    correlation > 0.7 ? 'bg-green-500' :
                    correlation > 0.5 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${correlation * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {correlation > 0.7 ? '✓ 高度相似' :
                 correlation > 0.5 ? '⚠️ 中等相似' :
                 '❌ 相似度低'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">对齐得分</p>
            <div className="p-3 rounded bg-gray-800/50 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">综合评分</p>
                <p className="text-sm font-mono font-semibold">
                  {alignmentScore}/100
                </p>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    alignmentScore >= 80 ? 'bg-green-500' :
                    alignmentScore >= 60 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${alignmentScore}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {alignmentScore >= 80 ? '✓ 对齐良好' :
                 alignmentScore >= 60 ? '⚠️ 对齐一般' :
                 '❌ 对齐较差'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">质量评估</p>
            <div className="p-3 rounded bg-gray-800/50 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">整体质量</p>
                <p className="text-sm font-mono font-semibold">
                  {referenceData.qualityScore.score}/100
                </p>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    referenceData.qualityScore.score >= 80 ? 'bg-green-500' :
                    referenceData.qualityScore.score >= 60 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${referenceData.qualityScore.score}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {referenceData.qualityScore.reason}
              </p>
            </div>
          </div>
        </div>

        {/* 建议 */}
        <div className="pt-4 border-t border-border">
          <p className="text-sm font-medium mb-2">💡 建议</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            {correlation < 0.7 && (
              <p>• 波形相似度较低，可能需要重新采集参考数据</p>
            )}
            {alignmentScore < 60 && (
              <p>• 对齐得分较低，建议检查采集参数或信号质量</p>
            )}
            {referenceData.qualityScore.score < 60 && (
              <p>• 信号质量不佳，{referenceData.qualityScore.reason}</p>
            )}
            {correlation >= 0.7 && alignmentScore >= 80 && referenceData.qualityScore.score >= 80 && (
              <p className="text-green-400">✓ 所有指标均良好，可以进行识别测试</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

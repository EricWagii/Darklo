import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DebugData } from '@/pages/DebugPage';
import { formatDuration, calculatePercentageChange } from '@/lib/debug-utils';

interface TimingStatisticsProps {
  data: DebugData;
}

export default function TimingStatistics({ data }: TimingStatisticsProps) {
  const rawDuration = data.timingStats.rawDurationMs;
  const croppedDuration = data.timingStats.croppedDurationMs;
  const normalizedDuration = data.timingStats.normalizedDurationMs;

  const croppingReduction = calculatePercentageChange(rawDuration, croppedDuration);
  const normalizationReduction = calculatePercentageChange(croppedDuration, normalizedDuration);

  // 判断时长是否超过1秒
  const exceedsOneSecond = rawDuration > 1000;
  const croppedExceedsOneSecond = croppedDuration > 1024;

  return (
    <div className="space-y-4">
      {/* 时长统计表 */}
      <Card>
        <CardHeader>
          <CardTitle>⏱️ 时长统计</CardTitle>
          <CardDescription>信号在各个处理阶段的时长变化</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 原始波形 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">原始波形</p>
                  <p className="text-xs text-muted-foreground">
                    {data.rawWaveform.ch1.length} 样本 @ {data.timingStats.samplingRate}Hz
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-mono font-bold">
                    {formatDuration(rawDuration)}
                  </p>
                  {exceedsOneSecond && (
                    <p className="text-xs text-orange-400">⚠️ 超过1秒</p>
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-500"
                  style={{ width: `${Math.min(100, (rawDuration / 2000) * 100)}%` }}
                />
              </div>
            </div>

            {/* 裁切后 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">裁切后</p>
                  <p className="text-xs text-muted-foreground">
                    {data.croppingParams.endIdx - data.croppingParams.startIdx} 样本
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-mono font-bold">
                    {formatDuration(croppedDuration)}
                  </p>
                  <p className={`text-xs ${croppingReduction < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {croppingReduction > 0 ? '↓' : '↑'} {Math.abs(croppingReduction).toFixed(0)}%
                  </p>
                </div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-green-500"
                  style={{ width: `${Math.min(100, (croppedDuration / 2000) * 100)}%` }}
                />
              </div>
            </div>

            {/* 归一化后 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">归一化后</p>
                  <p className="text-xs text-muted-foreground">
                    512 样本 (固定值)
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-mono font-bold">
                    {formatDuration(normalizedDuration)}
                  </p>
                  <p className="text-xs text-blue-400">
                    {normalizedDuration === 1024 ? '✓ 标准' : '⚠️ 非标准'}
                  </p>
                </div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-yellow-500"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 时长分析 */}
      <Card>
        <CardHeader>
          <CardTitle>📊 时长分析</CardTitle>
          <CardDescription>关键时长指标和建议</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 原始时长分析 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">原始波形时长</p>
            <div className="p-3 rounded bg-gray-800/50 border border-gray-700 space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">实际时长: </span>
                <span className="font-mono font-semibold">{rawDuration.toFixed(0)}ms</span>
              </p>
              {exceedsOneSecond ? (
                <p className="text-sm text-orange-400">
                  ⚠️ 发音时长超过1秒，可能包含多个音节或停顿
                </p>
              ) : (
                <p className="text-sm text-green-400">
                  ✓ 发音时长在1秒以内
                </p>
              )}
            </div>
          </div>

          {/* 裁切时长分析 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">裁切后时长</p>
            <div className="p-3 rounded bg-gray-800/50 border border-gray-700 space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">实际时长: </span>
                <span className="font-mono font-semibold">{croppedDuration.toFixed(0)}ms</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">与原始比较: </span>
                <span className={croppingReduction > 0 ? 'text-green-400' : 'text-red-400'}>
                  {croppingReduction > 0 ? '减少' : '增加'} {Math.abs(croppingReduction).toFixed(0)}%
                </span>
              </p>
              {croppedExceedsOneSecond ? (
                <p className="text-sm text-orange-400">
                  ⚠️ 裁切后仍超过1.024秒，可能导致截断
                </p>
              ) : (
                <p className="text-sm text-green-400">
                  ✓ 裁切后在标准范围内
                </p>
              )}
            </div>
          </div>

          {/* 归一化分析 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">归一化</p>
            <div className="p-3 rounded bg-gray-800/50 border border-gray-700 space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">固定长度: </span>
                <span className="font-mono font-semibold">512 样本 (1.024s)</span>
              </p>
              <p className="text-sm text-muted-foreground">
                所有采集数据都会被缩放到此长度以保证一致性
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 关键发现 */}
      <Card className="border-blue-500/50 bg-blue-500/10">
        <CardHeader>
          <CardTitle className="text-blue-400">💡 关键发现</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {exceedsOneSecond && (
            <p className="text-sm">
              🔍 <span className="font-medium">原始发音超过1秒</span> - 这可能表示：
              <br />
              • 用户发音较长（多音节或带停顿）
              <br />
              • 需要确认FIXED_WAVEFORM_LENGTH是否需要调整
            </p>
          )}
          {croppedExceedsOneSecond && (
            <p className="text-sm">
              ⚠️ <span className="font-medium">裁切后超过1.024秒</span> - 这会导致：
              <br />
              • 信号被截断到512样本
              <br />
              • 可能丢失重要的语音特征
              <br />
              • 建议增加FIXED_WAVEFORM_LENGTH
            </p>
          )}
          {!exceedsOneSecond && !croppedExceedsOneSecond && (
            <p className="text-sm text-green-400">
              ✅ 时长在正常范围内，无需调整参数
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

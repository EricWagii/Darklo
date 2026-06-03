/**
 * 波形处理状态徽章组件
 * 
 * 显示采集记录的处理状态：
 * - ✅ 已裁剪+缩放（高质量）
 * - ⚠️ 使用全段（降级处理）
 * - ❌ 未处理（原始数据）
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';

export type WaveformProcessingStatus = 'processed' | 'degraded' | 'raw';

export interface WaveformStatusBadgeProps {
  status: WaveformProcessingStatus;
  confidence?: number;
  showLabel?: boolean;
  className?: string;
}

/**
 * 获取状态对应的显示文本
 */
function getStatusLabel(status: WaveformProcessingStatus): string {
  switch (status) {
    case 'processed':
      return '✅ 已处理';
    case 'degraded':
      return '⚠️ 降级处理';
    case 'raw':
      return '❌ 未处理';
    default:
      return '未知';
  }
}

/**
 * 获取状态对应的颜色
 */
function getStatusColor(status: WaveformProcessingStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'processed':
      return 'default';  // 绿色
    case 'degraded':
      return 'secondary';  // 黄色/橙色
    case 'raw':
      return 'destructive';  // 红色
    default:
      return 'outline';
  }
}

/**
 * 获取状态对应的详细描述
 */
function getStatusDescription(status: WaveformProcessingStatus, confidence?: number): string {
  switch (status) {
    case 'processed':
      return `已通过双端静息估计裁剪${confidence ? `（置信度 ${(confidence * 100).toFixed(0)}%）` : ''}`;
    case 'degraded':
      return `降级为Otsu二值化处理${confidence ? `（置信度 ${(confidence * 100).toFixed(0)}%）` : ''}`;
    case 'raw':
      return '使用原始全段数据';
    default:
      return '未知状态';
  }
}

/**
 * 波形处理状态徽章组件
 */
export const WaveformStatusBadge: React.FC<WaveformStatusBadgeProps> = ({
  status,
  confidence,
  showLabel = true,
  className = ''
}) => {
  const label = getStatusLabel(status);
  const color = getStatusColor(status);
  const description = getStatusDescription(status, confidence);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge variant={color} title={description}>
        {label}
      </Badge>
      {showLabel && confidence !== undefined && (
        <span className="text-xs text-muted-foreground">
          {(confidence * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
};

/**
 * 获取处理状态的优先级（用于排序）
 */
export function getStatusPriority(status: WaveformProcessingStatus): number {
  switch (status) {
    case 'processed':
      return 1;  // 最高优先级
    case 'degraded':
      return 2;
    case 'raw':
      return 3;  // 最低优先级
    default:
      return 4;
  }
}

/**
 * 根据裁剪结果判断处理状态
 */
export function determineProcessingStatus(croppingMeta?: any): {
  status: WaveformProcessingStatus;
  confidence: number;
} {
  if (!croppingMeta) {
    return {
      status: 'raw',
      confidence: 0
    };
  }

  // 检查是否使用了双端静息估计
  if (croppingMeta.method === 'resting-baseline' && croppingMeta.confidence > 0.6) {
    return {
      status: 'processed',
      confidence: croppingMeta.confidence
    };
  }

  // 检查是否使用了Otsu二值化
  if (croppingMeta.method === 'otsu' || croppingMeta.confidence > 0.25) {
    return {
      status: 'degraded',
      confidence: croppingMeta.confidence || 0.25
    };
  }

  // 默认为未处理
  return {
    status: 'raw',
    confidence: 0
  };
}

/**
 * 状态统计组件
 */
export interface WaveformStatusStats {
  processed: number;
  degraded: number;
  raw: number;
  total: number;
}

export function calculateStatusStats(
  collections: any[]
): WaveformStatusStats {
  const stats: WaveformStatusStats = {
    processed: 0,
    degraded: 0,
    raw: 0,
    total: collections.length
  };

  collections.forEach(col => {
    const { status } = determineProcessingStatus(col.croppingMeta);
    switch (status) {
      case 'processed':
        stats.processed++;
        break;
      case 'degraded':
        stats.degraded++;
        break;
      case 'raw':
        stats.raw++;
        break;
    }
  });

  return stats;
}

/**
 * 状态统计显示组件
 */
export interface WaveformStatusStatsDisplayProps {
  stats: WaveformStatusStats;
  className?: string;
}

export const WaveformStatusStatsDisplay: React.FC<WaveformStatusStatsDisplayProps> = ({
  stats,
  className = ''
}) => {
  const processedPercent = stats.total > 0 ? ((stats.processed / stats.total) * 100).toFixed(0) : 0;
  const degradedPercent = stats.total > 0 ? ((stats.degraded / stats.total) * 100).toFixed(0) : 0;
  const rawPercent = stats.total > 0 ? ((stats.raw / stats.total) * 100).toFixed(0) : 0;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-sm font-medium">采集质量统计</div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>✅ 已处理</span>
          <span className="text-muted-foreground">{stats.processed}/{stats.total} ({processedPercent}%)</span>
        </div>
        <div className="flex justify-between">
          <span>⚠️ 降级处理</span>
          <span className="text-muted-foreground">{stats.degraded}/{stats.total} ({degradedPercent}%)</span>
        </div>
        <div className="flex justify-between">
          <span>❌ 未处理</span>
          <span className="text-muted-foreground">{stats.raw}/{stats.total} ({rawPercent}%)</span>
        </div>
      </div>
    </div>
  );
};

/**
 * 裁剪状态徽章组件
 * 
 * 显示采集数据的处理状态（primary/fallback/full_segment）和置信度
 */

import React from 'react';
import {
  getStageLabelForDisplay,
  getColorForStage,
} from '@/lib/cropping-stage-inference';

export interface CroppingMeta {
  stage: 'primary' | 'fallback' | 'full_segment';
  confidence: number;
  method?: string;
  reason?: string;
}

interface CroppingStatusBadgeProps {
  croppingMeta?: CroppingMeta;
  showConfidence?: boolean;
  showMethod?: boolean;
  compact?: boolean;
}

/**
 * 裁剪状态徽章组件
 * 
 * @param croppingMeta 裁剪元数据
 * @param showConfidence 是否显示置信度（默认true）
 * @param showMethod 是否显示方法名称（默认false）
 * @param compact 是否使用紧凑模式（默认false）
 */
export const CroppingStatusBadge: React.FC<CroppingStatusBadgeProps> = ({
  croppingMeta,
  showConfidence = true,
  showMethod = false,
  compact = false,
}) => {
  if (!croppingMeta) {
    return <span className="text-xs text-gray-500">无处理信息</span>;
  }

  const stageLabel = getStageLabelForDisplay(croppingMeta.stage);
  const stageColor = getColorForStage(croppingMeta.stage);
  const confidencePercent = (croppingMeta.confidence * 100).toFixed(1);

  if (compact) {
    // 紧凑模式：只显示图标和置信度
    return (
      <div className="flex items-center gap-1">
        <span className="text-sm">{stageLabel ? stageLabel.split(' ')[0] : '未知'}</span>
        {showConfidence && (
          <span className="text-xs text-gray-500">{confidencePercent}%</span>
        )}
      </div>
    );
  }

  // 完整模式：显示标签、置信度、方法等
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{
        backgroundColor: `${stageColor}20`,
        borderLeft: `3px solid ${stageColor}`,
      }}
    >
      <div className="flex-1">
        <div className="text-sm font-medium" style={{ color: stageColor }}>
          {stageLabel}
        </div>
        {showMethod && croppingMeta.method && (
          <div className="text-xs text-gray-600">方法: {croppingMeta.method}</div>
        )}
        {croppingMeta.reason && (
          <div className="text-xs text-gray-600">{croppingMeta.reason}</div>
        )}
      </div>
      {showConfidence && (
        <div className="text-right">
          <div className="text-sm font-semibold" style={{ color: stageColor }}>
            {confidencePercent}%
          </div>
          <div className="text-xs text-gray-500">置信度</div>
        </div>
      )}
    </div>
  );
};

/**
 * 简化版本：只显示状态标签和置信度
 */
export const CroppingStatusBadgeSimple: React.FC<CroppingStatusBadgeProps> = (props) => {
  return <CroppingStatusBadge {...props} compact={true} />;
};

/**
 * 详细版本：显示所有信息
 */
export const CroppingStatusBadgeDetailed: React.FC<CroppingStatusBadgeProps> = (props) => {
  return <CroppingStatusBadge {...props} showMethod={true} />;
};

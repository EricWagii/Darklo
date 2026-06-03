/**
 * 采集质量评分显示组件
 * 
 * 显示：
 * - 整体质量评分（0-100）
 * - 能量一致性
 * - 对齐质量
 * - 异常检测和建议
 */

import React from 'react';
import { QualityScore } from '@/lib/auto-segmentation';

interface QualityScoreDisplayProps {
  score: QualityScore;
  index: number;
  onDelete?: () => void;
}

export function QualityScoreDisplay({
  score,
  index,
  onDelete,
}: QualityScoreDisplayProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4ade80'; // 绿色 - 优秀
    if (score >= 60) return '#fbbf24'; // 黄色 - 良好
    if (score >= 40) return '#f97316'; // 橙色 - 一般
    return '#ef4444'; // 红色 - 差
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return '优秀';
    if (score >= 60) return '良好';
    if (score >= 40) return '一般';
    return '差';
  };

  const scoreColor = getScoreColor(score.overallScore);

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '6px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${score.isOutlier ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
        marginBottom: '8px',
      }}
    >
      {/* 标题行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600' }}>
          采集 #{index + 1}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* 总体评分 */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: scoreColor,
              }}
            >
              {score.overallScore}
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              {getScoreLabel(score.overallScore)}
            </div>
          </div>

          {/* 删除按钮 */}
          {onDelete && (
            <button
              onClick={onDelete}
              style={{
                padding: '6px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              删除
            </button>
          )}
        </div>
      </div>

      {/* 详细指标 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        {/* 能量一致性 */}
        <div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
            能量一致性
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                flex: 1,
                height: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.energyConsistency}%`,
                  backgroundColor: '#4ade80',
                }}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#4ade80', minWidth: '30px' }}>
              {score.energyConsistency}%
            </div>
          </div>
        </div>

        {/* 对齐质量 */}
        <div>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
            对齐质量
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                flex: 1,
                height: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.alignmentScore}%`,
                  backgroundColor: '#60a5fa',
                }}
              />
            </div>
            <div style={{ fontSize: '12px', color: '#60a5fa', minWidth: '30px' }}>
              {score.alignmentScore}%
            </div>
          </div>
        </div>
      </div>

      {/* 建议 */}
      <div
        style={{
          fontSize: '12px',
          padding: '6px 8px',
          borderRadius: '4px',
          backgroundColor: score.isOutlier
            ? 'rgba(239, 68, 68, 0.1)'
            : 'rgba(74, 222, 128, 0.1)',
          color: score.isOutlier ? '#fca5a5' : '#86efac',
          border: `1px solid ${score.isOutlier ? 'rgba(239, 68, 68, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`,
        }}
      >
        {score.recommendation}
      </div>
    </div>
  );
}

/**
 * 质量评分列表组件
 */
interface QualityScoreListProps {
  scores: Array<QualityScore & { index: number }>;
  onDelete?: (index: number) => void;
}

export function QualityScoreList({ scores, onDelete }: QualityScoreListProps) {
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length)
      : 0;

  const outlierCount = scores.filter((s) => s.isOutlier).length;

  return (
    <div>
      {/* 统计摘要 */}
      <div
        style={{
          padding: '12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          marginBottom: '12px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '12px', color: '#aaa' }}>平均质量评分</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>
            {avgScore}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#aaa' }}>异常采集</div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: outlierCount > 0 ? '#ef4444' : '#4ade80',
            }}
          >
            {outlierCount} / {scores.length}
          </div>
        </div>
      </div>

      {/* 详细列表 */}
      <div>
        {scores.map((score) => (
          <QualityScoreDisplay
            key={score.index}
            score={score}
            index={score.index}
            onDelete={onDelete ? () => onDelete(score.index) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

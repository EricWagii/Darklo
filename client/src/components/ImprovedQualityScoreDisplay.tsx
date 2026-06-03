/**
 * 改进的采集质量评分显示组件
 * 
 * 功能：
 * - 显示改进的质量评分
 * - 支持删除低评分采集
 * - 支持重录采集
 * - 显示详细的评分指标
 */

import React from 'react';
import { ImprovedQualityScore } from '@/lib/quality-scoring-improved';

interface ImprovedQualityScoreDisplayProps {
  score: ImprovedQualityScore;
  index: number;
  onDelete?: () => void;
  onRetry?: () => void;
}

export function ImprovedQualityScoreDisplay({
  score,
  index,
  onDelete,
  onRetry,
}: ImprovedQualityScoreDisplayProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4ade80'; // 绿色 - 优秀
    if (score >= 70) return '#86efac'; // 浅绿 - 良好
    if (score >= 60) return '#fbbf24'; // 黄色 - 一般
    if (score >= 50) return '#fb923c'; // 橙色 - 较差
    return '#ef4444'; // 红色 - 很差
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return '优秀';
    if (score >= 70) return '良好';
    if (score >= 60) return '一般';
    if (score >= 50) return '较差';
    return '很差';
  };

  // 转换为星级评分（1-5 星）
  const getStarRating = (score: number): number => {
    return Math.max(1, Math.min(5, Math.round((score / 100) * 5)));
  };

  const renderStars = (rating: number) => {
    return (
      <span style={{ fontSize: '14px', color: '#fbbf24' }}>
        {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
      </span>
    );
  };

  const scoreColor = getScoreColor(score.overallScore);
  const showWarning = score.overallScore < 70;

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '6px',
        backgroundColor: showWarning
          ? 'rgba(239, 68, 68, 0.05)'
          : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${
          showWarning
            ? 'rgba(239, 68, 68, 0.2)'
            : 'rgba(255, 255, 255, 0.1)'
        }`,
        marginBottom: '12px',
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: '600' }}>
          采集 #{index + 1}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* 总体评分 */}
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: scoreColor,
              }}
            >
              {score.overallScore}
            </div>
            <div style={{ fontSize: '11px', color: '#888' }}>
              {getScoreLabel(score.overallScore)}
            </div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              {renderStars(getStarRating(score.overallScore))}
            </div>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {onRetry && showWarning && (
              <button
                onClick={onRetry}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  border: '1px solid #60a5fa',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                }}
                title="重新采集此数据"
              >
                重录
              </button>
            )}
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
                  fontWeight: '500',
                }}
                title="删除此采集"
              >
                删除
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 详细指标 - 三列布局 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        {/* 能量一致性 */}
        <div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
            能量一致性
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                flex: 1,
                height: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
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
            <div style={{ fontSize: '11px', color: '#4ade80', minWidth: '28px' }}>
              {score.energyConsistency}%
            </div>
          </div>
        </div>

        {/* 信号强度 */}
        <div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
            信号强度
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                flex: 1,
                height: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.signalStrength}%`,
                  backgroundColor: '#60a5fa',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#60a5fa', minWidth: '28px' }}>
              {score.signalStrength}%
            </div>
          </div>
        </div>

        {/* 波形变化性 */}
        <div>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>
            波形变化性
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                flex: 1,
                height: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${score.variability}%`,
                  backgroundColor: '#fbbf24',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#fbbf24', minWidth: '28px' }}>
              {score.variability}%
            </div>
          </div>
        </div>
      </div>

      {/* 建议 */}
      <div
        style={{
          fontSize: '12px',
          padding: '8px 10px',
          borderRadius: '4px',
          backgroundColor: score.isOutlier
            ? 'rgba(239, 68, 68, 0.1)'
            : score.overallScore < 70
            ? 'rgba(251, 191, 36, 0.1)'
            : 'rgba(74, 222, 128, 0.1)',
          color: score.isOutlier
            ? '#fca5a5'
            : score.overallScore < 70
            ? '#fcd34d'
            : '#86efac',
          border: `1px solid ${
            score.isOutlier
              ? 'rgba(239, 68, 68, 0.3)'
              : score.overallScore < 70
              ? 'rgba(251, 191, 36, 0.3)'
              : 'rgba(74, 222, 128, 0.3)'
          }`,
        }}
      >
        {score.recommendation}
      </div>

      {/* 详细信息 - 可选展开 */}
      <details
        style={{
          marginTop: '8px',
          fontSize: '11px',
          color: '#888',
        }}
      >
        <summary style={{ cursor: 'pointer', marginBottom: '6px' }}>
          详细信息
        </summary>
        <div
          style={{
            paddingLeft: '12px',
            borderLeft: '2px solid rgba(255, 255, 255, 0.1)',
            marginTop: '6px',
          }}
        >
          <div>
            峰值幅度: {score.details.peakAmplitude.toFixed(2)}
          </div>
          <div>
            能量范围: [{score.details.energyRange.min.toFixed(2)}, {score.details.energyRange.max.toFixed(2)}]
          </div>
          <div>
            噪声水平: {score.details.noiseLevel.toFixed(4)}
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * 改进的质量评分列表组件
 */
interface ImprovedQualityScoreListProps {
  scores: Array<ImprovedQualityScore & { id: string; index: number }>;
  onDelete?: (id: string) => void;  // 问题3.1修复：使用UUID而不是数组下标
  onRetry?: (id: string) => void;   // 问题3.1修复：使用UUID而不是数组下标
}

export function ImprovedQualityScoreList({
  scores,
  onDelete,
  onRetry,
}: ImprovedQualityScoreListProps) {
  const avgScore =
    scores.length > 0
      ? Math.round(
          scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
        )
      : 0;

  const outlierCount = scores.filter((s) => s.isOutlier).length;
  const goodCount = scores.filter((s) => s.overallScore >= 70).length;
  const fairCount = scores.filter(
    (s) => s.overallScore >= 50 && s.overallScore < 70
  ).length;
  const poorCount = scores.filter((s) => s.overallScore < 50).length;

  return (
    <div>
      {/* 统计摘要 */}
      <div
        style={{
          padding: '12px',
          borderRadius: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          marginBottom: '16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>平均评分</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>
            {avgScore}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>优秀</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>
            {goodCount}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>一般</div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: fairCount > 0 ? '#fbbf24' : '#888',
            }}
          >
            {fairCount}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#aaa' }}>异常</div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: outlierCount > 0 ? '#ef4444' : '#4ade80',
            }}
          >
            {outlierCount}
          </div>
        </div>
      </div>

      {/* 详细列表 */}
      <div>
        {scores.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '24px',
              color: '#888',
              fontSize: '14px',
            }}
          >
            暂无采集数据
          </div>
        ) : (
          scores.map((score) => (
            <ImprovedQualityScoreDisplay
              key={score.id}
              score={score}
              index={score.index}
              onDelete={onDelete ? () => onDelete(score.id) : undefined}
              onRetry={onRetry ? () => onRetry(score.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

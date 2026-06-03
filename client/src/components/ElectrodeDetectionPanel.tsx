/**
 * 电极检测面板组件
 * 
 * 显示：
 * - 电极状态评分
 * - 各通道相似度
 * - 问题和建议
 */

import React from 'react';
import { ElectrodeDetectionResult } from '@/lib/electrode-detection';

interface ElectrodeDetectionPanelProps {
  result: ElectrodeDetectionResult;
  isAcceptable: boolean;
}

export function ElectrodeDetectionPanel({
  result,
  isAcceptable,
}: ElectrodeDetectionPanelProps) {
  const statusColor =
    result.status === 'good'
      ? '#4ade80'
      : result.status === 'fair'
        ? '#fbbf24'
        : '#ef4444';

  const statusText =
    result.status === 'good'
      ? '✓ 良好'
      : result.status === 'fair'
        ? '⚠ 一般'
        : '✗ 不良';

  return (
    <div
      style={{
        backgroundColor: '#1a1a1a',
        border: `2px solid ${statusColor}`,
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      {/* 标题和状态 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h3 style={{ margin: '0', color: '#d4af37' }}>🔌 电极状态检测</h3>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: statusColor,
          }}
        >
          {statusText} ({result.score}%)
        </div>
      </div>

      {/* 进度条 */}
      <div
        style={{
          backgroundColor: '#333',
          height: '8px',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            backgroundColor: statusColor,
            height: '100%',
            width: `${result.score}%`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* 各通道相似度 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {/* CH1 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            CH1 (原始 ADC)
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.ch1Similarity >= 80
                  ? '#4ade80'
                  : result.details.ch1Similarity >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.ch1Similarity}%
          </div>
        </div>

        {/* CH2 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#4ade80', marginBottom: '4px' }}>
            CH2 (主信号)
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.ch2Similarity >= 80
                  ? '#4ade80'
                  : result.details.ch2Similarity >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.ch2Similarity}%
          </div>
        </div>

        {/* CH3 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            CH3 (包络)
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.ch3Similarity >= 80
                  ? '#4ade80'
                  : result.details.ch3Similarity >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.ch3Similarity}%
          </div>
        </div>

        {/* 频率匹配 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            频率匹配
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.frequencyMatch >= 80
                  ? '#4ade80'
                  : result.details.frequencyMatch >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.frequencyMatch}%
          </div>
        </div>

        {/* SNR 匹配 */}
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            SNR 匹配
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color:
                result.details.snrMatch >= 80
                  ? '#4ade80'
                  : result.details.snrMatch >= 60
                    ? '#fbbf24'
                    : '#ef4444',
            }}
          >
            {result.details.snrMatch}%
          </div>
        </div>
      </div>

      {/* 问题和建议 */}
      {result.issues.length > 0 && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444', marginBottom: '8px' }}>
              ⚠️ 检测到的问题：
            </div>
            <ul
              style={{
                margin: '0',
                paddingLeft: '20px',
                fontSize: '12px',
                color: '#ef4444',
                lineHeight: '1.6',
              }}
            >
              {result.issues.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '8px' }}>
              💡 建议：
            </div>
            <ul
              style={{
                margin: '0',
                paddingLeft: '20px',
                fontSize: '12px',
                color: '#fbbf24',
                lineHeight: '1.6',
              }}
            >
              {result.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 状态提示 */}
      {!isAcceptable && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '4px',
            color: '#fca5a5',
            fontSize: '12px',
          }}
        >
          ❌ 电极状态不符合要求，请调节电极后重新检测
        </div>
      )}

      {isAcceptable && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'rgba(74, 222, 128, 0.1)',
            border: '1px solid rgba(74, 222, 128, 0.3)',
            borderRadius: '4px',
            color: '#86efac',
            fontSize: '12px',
          }}
        >
          ✓ 电极状态良好，可以开始采集或测试
        </div>
      )}
    </div>
  );
}

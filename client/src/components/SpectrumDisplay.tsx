/**
 * 频谱显示组件
 * 
 * 显示：
 * - FFT 频谱图
 * - 主要频率成分
 * - 信噪比 (SNR)
 * - 信号质量评分
 */

import React, { useEffect, useRef } from 'react';
import { SpectrumAnalysis, assessSignalQuality } from '@/lib/fft-analysis';

interface SpectrumDisplayProps {
  analysis: SpectrumAnalysis;
  title?: string;
}

export function SpectrumDisplay({ analysis, title = '频谱分析' }: SpectrumDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qualityAssessment = assessSignalQuality(analysis);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制网格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // 垂直网格线
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * canvas.width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // 水平网格线
    for (let i = 0; i <= 5; i++) {
      const y = (i / 5) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 绘制频谱
    const padding = 40;
    const graphWidth = canvas.width - padding * 2;
    const graphHeight = canvas.height - padding * 2;

    // 只显示 0-200 Hz
    const maxFreq = 200;
    const maxMag = Math.max(...analysis.magnitudes.slice(0, Math.floor((maxFreq * analysis.magnitudes.length) / 125)));

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < analysis.magnitudes.length; i++) {
      const frequency = analysis.frequencies[i];
      if (frequency > maxFreq) break;

      const x = padding + (frequency / maxFreq) * graphWidth;
      const y = canvas.height - padding - (analysis.magnitudes[i] / maxMag) * graphHeight;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // 绘制主要频率标记
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    const dominantX = padding + (analysis.dominantFrequency / maxFreq) * graphWidth;
    const dominantY = canvas.height - padding - (analysis.dominantMagnitude / maxMag) * graphHeight;
    ctx.arc(dominantX, dominantY, 5, 0, 2 * Math.PI);
    ctx.fill();

    // 绘制坐标轴标签
    ctx.fillStyle = '#aaa';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';

    // X 轴标签（频率）
    for (let i = 0; i <= 10; i++) {
      const freq = (i / 10) * maxFreq;
      const x = padding + (i / 10) * graphWidth;
      ctx.fillText(`${Math.round(freq)}`, x, canvas.height - 10);
    }

    // Y 轴标签（幅度）
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const mag = (i / 5) * maxMag;
      const y = canvas.height - padding - (i / 5) * graphHeight;
      ctx.fillText(`${mag.toFixed(2)}`, padding - 10, y + 4);
    }

    // 轴标签
    ctx.fillStyle = '#888';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('频率 (Hz)', canvas.width / 2, canvas.height - 5);

    ctx.save();
    ctx.translate(15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('幅度', 0, 0);
    ctx.restore();
  }, [analysis]);

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
          {title}
        </div>

        {/* 质量评分 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '12px',
            marginBottom: '12px',
          }}
        >
          {/* SNR */}
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
              信噪比 (SNR)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#60a5fa' }}>
              {analysis.snr.toFixed(1)} dB
            </div>
          </div>

          {/* 主要频率 */}
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
              主要频率
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24' }}>
              {analysis.dominantFrequency.toFixed(1)} Hz
            </div>
          </div>

          {/* 质量评分 */}
          <div
            style={{
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
              信号质量
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color:
                  qualityAssessment.score >= 80
                    ? '#4ade80'
                    : qualityAssessment.score >= 60
                      ? '#fbbf24'
                      : '#ef4444',
              }}
            >
              {qualityAssessment.score}
            </div>
          </div>
        </div>
      </div>

      {/* 频谱图 */}
      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        style={{
          width: '100%',
          height: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          backgroundColor: '#0a0a0a',
          marginBottom: '12px',
        }}
      />

      {/* 质量反馈 */}
      <div
        style={{
          padding: '12px',
          borderRadius: '6px',
          backgroundColor:
            qualityAssessment.score >= 80
              ? 'rgba(74, 222, 128, 0.1)'
              : qualityAssessment.score >= 60
                ? 'rgba(251, 191, 36, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${
            qualityAssessment.score >= 80
              ? 'rgba(74, 222, 128, 0.3)'
              : qualityAssessment.score >= 60
                ? 'rgba(251, 191, 36, 0.3)'
                : 'rgba(239, 68, 68, 0.3)'
          }`,
          color:
            qualityAssessment.score >= 80
              ? '#86efac'
              : qualityAssessment.score >= 60
                ? '#fcd34d'
                : '#fca5a5',
          fontSize: '12px',
        }}
      >
        {qualityAssessment.feedback}
      </div>

      {/* 峰值列表 */}
      {analysis.peakFrequencies.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
            主要峰值
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '8px',
            }}
          >
            {analysis.peakFrequencies.map((peak, idx) => (
              <div
                key={idx}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: '12px',
                }}
              >
                <div style={{ color: '#aaa' }}>峰值 {idx + 1}</div>
                <div style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                  {peak.frequency.toFixed(1)} Hz
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

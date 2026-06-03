/**
 * 增强波形可视化组件
 * 
 * 功能：
 * - 显示 Raw（原始）、Filtered（滤波）、Envelope（包络）三层波形
 * - 支持实时更新
 * - 支持单通道或三通道显示
 */

import React, { useEffect, useRef } from 'react';
import { processWaveform, ProcessedWaveforms } from '@/lib/dsp-enhanced';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

interface EnhancedWaveformVisualizationProps {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  width?: number;
  height?: number;
  isLive?: boolean;
  title?: string;
  showLayers?: boolean; // 是否显示三层波形
}

export const EnhancedWaveformVisualization: React.FC<EnhancedWaveformVisualizationProps> = ({
  ch1,
  ch2,
  ch3,
  width = 800,
  height = 300,
  isLive = false,
  title,
  showLayers = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置 DPI 缩放
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 清空画布
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // 绘制边框
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;

    // 竖线网格
    const gridSpacingX = width / 10;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridSpacingX, 0);
      ctx.lineTo(i * gridSpacingX, height);
      ctx.stroke();
    }

    // 横线网格
    const gridSpacingY = height / 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * gridSpacingY);
      ctx.lineTo(width, i * gridSpacingY);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // 绘制波形的辅助函数
    // Y 轴范围固定为 ±800（基于实际数据分析，CH2 实测幅值范围 ±767）
    const Y_AXIS_MIN = -800;
    const Y_AXIS_MAX = 800;
    const Y_AXIS_RANGE = Y_AXIS_MAX - Y_AXIS_MIN;

    const drawWaveform = (data: number[], color: string, offset: number, alpha: number = 1) => {
      if (data.length === 0) return;

      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 0.8;
      ctx.beginPath();

      const channelHeight = height / 3;
      const centerY = offset * channelHeight + channelHeight / 2;

      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * width;
        // 使用固定的 Y 轴范围，不自动缩放
        const normalizedValue = (data[i] - Y_AXIS_MIN) / Y_AXIS_RANGE;
        const y = centerY - (normalizedValue - 0.5) * channelHeight * 0.8;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    // 处理波形
    const processedCh1 = processWaveform(ch1);
    const processedCh2 = processWaveform(ch2);
    const processedCh3 = processWaveform(ch3);

    if (showLayers) {
      // 显示三层波形：Raw、Filtered、Envelope
      // 第一通道
      drawWaveform(processedCh1.raw, '#666', 0, 0.3); // Raw - 灰色，透明度 30%
      drawWaveform(processedCh1.filtered, '#60a5fa', 0, 0.6); // Filtered - 蓝色，透明度 60%
      drawWaveform(processedCh1.envelope, '#d4af37', 0, 1); // Envelope - 金色，完全不透明

      // 第二通道
      drawWaveform(processedCh2.raw, '#666', 1, 0.3);
      drawWaveform(processedCh2.filtered, '#4ade80', 1, 0.6);
      drawWaveform(processedCh2.envelope, '#d4af37', 1, 1);

      // 第三通道
      drawWaveform(processedCh3.raw, '#666', 2, 0.3);
      drawWaveform(processedCh3.filtered, '#ef4444', 2, 0.6);
      drawWaveform(processedCh3.envelope, '#d4af37', 2, 1);
    } else {
      // 只显示滤波波形
      drawWaveform(processedCh1.filtered, '#60a5fa', 0);
      drawWaveform(processedCh2.filtered, '#4ade80', 1);
      drawWaveform(processedCh3.filtered, '#ef4444', 2);
    }

    // 绘制通道标签
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.fillText('CH1', 10, 20);
    ctx.fillText('CH2', 10, height / 3 + 20);
    ctx.fillText('CH3', 10, (2 * height) / 3 + 20);

    // 绘制图例
    if (showLayers) {
      const legendY = height - 20;
      const legendSpacing = width / 4;

      // Raw
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(width - legendSpacing * 3, legendY);
      ctx.lineTo(width - legendSpacing * 3 - 20, legendY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#888';
      ctx.font = '10px sans-serif';
      ctx.fillText('Raw', width - legendSpacing * 3 + 5, legendY + 4);

      // Filtered
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(width - legendSpacing * 2, legendY);
      ctx.lineTo(width - legendSpacing * 2 - 20, legendY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#888';
      ctx.fillText('Filtered', width - legendSpacing * 2 + 5, legendY + 4);

      // Envelope
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width - legendSpacing, legendY);
      ctx.lineTo(width - legendSpacing - 20, legendY);
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.fillText('Envelope', width - legendSpacing + 5, legendY + 4);
    }

    // 绘制时间标签
    if (isLive) {
      const duration = (ch1.length / HARDWARE_CONFIG.SAMPLE_RATE).toFixed(2); // 250Hz 采样率
      ctx.fillStyle = '#888';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${duration}s`, width - 10, height - 10);
    }
  }, [ch1, ch2, ch3, width, height, isLive, showLayers]);

  return (
    <div style={{ marginBottom: '16px' }}>
      {title && (
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
          {title}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          width: '100%',
          height: 'auto',
          border: '1px solid #333',
          borderRadius: '4px',
          backgroundColor: '#1a1a1a',
        }}
      />
    </div>
  );
};

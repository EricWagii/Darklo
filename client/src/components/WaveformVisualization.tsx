/**
 * 波形可视化组件
 * 
 * 功能：
 * - 实时绘制 3 通道 EMG 波形
 * - 支持历史波形缩小图显示
 * - 自定义颜色和尺寸
 */

import React, { useEffect, useRef } from 'react';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

interface WaveformVisualizationProps {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  width?: number;
  height?: number;
  isLive?: boolean;
  title?: string;
}

export const WaveformVisualization: React.FC<WaveformVisualizationProps> = ({
  ch1,
  ch2,
  ch3,
  width = 800,
  height = 300,
  isLive = false,
  title,
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
    ctx.fillStyle = 'var(--color-bg-secondary)';
    ctx.fillRect(0, 0, width, height);

    // 绘制边框
    ctx.strokeStyle = 'var(--color-border)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = 'var(--color-border)';
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

    // 绘制波形
    const drawWaveform = (data: number[], color: string, offset: number) => {
      if (data.length === 0) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const maxValue = Math.max(...data.map(Math.abs), 1);
      const channelHeight = height / 3;
      const centerY = offset * channelHeight + channelHeight / 2;

      for (let i = 0; i < data.length; i++) {
        const x = (i / data.length) * width;
        const y = centerY - (data[i] / maxValue) * (channelHeight / 2) * 0.8;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    };

    // 绘制三个通道
    drawWaveform(ch1, 'var(--color-accent-primary)', 0);
    drawWaveform(ch2, '#4ade80', 1);
    drawWaveform(ch3, '#ef4444', 2);

    // 绘制通道标签
    ctx.fillStyle = 'var(--color-text-secondary)';
    ctx.font = '12px var(--font-sans)';
    ctx.fillText('CH1', 10, 20);
    ctx.fillText('CH2', 10, height / 3 + 20);
    ctx.fillText('CH3', 10, (2 * height) / 3 + 20);

    // 绘制时间标签
    if (isLive) {
      const duration = (ch1.length / HARDWARE_CONFIG.SAMPLE_RATE).toFixed(2); // 250Hz 采样率
      ctx.fillStyle = 'var(--color-text-secondary)';
      ctx.font = '12px var(--font-sans)';
      ctx.textAlign = 'right';
      ctx.fillText(`${duration}s`, width - 10, height - 10);
    }
  }, [ch1, ch2, ch3, width, height, isLive]);

  return (
    <div className="mb-6">
      {title && (
        <div className="label mb-2" style={{ color: 'var(--color-text-secondary)' }}>
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
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      />
    </div>
  );
};

/**
 * 缩小波形图组件
 */
interface ThumbnailWaveformProps {
  ch1: number[];
  ch2: number[];
  ch3: number[];
  index: number;
  onClick?: () => void;
  onDelete?: () => void;
}

export const ThumbnailWaveform: React.FC<ThumbnailWaveformProps> = ({
  ch1,
  ch2,
  ch3,
  index,
  onClick,
  onDelete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 120;
  const height = 60;

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
    ctx.fillStyle = 'var(--color-bg-tertiary)';
    ctx.fillRect(0, 0, width, height);

    // 绘制边框
    ctx.strokeStyle = 'var(--color-border)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // 绘制波形
    const drawWaveform = (data: number[], color: string, offset: number) => {
      if (data.length === 0) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();

      const maxValue = Math.max(...data.map(Math.abs), 1);
      const channelHeight = height / 3;
      const centerY = offset * channelHeight + channelHeight / 2;

      // 采样间隔
      const step = Math.max(1, Math.floor(data.length / width));

      for (let i = 0; i < data.length; i += step) {
        const x = (i / data.length) * width;
        const y = centerY - (data[i] / maxValue) * (channelHeight / 2) * 0.8;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    };

    drawWaveform(ch1, 'var(--color-accent-primary)', 0);
    drawWaveform(ch2, '#4ade80', 1);
    drawWaveform(ch3, '#ef4444', 2);
  }, [ch1, ch2, ch3]);

  return (
    <div className="relative group">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={onClick}
        style={{
          cursor: 'pointer',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          transition: 'all 0.3s ease',
        }}
        className="group-hover:border-accent"
      />
      <div
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
      >
        <button
          className="bg-error text-white px-2 py-1 rounded text-xs font-bold hover:bg-red-700"
          title="删除"
        >
          ✕
        </button>
      </div>
      <div className="text-center text-xs text-secondary mt-1">采集 #{index}</div>
    </div>
  );
};

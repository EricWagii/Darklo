/**
 * 实时波形可视化组件
 * 
 * 显示 3 个通道的 EMG 波形
 */

import { useEffect, useRef } from 'react';
import { EMGData } from '@/lib/serial-port';

interface WaveformChartProps {
  data: EMGData[];
  maxPoints?: number;
  height?: number;
}

export function WaveformChart({
  data,
  maxPoints = 250,
  height = 200,
}: WaveformChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const chartHeight = canvas.height;
    const channelHeight = chartHeight / 3;

    // 清空画布
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, chartHeight);

    // 绘制分隔线
    ctx.strokeStyle = '#e5e5e7';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * channelHeight);
      ctx.lineTo(width, i * channelHeight);
      ctx.stroke();
    }

    // 获取最后 maxPoints 个数据点
    const displayData = data.slice(-maxPoints);
    const pointsPerPixel = Math.max(1, displayData.length / width);

    // 绘制三个通道的波形
    const colors = ['#0071E3', '#34C759', '#FF9500']; // 蓝、绿、橙

    for (let ch = 0; ch < 3; ch++) {
      ctx.strokeStyle = colors[ch];
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let i = 0; i < displayData.length; i++) {
        const x = (i / pointsPerPixel) * (width / displayData.length);
        const value = displayData[i].channels[ch];

        // 归一化到 0-1 范围（假设最大值为 1000）
        const normalized = Math.max(0, Math.min(1, value / 1000));

        // 计算 Y 坐标
        const y =
          ch * channelHeight +
          channelHeight / 2 -
          (normalized - 0.5) * (channelHeight * 0.8);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }

    // 绘制通道标签
    ctx.fillStyle = '#86868B';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CH1', 8, 16 + 0 * channelHeight);
    ctx.fillText('CH2', 8, 16 + 1 * channelHeight);
    ctx.fillText('CH3', 8, 16 + 2 * channelHeight);
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={height}
      className="w-full border border-gray-200 rounded-lg bg-white"
    />
  );
}

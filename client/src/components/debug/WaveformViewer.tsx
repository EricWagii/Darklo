import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DebugData } from '@/pages/DebugPage';
import { calculateEnergyDistribution } from '@/lib/debug-utils';

interface WaveformViewerProps {
  data: DebugData;
}

interface MousePos {
  x: number;
  y: number;
  value?: number;
  sampleIndex?: number;
}

export default function WaveformViewer({ data }: WaveformViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const energyCanvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<MousePos | null>(null);
  const [hoveredCanvas, setHoveredCanvas] = useState<'waveform' | 'energy' | null>(null);

  // 绘制波形
  useEffect(() => {
    if (!canvasRef.current || !data.rawWaveform.ch1) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const waveform = data.rawWaveform.ch1;

    // 清空画布
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridSpacing = 50;
    
    // 垂直网格线
    for (let i = 0; i <= Math.ceil(width / gridSpacing); i++) {
      const x = i * gridSpacing;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // 水平网格线
    for (let i = 0; i <= Math.ceil(height / gridSpacing); i++) {
      const y = i * gridSpacing;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 绘制中心线
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制波形
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const xScale = width / waveform.length;
    const yCenter = height / 2;
    
    // 找到最大值用于缩放
    const maxValue = Math.max(...waveform.map(v => Math.abs(v)));
    const yScale = (height / 2) * 0.85 / (maxValue || 1);

    for (let i = 0; i < waveform.length; i++) {
      const x = i * xScale;
      const y = yCenter - (waveform[i] * yScale);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // 绘制有效区间背景
    const startX = (data.croppingParams.startIdx / waveform.length) * width;
    const endX = (data.croppingParams.endIdx / waveform.length) * width;

    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.fillRect(startX, 0, endX - startX, height);

    // 绘制裁切线
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();

    // 绘制标签
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Start', startX + 5, 20);

    ctx.fillStyle = '#ef4444';
    ctx.fillText('End', endX - 30, 20);

    // 绘制长度标注
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    const croppingLength = data.croppingParams.endIdx - data.croppingParams.startIdx;
    const croppingMs = (croppingLength / 500) * 1000;
    ctx.fillText(`${croppingMs.toFixed(0)}ms`, (startX + endX) / 2 - 20, height - 10);
  }, [data]);

  // 绘制能量分布
  useEffect(() => {
    if (!energyCanvasRef.current || !data.rawWaveform.ch1) return;

    const canvas = energyCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const waveform = data.rawWaveform.ch1;
    const energy = calculateEnergyDistribution(waveform);

    // 清空画布
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // 绘制网格
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const gridSpacing = 50;
    
    for (let i = 0; i <= Math.ceil(width / gridSpacing); i++) {
      const x = i * gridSpacing;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    for (let i = 0; i <= Math.ceil(height / gridSpacing); i++) {
      const y = i * gridSpacing;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 找到能量的最大值
    const maxEnergy = Math.max(...energy);

    // 绘制能量分布（面积图）
    ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const xScale = width / energy.length;
    const yScale = (height * 0.9) / (maxEnergy * 1.1);

    for (let i = 0; i < energy.length; i++) {
      const x = i * xScale;
      const y = height - energy[i] * yScale;

      if (i === 0) {
        ctx.moveTo(x, height);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 绘制阈值线
    if (data.energyAnalysis.threshold > 0) {
      const thresholdY = height - data.energyAnalysis.threshold * yScale;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, thresholdY);
      ctx.lineTo(width, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('Threshold', 5, thresholdY - 5);
    }

    // 绘制有效段标记
    const startX = (data.energyAnalysis.validSegmentStart / energy.length) * width;
    const endX = (data.energyAnalysis.validSegmentEnd / energy.length) * width;

    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.fillRect(startX, 0, endX - startX, height);

    // 绘制有效段边界线
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [data]);

  // 处理鼠标移动
  const handleMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>,
    type: 'waveform' | 'energy'
  ) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const sampleIndex = Math.floor((x / canvas.width) * data.rawWaveform.ch1.length);
    let value = 0;

    if (type === 'waveform') {
      value = data.rawWaveform.ch1[sampleIndex] || 0;
    } else {
      const energy = calculateEnergyDistribution(data.rawWaveform.ch1);
      value = energy[sampleIndex] || 0;
    }

    setMousePos({ x, y, value, sampleIndex });
    setHoveredCanvas(type);
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoveredCanvas(null);
  };

  return (
    <div className="space-y-4">
      {/* 波形图 */}
      <Card>
        <CardHeader>
          <CardTitle>📊 原始波形</CardTitle>
          <CardDescription>
            长度: {data.rawWaveform.ch1.length} 样本 ({data.rawWaveform.duration.toFixed(0)}ms)
            {mousePos && hoveredCanvas === 'waveform' && (
              <span className="ml-4 text-blue-400">
                | 样本 #{mousePos.sampleIndex}: {mousePos.value?.toFixed(2)}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <canvas
            ref={canvasRef}
            width={800}
            height={300}
            className="w-full border border-slate-700 rounded-lg bg-slate-950 cursor-crosshair"
            onMouseMove={(e) => handleMouseMove(e, 'waveform')}
            onMouseLeave={handleMouseLeave}
          />
          <div className="mt-3 text-xs text-slate-400 space-y-1">
            <p>🟢 绿线: 裁切起点 (startIdx = {data.croppingParams.startIdx})</p>
            <p>🔴 红线: 裁切终点 (endIdx = {data.croppingParams.endIdx})</p>
            <p>🔵 蓝色区域: 有效裁切范围 ({data.croppingParams.endIdx - data.croppingParams.startIdx} 样本)</p>
            <p>💡 将鼠标悬停在图表上查看具体数值</p>
          </div>
        </CardContent>
      </Card>

      {/* 能量分布图 */}
      <Card>
        <CardHeader>
          <CardTitle>⚡ 能量分布</CardTitle>
          <CardDescription>
            阈值: {data.energyAnalysis.threshold.toFixed(2)} | 置信度: {(data.energyAnalysis.confidence * 100).toFixed(0)}% | 峰值数: {data.energyAnalysis.peakCount}
            {mousePos && hoveredCanvas === 'energy' && (
              <span className="ml-4 text-orange-400">
                | 样本 #{mousePos.sampleIndex}: {mousePos.value?.toFixed(2)}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <canvas
            ref={energyCanvasRef}
            width={800}
            height={300}
            className="w-full border border-slate-700 rounded-lg bg-slate-950 cursor-crosshair"
            onMouseMove={(e) => handleMouseMove(e, 'energy')}
            onMouseLeave={handleMouseLeave}
          />
          <div className="mt-3 text-xs text-slate-400 space-y-1">
            <p>🟠 橙色区域: 能量分布（面积图）</p>
            <p>🔴 红色虚线: 能量阈值（高于此线为有效信号）</p>
            <p>🟢 绿色虚线: 有效段范围</p>
            <p>💡 将鼠标悬停在图表上查看具体数值</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';

interface ContinuousEmgWaveformProps {
  rawSamples: number[];
  envelopeSamples: number[];
  startThreshold: number;
  endThreshold: number;
  isActive: boolean;
}
export function ContinuousEmgWaveform({
  rawSamples,
  envelopeSamples,
  startThreshold,
  endThreshold,
  isActive,
}: ContinuousEmgWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#090b0c';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = '#202426';
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 100) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 52) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    const rawScale = Math.max(30, ...rawSamples.map((value) => Math.abs(value)));
    const envelopeScale = Math.max(20, startThreshold * 1.8, ...envelopeSamples);

    const drawSeries = (
      values: number[],
      mapY: (value: number) => number,
      color: string,
      lineWidth: number
    ) => {
      if (values.length < 2) return;
      context.beginPath();
      values.forEach((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = mapY(value);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.stroke();
    };

    drawSeries(
      rawSamples,
      (value) => 72 - (value / rawScale) * 55,
      '#7f8c8d',
      1.2
    );
    drawSeries(
      envelopeSamples,
      (value) => height - 20 - (value / envelopeScale) * 110,
      isActive ? '#f2c94c' : '#50c878',
      2
    );

    const drawThreshold = (value: number, color: string) => {
      const y = height - 20 - (value / envelopeScale) * 110;
      context.setLineDash([8, 7]);
      context.strokeStyle = color;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
      context.setLineDash([]);
    };

    drawThreshold(startThreshold, '#d4af37');
    drawThreshold(endThreshold, '#4f8fba');

    context.font = '13px sans-serif';
    context.fillStyle = '#8b9295';
    context.fillText('CH2 原始信号', 14, 22);
    context.fillText('包络与触发阈值', 14, 145);
  }, [rawSamples, envelopeSamples, startThreshold, endThreshold, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={260}
      aria-label="CH2 连续肌电波形"
      className="w-full border"
      style={{ borderColor: 'var(--color-border)', aspectRatio: '1000 / 260' }}
    />
  );
}

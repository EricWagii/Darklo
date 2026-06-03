/**
 * 电极基准采集组件（全局基准版本）
 * 
 * 功能：
 * - 采集 3-5 秒的静息信号作为全局基准
 * - 计算基准特征
 * - 保存到 IndexedDB（全局）
 */

import React, { useState, useRef } from 'react';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { calculateSignalStats } from '@/lib/electrode-detection';
import { computeFFT } from '@/lib/fft-analysis';
import { EnhancedWaveformVisualization } from './EnhancedWaveformVisualization';
import { emgDatabase } from '@/lib/db';
import { toast } from 'sonner';

interface ElectrodeBaselineCaptureProps {
  onComplete?: () => void;
}

export function ElectrodeBaselineCapture({ onComplete }: ElectrodeBaselineCaptureProps) {
  const { isConnected, onDataReceived } = useSerialConnectionContext();

  const [isCapturing, setIsCapturing] = useState(false);
  const [captureTime, setCaptureTime] = useState(0);
  const [waveform, setWaveform] = useState<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });

  const waveformBufferRef = useRef<{ ch1: number[]; ch2: number[]; ch3: number[] }>({
    ch1: [],
    ch2: [],
    ch3: [],
  });

  // ✅ 修改18：使用isCapturingRef代替闭包里的isCapturing
  const isCapturingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 开始采集基准
  const handleStartCapture = () => {
    if (!isConnected) {
      alert('请先连接 STM32 设备');
      return;
    }

    setIsCapturing(true);
    isCapturingRef.current = true;
    setCaptureTime(0);
    waveformBufferRef.current = { ch1: [], ch2: [], ch3: [] };
    setWaveform({ ch1: [], ch2: [], ch3: [] });

    // 注册数据接收回调
    onDataReceived((data: any) => {
      // ✅ 修改18：使用isCapturingRef而不是闭包里的isCapturing
      if (isCapturingRef.current) {
        waveformBufferRef.current.ch1.push(data.channel1);
        waveformBufferRef.current.ch2.push(data.channel2);
        waveformBufferRef.current.ch3.push(data.channel3);

        // 实时显示（最多显示 500 个点）
        setWaveform({
          ch1: waveformBufferRef.current.ch1.slice(-500),
          ch2: waveformBufferRef.current.ch2.slice(-500),
          ch3: waveformBufferRef.current.ch3.slice(-500),
        });
      }
    });

    // 计时器
    timerRef.current = setInterval(() => {
      setCaptureTime((t) => {
        if (t >= 4) {
          // 5 秒后自动停止
          handleStopCapture();
          return t;
        }
        return t + 1;
      });
    }, 1000);
  };

  // 停止采集基准
  const handleStopCapture = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsCapturing(false);
    isCapturingRef.current = false;

    // 计算基准特征
    if (waveformBufferRef.current.ch1.length >= 100) {
      const stats = calculateSignalStats(
        waveformBufferRef.current.ch1,
        waveformBufferRef.current.ch2,
        waveformBufferRef.current.ch3
      );

      // 计算频谱
      let spectrum = { dominantFrequency: 0, snr: 0 };
      try {
        // ✅ 修改18：使用系统采样率500而不是250
        spectrum = computeFFT(waveformBufferRef.current.ch2, 500);
      } catch (err) {
        console.error('频谱计算失败:', err);
      }

      // 保存全局基准到 IndexedDB
      const baseline = {
        ch1Mean: stats.ch1Mean,
        ch1Std: stats.ch1Std,
        ch2Mean: stats.ch2Mean,
        ch2Std: stats.ch2Std,
        ch3Mean: stats.ch3Mean,
        ch3Std: stats.ch3Std,
        dominantFrequency: spectrum.dominantFrequency,
        snr: spectrum.snr,
        capturedAt: new Date().toISOString(),
      };

      // ✅ 修改18：保存电极基准到IndexedDB
      emgDatabase.saveCalibration(baseline)
        .then(() => {
          toast.success('✓ 全局电极基准采集成功！');
          onComplete?.();
        })
        .catch((err) => {
          console.error('保存基准失败:', err);
          toast.error('✗ 保存基准失败');
        });
    } else {
      alert('采集数据不足，请重试');
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', color: '#d4af37' }}>⚡ 全局电极基准采集</h3>

      {/* 说明 */}
      <div
        style={{
          backgroundColor: '#0a0a0a',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '12px',
          marginBottom: '16px',
          fontSize: '12px',
          color: '#888',
          lineHeight: '1.6',
        }}
      >
        <strong style={{ color: '#d4af37' }}>采集说明：</strong>
        <br />
        1. 保持静息状态，不要做任何肌肉收缩
        <br />
        2. 系统将采集 5 秒的静息信号作为全局基准
        <br />
        3. 基准用于所有用户的电极状态检测
        <br />
        4. 只需采集一次，所有用户共享
      </div>

      {/* 波形显示 */}
      {isCapturing && (
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '16px',
          }}
        >
          <EnhancedWaveformVisualization
            ch1={waveform.ch1}
            ch2={waveform.ch2}
            ch3={waveform.ch3}
            height={200}
            isLive={true}
            showLayers={false}
            title="实时波形"
          />
        </div>
      )}

      {/* 采集进度 */}
      {isCapturing && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#888', fontSize: '12px' }}>采集进度</span>
            <span style={{ color: '#4ade80', fontWeight: 'bold' }}>
              {captureTime} / 5 秒
            </span>
          </div>
          <div
            style={{
              backgroundColor: '#333',
              height: '8px',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                backgroundColor: '#4ade80',
                height: '100%',
                width: `${(captureTime / 5) * 100}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* 按钮 */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {!isCapturing ? (
          <button
            onClick={handleStartCapture}
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: isConnected ? '#4ade80' : '#666',
              color: isConnected ? '#000' : '#999',
              border: 'none',
              borderRadius: '4px',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
          >
            开始采集全局基准
          </button>
        ) : (
          <button
            onClick={handleStopCapture}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
          >
            停止采集
          </button>
        )}
      </div>

      {/* 基准信息 */}
      {/* TODO: 从 IndexedDB 加载并显示已采集的全局基准 */}
    </div>
  );
}

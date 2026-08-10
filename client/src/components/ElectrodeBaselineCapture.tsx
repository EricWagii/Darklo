/**
 * 电极基准采集组件（全局基准版本）
 * 
 * 功能：
 * - 采集 3-5 秒的静息信号作为全局基准
 * - 计算基准特征
 * - 保存到 IndexedDB（全局）
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { computeFFT } from '@/lib/fft-analysis';
import { EnhancedWaveformVisualization } from './EnhancedWaveformVisualization';
import { emgDatabase } from '@/lib/db';
import { toast } from 'sonner';
import { calculateRestingStats } from '@/lib/resting-baseline-utils';
import { setEmgRuntimeBusy } from '@/lib/emg-runtime-state';
import {
  evaluateBaselineCapture,
  type BaselineCaptureSnapshot,
} from '@/lib/baseline-capture-window';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

const CAPTURE_DURATION_MS = 5_000;
const MINIMUM_BASELINE_SAMPLES = 100;

const emptyCaptureSnapshot: BaselineCaptureSnapshot = {
  elapsedMs: 0,
  progress: 0,
  sampleCount: 0,
  measuredSampleRate: 0,
  status: 'collecting',
};

interface ElectrodeBaselineCaptureProps {
  onComplete?: () => void;
}

export function ElectrodeBaselineCapture({ onComplete }: ElectrodeBaselineCaptureProps) {
  const { isConnected, onDataReceived } = useSerialConnectionContext();

  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSnapshot, setCaptureSnapshot] = useState(emptyCaptureSnapshot);
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
  const captureStartedAtRef = useRef(0);
  const captureFinishedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const unsubscribeRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    setEmgRuntimeBusy('baseline-capture', isCapturing);
    return () => setEmgRuntimeBusy('baseline-capture', false);
  }, [isCapturing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      unsubscribeRef.current?.();
    };
  }, []);

  const handleStopCapture = useCallback(() => {
    if (captureFinishedRef.current) return;
    captureFinishedRef.current = true;

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsCapturing(false);
    isCapturingRef.current = false;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;

    const samplesCollected = waveformBufferRef.current.ch1.length;
    const elapsedMs = Math.max(1, Date.now() - captureStartedAtRef.current);
    const measuredSampleRate = samplesCollected / (elapsedMs / 1_000);
    setCaptureSnapshot((current) => ({
      ...current,
      elapsedMs,
      progress: Math.min(100, (elapsedMs / CAPTURE_DURATION_MS) * 100),
      sampleCount: samplesCollected,
      measuredSampleRate,
      status: samplesCollected === 0
        ? 'no-data'
        : samplesCollected < MINIMUM_BASELINE_SAMPLES
          ? 'insufficient'
          : 'complete',
    }));

    if (samplesCollected < MINIMUM_BASELINE_SAMPLES) {
      if (samplesCollected === 0) {
        toast.error('未收到任何有效串口帧。请确认设备持续发送数据后重试。');
      } else {
        toast.error(
          `静息基线仅收到 ${samplesCollected} 个样本（约 ${Math.round(measuredSampleRate)} Hz），至少需要 ${MINIMUM_BASELINE_SAMPLES} 个。`
        );
      }
      return;
    }

    // 计算基准特征
    let spectrum = { dominantFrequency: 0, snr: 0 };
    try {
      spectrum = computeFFT(waveformBufferRef.current.ch2, HARDWARE_CONFIG.SAMPLE_RATE);
    } catch (err) {
      console.error('频谱计算失败:', err);
    }

    const restingBaseline = {
      ch1: [...waveformBufferRef.current.ch1],
      ch2: [...waveformBufferRef.current.ch2],
      ch3: [...waveformBufferRef.current.ch3],
    };
    const restingStats = calculateRestingStats(restingBaseline);
    const baseline = {
      ch1Mean: restingStats.ch1Mean,
      ch1Std: restingStats.ch1Std,
      ch2Mean: restingStats.ch2Mean,
      ch2Std: restingStats.ch2Std,
      ch3Mean: restingStats.ch3Mean,
      ch3Std: restingStats.ch3Std,
      dominantFrequency: spectrum.dominantFrequency,
      snr: spectrum.snr,
      capturedAt: restingStats.capturedAt,
      samplesCollected: restingStats.samplesCollected,
      restingBaseline,
    };

    emgDatabase.saveCalibration(baseline)
      .then(() => {
        toast.success(`全局电极基准采集成功：${samplesCollected} 个样本`);
        onComplete?.();
      })
      .catch((err) => {
        console.error('保存基准失败:', err);
        toast.error('保存基准失败');
      });
  }, [onComplete]);

  // 开始采集基准
  const handleStartCapture = useCallback(() => {
    if (!isConnected) {
      alert('请先连接 STM32 设备');
      return;
    }

    captureFinishedRef.current = false;
    captureStartedAtRef.current = Date.now();
    setIsCapturing(true);
    isCapturingRef.current = true;
    setCaptureSnapshot(emptyCaptureSnapshot);
    waveformBufferRef.current = { ch1: [], ch2: [], ch3: [] };
    setWaveform({ ch1: [], ch2: [], ch3: [] });
    unsubscribeRef.current?.();

    // 注册数据接收回调
    unsubscribeRef.current = onDataReceived((data: any) => {
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

    // 进度按真实经过时间计算；串口帧数只用于验收和诊断。
    timerRef.current = window.setInterval(() => {
      const snapshot = evaluateBaselineCapture({
        startedAt: captureStartedAtRef.current,
        now: Date.now(),
        durationMs: CAPTURE_DURATION_MS,
        sampleCount: waveformBufferRef.current.ch1.length,
        minimumSamples: MINIMUM_BASELINE_SAMPLES,
      });
      setCaptureSnapshot(snapshot);
      if (snapshot.status !== 'collecting') handleStopCapture();
    }, 100);
  }, [handleStopCapture, isConnected, onDataReceived]);

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
              {(captureSnapshot.elapsedMs / 1_000).toFixed(1)} / 5.0 秒
              {' · '}{captureSnapshot.sampleCount} 样本
              {' · '}{Math.round(captureSnapshot.measuredSampleRate)} Hz
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
                width: `${captureSnapshot.progress}%`,
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

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { emgDatabase } from '@/lib/db';
import {
  RestingBaselineWaveform,
  detectRestingNoiseDrift,
  getRestingBaselineStats,
  isLikelyMuscleActivity,
} from '@/lib/resting-baseline-utils';
import { isEmgRuntimeBusy } from '@/lib/emg-runtime-state';

const CHECK_INTERVAL_MS = 30_000;
const CHECK_WINDOW_MS = 2_000;
const MIN_IDLE_SAMPLES = 300;
const MAX_MONITOR_SAMPLES = 1_200;
const CONSECUTIVE_ABNORMAL_LIMIT = 3;

export function IdleBaselineNoiseMonitor() {
  const { isConnected, onDataReceived } = useSerialConnectionContext();
  const bufferRef = useRef<RestingBaselineWaveform>({ ch1: [], ch2: [], ch3: [] });
  const collectingRef = useRef(false);
  const windowStartedAtRef = useRef(0);
  const nextCheckAtRef = useRef(Date.now() + CHECK_INTERVAL_MS);
  const abnormalCountRef = useRef(0);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!isConnected) {
      collectingRef.current = false;
      bufferRef.current = { ch1: [], ch2: [], ch3: [] };
      abnormalCountRef.current = 0;
      warnedRef.current = false;
      nextCheckAtRef.current = Date.now() + CHECK_INTERVAL_MS;
      return;
    }

    const finishWindow = async () => {
      collectingRef.current = false;
      const waveform = bufferRef.current;
      bufferRef.current = { ch1: [], ch2: [], ch3: [] };
      nextCheckAtRef.current = Date.now() + CHECK_INTERVAL_MS;

      if (waveform.ch1.length < MIN_IDLE_SAMPLES) {
        return;
      }

      const baseline = await emgDatabase.getCalibration();
      const baselineStats = getRestingBaselineStats(baseline);
      if (!baselineStats) {
        return;
      }

      if (isLikelyMuscleActivity(waveform, baselineStats)) {
        console.log('[静息监测] 检测窗口疑似包含肌肉活动，已丢弃');
        return;
      }

      const drift = detectRestingNoiseDrift(waveform, baselineStats);
      if (drift.abnormal) {
        abnormalCountRef.current += 1;
        console.warn('[静息监测] 底噪异常:', drift.reasons.join(', '), `连续 ${abnormalCountRef.current} 次`);
      } else {
        abnormalCountRef.current = 0;
        warnedRef.current = false;
      }

      if (abnormalCountRef.current >= CONSECUTIVE_ABNORMAL_LIMIT && !warnedRef.current) {
        warnedRef.current = true;
        toast.warning('检测到底噪变化，建议保持放松并重新采集静息基线', {
          duration: 8000,
        });
      }
    };

    const unsubscribe = onDataReceived((data) => {
      const now = Date.now();
      if (isEmgRuntimeBusy()) {
        collectingRef.current = false;
        bufferRef.current = { ch1: [], ch2: [], ch3: [] };
        nextCheckAtRef.current = now + CHECK_INTERVAL_MS;
        return;
      }

      if (!collectingRef.current && now >= nextCheckAtRef.current) {
        collectingRef.current = true;
        windowStartedAtRef.current = now;
        bufferRef.current = { ch1: [], ch2: [], ch3: [] };
      }

      if (!collectingRef.current) {
        return;
      }

      bufferRef.current.ch1.push(data.channel1);
      bufferRef.current.ch2.push(data.channel2);
      bufferRef.current.ch3.push(data.channel3);

      if (
        now - windowStartedAtRef.current >= CHECK_WINDOW_MS ||
        bufferRef.current.ch1.length >= MAX_MONITOR_SAMPLES
      ) {
        finishWindow();
      }
    });

    return unsubscribe;
  }, [isConnected, onDataReceived]);

  return null;
}

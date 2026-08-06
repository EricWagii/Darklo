import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Activity, ArrowLeft, Check, Download, Pause, Play, RotateCcw, Undo2 } from 'lucide-react';
import {
  Button,
  Card,
  Container,
  Divider,
  Section,
  SectionLabel,
  SectionTitle,
} from '@/components/PremiumComponents';
import { ContinuousEmgWaveform } from '@/components/ContinuousEmgWaveform';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import {
  appendPulse,
  confirmPending,
  createDecoderState,
  getCharacterCountdownMs,
  PACE_PRESETS,
  resetDecoder,
  tickDecoder,
  undoDecoder,
  type DecoderConfig,
  type DecoderState,
  type PaceMode,
} from '@/lib/continuous-code-decoder';
import {
  buildContinuousCalibration,
  ContinuousEmgDetector,
  estimateContinuousBaseline,
  type ContinuousBaselineStats,
  type ContinuousCalibration,
  type DetectorSnapshot,
} from '@/lib/continuous-emg-detector';
import { MORSE_ENTRIES } from '@/lib/morse-code';
import { setEmgRuntimeBusy } from '@/lib/emg-runtime-state';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

type SessionPhase =
  | 'idle'
  | 'baseline'
  | 'shortCalibration'
  | 'longCalibration'
  | 'ready'
  | 'decoding'
  | 'paused';

interface TimelineEntry {
  at: number;
  kind: 'pulse' | 'blocked' | 'system';
  message: string;
  durationMs?: number;
}

const BASELINE_SAMPLE_COUNT = HARDWARE_CONFIG.SAMPLE_RATE * 3;
const CALIBRATION_TARGET = 3;
const DISPLAY_SAMPLE_COUNT = 750;

const emptySnapshot: DetectorSnapshot = {
  envelope: 0,
  startThreshold: 0,
  endThreshold: 0,
  isActive: false,
  isBlocked: false,
  blockedReason: null,
};

const phaseNames: Record<SessionPhase, string> = {
  idle: '等待校准',
  baseline: '采集静息基线',
  shortCalibration: '校准短咬',
  longCalibration: '校准长咬',
  ready: '校准完成',
  decoding: '持续解码中',
  paused: '已暂停',
};

const blockedReasonNames: Record<string, string> = {
  saturation: '信号饱和',
  drift: '基线漂移',
  overlong: '持续动作过长',
};

export default function ContinuousCodeMode() {
  const [, navigate] = useLocation();
  const serial = useSerialConnectionContext();
  const [phase, setPhaseState] = useState<SessionPhase>('idle');
  const phaseRef = useRef<SessionPhase>('idle');
  const [baselineProgress, setBaselineProgress] = useState(0);
  const baselineSamplesRef = useRef<number[]>([]);
  const baselineStatsRef = useRef<ContinuousBaselineStats | null>(null);
  const shortDurationsRef = useRef<number[]>([]);
  const longDurationsRef = useRef<number[]>([]);
  const [shortDurations, setShortDurations] = useState<number[]>([]);
  const [longDurations, setLongDurations] = useState<number[]>([]);
  const [calibration, setCalibration] = useState<ContinuousCalibration | null>(null);
  const calibrationRef = useRef<ContinuousCalibration | null>(null);
  const detectorRef = useRef<ContinuousEmgDetector | null>(null);
  const [detectorSnapshot, setDetectorSnapshot] = useState<DetectorSnapshot>(emptySnapshot);
  const [decoder, setDecoder] = useState<DecoderState>(() => createDecoderState());
  const [paceMode, setPaceMode] = useState<PaceMode>('slow');
  const [customCharacterGapMs, setCustomCharacterGapMs] = useState(7_000);
  const [customWordGapMs, setCustomWordGapMs] = useState(18_000);
  const [now, setNow] = useState(Date.now());
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [rawSamples, setRawSamples] = useState<number[]>([]);
  const [envelopeSamples, setEnvelopeSamples] = useState<number[]>([]);
  const rawBufferRef = useRef<number[]>([]);
  const envelopeBufferRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const lastTimestampRef = useRef(0);

  const setPhase = useCallback((next: SessionPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const decoderConfig = useMemo<DecoderConfig | null>(() => {
    if (!calibration) return null;
    const pace = paceMode === 'custom'
      ? { characterGapMs: customCharacterGapMs, wordGapMs: customWordGapMs }
      : PACE_PRESETS[paceMode];
    return {
      durationBoundaryMs: calibration.durationBoundaryMs,
      uncertaintyMarginMs: calibration.uncertaintyMarginMs,
      characterGapMs: pace.characterGapMs,
      wordGapMs: Math.max(pace.wordGapMs, pace.characterGapMs + 1_000),
    };
  }, [calibration, customCharacterGapMs, customWordGapMs, paceMode]);
  const decoderConfigRef = useRef<DecoderConfig | null>(null);

  useEffect(() => {
    decoderConfigRef.current = decoderConfig;
  }, [decoderConfig]);

  const addTimeline = useCallback((entry: TimelineEntry) => {
    setTimeline((current) => [entry, ...current].slice(0, 80));
  }, []);

  const createCalibrationDetector = useCallback((baseline: ContinuousBaselineStats) => {
    detectorRef.current = new ContinuousEmgDetector({
      baselineCenter: baseline.center,
      baselineNoise: baseline.noise,
      startupGuardMs: 500,
      minPulseMs: 70,
      maxPulseMs: 3_000,
    });
  }, []);

  const startBaseline = useCallback(() => {
    baselineSamplesRef.current = [];
    baselineStatsRef.current = null;
    shortDurationsRef.current = [];
    longDurationsRef.current = [];
    setShortDurations([]);
    setLongDurations([]);
    setCalibration(null);
    calibrationRef.current = null;
    detectorRef.current = null;
    setDecoder(resetDecoder());
    setTimeline([]);
    setBaselineProgress(0);
    setDetectorSnapshot(emptySnapshot);
    setPhase('baseline');
    addTimeline({ at: Date.now(), kind: 'system', message: '开始采集 3 秒静息基线' });
  }, [addTimeline, setPhase]);

  const startLongCalibration = useCallback(() => {
    detectorRef.current?.reset();
    setPhase('longCalibration');
    addTimeline({ at: Date.now(), kind: 'system', message: '短咬完成，请进行至少 3 次长咬' });
  }, [addTimeline, setPhase]);

  const finishCalibration = useCallback(() => {
    const result = buildContinuousCalibration({
      baselineSamples: baselineSamplesRef.current,
      shortDurationsMs: shortDurationsRef.current,
      longDurationsMs: longDurationsRef.current,
    });
    if (!result.ok) {
      addTimeline({ at: Date.now(), kind: 'blocked', message: result.reason });
      return;
    }
    calibrationRef.current = result.calibration;
    setCalibration(result.calibration);
    detectorRef.current = new ContinuousEmgDetector(result.calibration.detectorConfig);
    setDecoder(resetDecoder());
    setPhase('ready');
    addTimeline({ at: Date.now(), kind: 'system', message: '校准完成，可以开始连续输入' });
  }, [addTimeline, setPhase]);

  const startDecoding = useCallback(() => {
    if (!calibrationRef.current) return;
    detectorRef.current = new ContinuousEmgDetector(calibrationRef.current.detectorConfig);
    setPhase('decoding');
    addTimeline({ at: Date.now(), kind: 'system', message: '开始连续解码' });
  }, [addTimeline, setPhase]);

  useEffect(() => {
    const busy = phase === 'baseline' || phase === 'shortCalibration' || phase === 'longCalibration' || phase === 'decoding';
    setEmgRuntimeBusy('ContinuousCodeMode', busy);
    return () => setEmgRuntimeBusy('ContinuousCodeMode', false);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'decoding' || !decoderConfig) return;
    const timer = window.setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      setDecoder((current) => tickDecoder(current, timestamp, decoderConfig));
    }, 100);
    return () => window.clearInterval(timer);
  }, [decoderConfig, phase]);

  useEffect(() => {
    if (!serial.isConnected && phaseRef.current !== 'idle') {
      detectorRef.current?.reset();
      detectorRef.current = null;
      calibrationRef.current = null;
      baselineStatsRef.current = null;
      setCalibration(null);
      setDecoder(resetDecoder());
      setPhase('idle');
      addTimeline({ at: Date.now(), kind: 'blocked', message: '硬件已断开，请重新连接并校准' });
    }
  }, [addTimeline, serial.isConnected, setPhase]);

  useEffect(() => serial.onDataReceived((data) => {
    const sampleInterval = 1_000 / HARDWARE_CONFIG.SAMPLE_RATE;
    const timestamp = Math.max(data.timestamp, lastTimestampRef.current + sampleInterval);
    lastTimestampRef.current = timestamp;
    const sample = data.channel2;
    const currentPhase = phaseRef.current;

    if (currentPhase === 'baseline') {
      baselineSamplesRef.current.push(sample);
      const count = baselineSamplesRef.current.length;
      if (count % 25 === 0) setBaselineProgress(Math.min(100, count / BASELINE_SAMPLE_COUNT * 100));
      if (count >= BASELINE_SAMPLE_COUNT) {
        const baseline = estimateContinuousBaseline(baselineSamplesRef.current);
        baselineStatsRef.current = baseline;
        createCalibrationDetector(baseline);
        setBaselineProgress(100);
        setPhase('shortCalibration');
        addTimeline({ at: timestamp, kind: 'system', message: '静息基线完成，请进行至少 3 次短咬' });
      }
    }

    const detector = detectorRef.current;
    let snapshot = detector?.getSnapshot() ?? emptySnapshot;
    if (
      detector &&
      (currentPhase === 'shortCalibration' || currentPhase === 'longCalibration' || currentPhase === 'decoding')
    ) {
      const events = detector.push(sample, timestamp);
      snapshot = detector.getSnapshot();
      for (const event of events) {
        if (event.type === 'blocked') {
          addTimeline({
            at: event.at,
            kind: 'blocked',
            message: blockedReasonNames[event.reason] ?? event.reason,
          });
          continue;
        }
        if (currentPhase === 'shortCalibration') {
          shortDurationsRef.current = [...shortDurationsRef.current, event.durationMs].slice(0, 5);
          setShortDurations(shortDurationsRef.current);
          addTimeline({ at: event.endedAt, kind: 'pulse', durationMs: event.durationMs, message: '记录短咬' });
        } else if (currentPhase === 'longCalibration') {
          longDurationsRef.current = [...longDurationsRef.current, event.durationMs].slice(0, 5);
          setLongDurations(longDurationsRef.current);
          addTimeline({ at: event.endedAt, kind: 'pulse', durationMs: event.durationMs, message: '记录长咬' });
        } else if (currentPhase === 'decoding') {
          const config = decoderConfigRef.current;
          if (config) {
            setDecoder((current) => appendPulse(current, event, config));
            addTimeline({ at: event.endedAt, kind: 'pulse', durationMs: event.durationMs, message: '识别动作脉冲' });
          }
        }
      }
    }

    rawBufferRef.current.push(sample - (baselineStatsRef.current?.center ?? 0));
    envelopeBufferRef.current.push(snapshot.envelope);
    if (rawBufferRef.current.length > DISPLAY_SAMPLE_COUNT) rawBufferRef.current.shift();
    if (envelopeBufferRef.current.length > DISPLAY_SAMPLE_COUNT) envelopeBufferRef.current.shift();
    frameCountRef.current += 1;
    if (frameCountRef.current % 10 === 0) {
      setRawSamples([...rawBufferRef.current]);
      setEnvelopeSamples([...envelopeBufferRef.current]);
      setDetectorSnapshot(snapshot);
    }
  }), [addTimeline, createCalibrationDetector, serial, setPhase]);

  const connectHardware = async () => {
    try {
      const port = await serial.requestPort();
      await serial.connect(port, HARDWARE_CONFIG.BAUD_RATE);
    } catch (error) {
      addTimeline({ at: Date.now(), kind: 'blocked', message: `连接失败：${error instanceof Error ? error.message : '未知错误'}` });
    }
  };

  const exportSession = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sampleRate: HARDWARE_CONFIG.SAMPLE_RATE,
      sourceChannel: 'CH2',
      phase,
      paceMode,
      decoderConfig,
      calibration,
      decoder,
      timeline: [...timeline].reverse(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `continuous-emg-code-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const countdown = decoderConfig ? getCharacterCountdownMs(decoder, now, decoderConfig) : null;
  const calibrationReady = Boolean(calibration);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: '#111314' }}>
        <Container className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="label mb-2">CONTINUOUS EMG CODE</div>
              <h1 className="text-3xl font-bold">连续肌电编码</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate('/')}><ArrowLeft size={16} className="inline mr-2" />返回</Button>
              <Button onClick={exportSession}><Download size={16} className="inline mr-2" />导出本次会话</Button>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <Section className="py-10">
          <SectionLabel number="01">LIVE SESSION</SectionLabel>
          <SectionTitle subtitle="独立使用 CH2，不读取也不修改原有指令库、训练样本或识别历史。">
            长咬、短咬与停顿输入
          </SectionTitle>

          <div className="grid gap-6 lg:grid-cols-3 mb-6">
            <Card>
              <div className="label mb-3">硬件</div>
              <div className={serial.isConnected ? 'text-success text-xl' : 'text-error text-xl'}>
                {serial.isConnected ? '已连接 · CH2' : '未连接'}
              </div>
              {!serial.isConnected && <div className="mt-5"><Button variant="primary" onClick={connectHardware}>连接硬件</Button></div>}
            </Card>
            <Card>
              <div className="label mb-3">当前阶段</div>
              <div className="text-xl text-accent">{phaseNames[phase]}</div>
              {phase === 'baseline' && <div className="mt-3 text-secondary">{Math.round(baselineProgress)}%</div>}
            </Card>
            <Card>
              <div className="label mb-3">动作阈值</div>
              <div className="text-xl">{Math.round(detectorSnapshot.envelope)} / {Math.round(detectorSnapshot.startThreshold)}</div>
              <div className="text-secondary text-sm mt-2">包络 / 触发阈值</div>
            </Card>
          </div>

          <Card className="mb-6">
            <ContinuousEmgWaveform
              rawSamples={rawSamples}
              envelopeSamples={envelopeSamples}
              startThreshold={detectorSnapshot.startThreshold}
              endThreshold={detectorSnapshot.endThreshold}
              isActive={detectorSnapshot.isActive}
            />
          </Card>

          <Card className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="label mb-2">会话校准</div>
                <div className="text-secondary">静息 3 秒，随后各完成至少 3 次短咬和长咬。</div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" disabled={!serial.isConnected || phase === 'baseline'} onClick={startBaseline}>
                  <RotateCcw size={16} className="inline mr-2" />重新校准
                </Button>
                {phase === 'shortCalibration' && (
                  <Button variant="success" disabled={shortDurations.length < CALIBRATION_TARGET} onClick={startLongCalibration}>
                    短咬完成 ({shortDurations.length})
                  </Button>
                )}
                {phase === 'longCalibration' && (
                  <Button variant="success" disabled={longDurations.length < CALIBRATION_TARGET} onClick={finishCalibration}>
                    完成长咬校准 ({longDurations.length})
                  </Button>
                )}
              </div>
            </div>
            {calibration && (
              <div className="grid grid-cols-3 gap-4 mt-6 max-md:grid-cols-1">
                <div><span className="text-secondary">短咬中位数</span><div>{Math.round(calibration.shortMedianMs)} ms</div></div>
                <div><span className="text-secondary">长咬中位数</span><div>{Math.round(calibration.longMedianMs)} ms</div></div>
                <div><span className="text-secondary">分类边界</span><div>{Math.round(calibration.durationBoundaryMs)} ms</div></div>
              </div>
            )}
          </Card>

          <div className="grid gap-8 xl:grid-cols-2">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <div className="label mb-2">解码输出</div>
                  <div className="text-secondary text-sm">短咬为点，长咬为划；字符确认后可无限等待。</div>
                </div>
                <div className="flex gap-2">
                  {phase !== 'decoding' ? (
                    <Button variant="success" disabled={!calibrationReady} onClick={startDecoding}>
                      <Play size={16} className="inline mr-2" />开始
                    </Button>
                  ) : (
                    <Button onClick={() => setPhase('paused')}><Pause size={16} className="inline mr-2" />暂停</Button>
                  )}
                  <Button disabled={phase !== 'paused'} onClick={startDecoding}><Play size={16} className="inline mr-2" />继续</Button>
                </div>
              </div>

              <div className="border p-6 mb-4 min-h-32" style={{ borderColor: 'var(--color-border)', backgroundColor: '#090b0c' }}>
                <div className="text-3xl break-words" style={{ letterSpacing: 0 }}>{decoder.text || '等待输入'}</div>
                <div className="text-accent text-2xl mt-4 font-mono">{decoder.pendingCode || '· · ·'}</div>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <Button disabled={!decoder.pendingCode} onClick={() => setDecoder((current) => confirmPending(current, Date.now()))}>
                  <Check size={16} className="inline mr-2" />立即确认字符
                </Button>
                <Button onClick={() => setDecoder(undoDecoder)}><Undo2 size={16} className="inline mr-2" />撤销</Button>
                <Button variant="error" onClick={() => setDecoder(resetDecoder())}>清空输出</Button>
                <span className="text-secondary text-sm">
                  {countdown === null ? '字符间可自由等待' : `${(countdown / 1000).toFixed(1)} 秒后确认当前字符`}
                </span>
              </div>
              {decoder.status === 'uncertain' && <p className="text-error mt-4">本次动作时长处于点划模糊区，已忽略，请重新输入。</p>}
              {decoder.status === 'invalid' && <p className="text-error mt-4">当前点划组合不是有效前缀，请撤销后重试。</p>}
            </Card>

            <Card>
              <div className="label mb-4">输入节奏</div>
              <div className="flex flex-wrap gap-2 mb-5">
                {(['standard', 'slow', 'custom'] as PaceMode[]).map((mode) => (
                  <Button key={mode} variant={paceMode === mode ? 'primary' : 'secondary'} onClick={() => setPaceMode(mode)}>
                    {mode === 'standard' ? '标准' : mode === 'slow' ? '慢速（默认）' : '自定义'}
                  </Button>
                ))}
              </div>
              {paceMode === 'custom' && (
                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                  <label className="text-secondary">字符等待（秒）
                    <input className="input mt-2" type="number" min={2} max={30} value={customCharacterGapMs / 1000}
                      onChange={(event) => setCustomCharacterGapMs(Math.max(2_000, Number(event.target.value) * 1000))} />
                  </label>
                  <label className="text-secondary">单词停顿（秒）
                    <input className="input mt-2" type="number" min={3} max={60} value={customWordGapMs / 1000}
                      onChange={(event) => setCustomWordGapMs(Math.max(3_000, Number(event.target.value) * 1000))} />
                  </label>
                </div>
              )}
              <Divider className="my-6" />
              <div className="label mb-3">最近事件</div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {timeline.length === 0 && <div className="text-secondary">暂无事件</div>}
                {timeline.slice(0, 12).map((entry, index) => (
                  <div key={`${entry.at}-${index}`} className="flex justify-between gap-4 text-sm border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
                    <span className={entry.kind === 'blocked' ? 'text-error' : entry.kind === 'pulse' ? 'text-success' : 'text-secondary'}>{entry.message}</span>
                    <span>{entry.durationMs ? `${Math.round(entry.durationMs)} ms` : new Date(entry.at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </Section>

        <Section className="pt-0">
          <SectionLabel number="02">REFERENCE</SectionLabel>
          <SectionTitle subtitle="点和划采用国际通用摩斯编码。">摩斯电码对照表</SectionTitle>
          <div className="grid grid-cols-6 gap-3 max-lg:grid-cols-4 max-md:grid-cols-2">
            {MORSE_ENTRIES.map(({ character, code }) => (
              <Card key={character} className="p-4">
                <div className="text-accent text-xl font-bold">{character}</div>
                <div className="font-mono mt-2" style={{ letterSpacing: 0 }}>{code}</div>
              </Card>
            ))}
          </div>
        </Section>
      </Container>
    </div>
  );
}

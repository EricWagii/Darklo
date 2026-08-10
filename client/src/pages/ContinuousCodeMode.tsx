import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Download, Pause, Play, RotateCcw, Square } from 'lucide-react';
import {
  Button,
  Card,
  Container,
  Divider,
  Section,
  SectionLabel,
  SectionTitle,
} from '@/components/PremiumComponents';
import { ContinuousCodeStreamPanel } from '@/components/ContinuousCodeStreamPanel';
import { ContinuousSessionReview } from '@/components/ContinuousSessionReview';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import {
  appendPulse,
  createDecoderState,
  forceSplitDecoder,
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
import {
  appendContinuousSample,
  buildContinuousDiagnosticPackage,
  createContinuousSampleCapture,
  downloadDiagnosticJson,
} from '@/lib/emg-diagnostic-export';
import {
  buildContinuousSessionEvaluation,
  normalizeEvaluationText,
  upsertEventCorrection,
  type ContinuousEvaluationMode,
  type ContinuousEventCorrection,
  type ContinuousReviewVerdict,
  type ContinuousSessionEvaluation,
  type EventCorrectionLabel,
} from '@/lib/continuous-session-evaluation';
import type { StreamEvent } from '@/lib/continuous-stream-segmenter';
import { evaluateBaselineCapture } from '@/lib/baseline-capture-window';
import { createMonotonicSessionClock } from '@/lib/monotonic-session-clock';
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

const BASELINE_DURATION_MS = 3_000;
const BASELINE_MINIMUM_SAMPLES = 250;
const CALIBRATION_TARGET = 3;
const DISPLAY_SAMPLE_COUNT = 750;
const CONTINUOUS_CAPTURE_MAX_SAMPLES = HARDWARE_CONFIG.SAMPLE_RATE * 60 * 30;

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
  shortCalibration: '校准短时事件',
  longCalibration: '校准长时事件',
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
  const [baselineSampleCount, setBaselineSampleCount] = useState(0);
  const [baselineSampleRate, setBaselineSampleRate] = useState(0);
  const [baselineFailure, setBaselineFailure] = useState<string | null>(null);
  const baselineSamplesRef = useRef<number[]>([]);
  const baselineStartedAtRef = useRef(0);
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
  const [customCharacterBoundaryMs, setCustomCharacterBoundaryMs] = useState(1_200);
  const [customForceSplitMs, setCustomForceSplitMs] = useState(4_000);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [rawSamples, setRawSamples] = useState<number[]>([]);
  const [envelopeSamples, setEnvelopeSamples] = useState<number[]>([]);
  const rawBufferRef = useRef<number[]>([]);
  const envelopeBufferRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const sessionClockRef = useRef(createMonotonicSessionClock());
  const continuousCaptureRef = useRef(createContinuousSampleCapture(CONTINUOUS_CAPTURE_MAX_SAMPLES));
  const [captureSampleCount, setCaptureSampleCount] = useState(0);
  const [evaluationMode, setEvaluationMode] = useState<ContinuousEvaluationMode>('scripted');
  const [targetText, setTargetText] = useState('');
  const [actualText, setActualText] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sessionEvaluation, setSessionEvaluation] = useState<ContinuousSessionEvaluation | null>(null);
  const [eventCorrections, setEventCorrections] = useState<ContinuousEventCorrection[]>([]);

  const setPhase = useCallback((next: SessionPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const decoderConfig = useMemo<DecoderConfig | null>(() => {
    if (!calibration) return null;
    const pace = paceMode === 'custom'
      ? {
          characterBoundaryMs: customCharacterBoundaryMs,
          forceSplitMs: Math.max(customForceSplitMs, customCharacterBoundaryMs * 1.8),
        }
      : PACE_PRESETS[paceMode];
    return {
      durationBoundaryMs: calibration.durationBoundaryMs,
      uncertaintyMarginMs: calibration.uncertaintyMarginMs,
      characterBoundaryMs: pace.characterBoundaryMs,
      forceSplitMs: pace.forceSplitMs,
      boundaryUncertaintyMs: Math.min(160, Math.max(70, pace.characterBoundaryMs * 0.15)),
      maxCandidates: 16,
      maxPendingSymbols: 24,
    };
  }, [calibration, customCharacterBoundaryMs, customForceSplitMs, paceMode]);
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
    sessionClockRef.current.reset();
    continuousCaptureRef.current = createContinuousSampleCapture(CONTINUOUS_CAPTURE_MAX_SAMPLES);
    setCaptureSampleCount(0);
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
    setActualText('');
    setReviewOpen(false);
    setSessionEvaluation(null);
    setEventCorrections([]);
    setBaselineProgress(0);
    setBaselineSampleCount(0);
    setBaselineSampleRate(0);
    setBaselineFailure(null);
    setDetectorSnapshot(emptySnapshot);
    baselineStartedAtRef.current = sessionClockRef.current.now();
    setPhase('baseline');
    addTimeline({ at: sessionClockRef.current.now(), kind: 'system', message: '开始采集 3 秒静息基线' });
  }, [addTimeline, setPhase]);

  const startLongCalibration = useCallback(() => {
    detectorRef.current?.reset();
    setPhase('longCalibration');
    addTimeline({ at: sessionClockRef.current.now(), kind: 'system', message: '短时事件完成，请进行至少 3 次长时肌电事件' });
  }, [addTimeline, setPhase]);

  const finishCalibration = useCallback(() => {
    const result = buildContinuousCalibration({
      baselineSamples: baselineSamplesRef.current,
      shortDurationsMs: shortDurationsRef.current,
      longDurationsMs: longDurationsRef.current,
    });
    if (!result.ok) {
      addTimeline({ at: sessionClockRef.current.now(), kind: 'blocked', message: result.reason });
      return;
    }
    calibrationRef.current = result.calibration;
    setCalibration(result.calibration);
    detectorRef.current = new ContinuousEmgDetector(result.calibration.detectorConfig);
    setDecoder(resetDecoder());
    setPhase('ready');
    addTimeline({ at: sessionClockRef.current.now(), kind: 'system', message: '校准完成，可以开始连续输入' });
  }, [addTimeline, setPhase]);

  const startDecoding = useCallback(() => {
    if (!calibrationRef.current) return;
    if (evaluationMode === 'scripted' && !targetText) return;
    if (phaseRef.current === 'ready') {
      setDecoder(resetDecoder());
      setActualText('');
      setReviewOpen(false);
      setSessionEvaluation(null);
      setEventCorrections([]);
    }
    detectorRef.current = new ContinuousEmgDetector(calibrationRef.current.detectorConfig);
    setPhase('decoding');
    addTimeline({ at: sessionClockRef.current.now(), kind: 'system', message: '开始连续解码' });
  }, [addTimeline, evaluationMode, setPhase, targetText]);

  useEffect(() => {
    const busy = phase === 'baseline' || phase === 'shortCalibration' || phase === 'longCalibration' || phase === 'decoding';
    setEmgRuntimeBusy('ContinuousCodeMode', busy);
    return () => setEmgRuntimeBusy('ContinuousCodeMode', false);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'decoding' || !decoderConfig) return;
    const timer = window.setInterval(() => {
      if (detectorRef.current?.getSnapshot().isActive) return;
      const timestamp = sessionClockRef.current.now();
      setDecoder((current) => tickDecoder(current, timestamp, decoderConfig));
    }, 100);
    return () => window.clearInterval(timer);
  }, [decoderConfig, phase]);

  useEffect(() => {
    if (phase !== 'baseline') return;

    const updateBaselineWindow = () => {
      if (phaseRef.current !== 'baseline') return;
      const snapshot = evaluateBaselineCapture({
        startedAt: baselineStartedAtRef.current,
        now: sessionClockRef.current.now(),
        durationMs: BASELINE_DURATION_MS,
        sampleCount: baselineSamplesRef.current.length,
        minimumSamples: BASELINE_MINIMUM_SAMPLES,
      });
      setBaselineProgress(snapshot.progress);
      setBaselineSampleCount(snapshot.sampleCount);
      setBaselineSampleRate(snapshot.measuredSampleRate);

      if (snapshot.status === 'collecting') return;
      if (snapshot.status === 'complete') {
        const baseline = estimateContinuousBaseline(baselineSamplesRef.current);
        baselineStatsRef.current = baseline;
        createCalibrationDetector(baseline);
        setPhase('shortCalibration');
        addTimeline({
          at: sessionClockRef.current.now(),
          kind: 'system',
          message: `静息基线完成：${snapshot.sampleCount} 个样本，约 ${Math.round(snapshot.measuredSampleRate)} Hz。请进行至少 3 次短时肌电事件`,
        });
        return;
      }

      const message = snapshot.status === 'no-data'
        ? '静息采集未收到任何有效串口帧。请确认串口数据仍在持续发送后重试。'
        : `静息采集仅收到 ${snapshot.sampleCount} 个样本（约 ${Math.round(snapshot.measuredSampleRate)} Hz），至少需要 ${BASELINE_MINIMUM_SAMPLES} 个。`;
      setBaselineFailure(message);
      setPhase('idle');
      addTimeline({ at: sessionClockRef.current.now(), kind: 'blocked', message });
    };

    updateBaselineWindow();
    const timer = window.setInterval(updateBaselineWindow, 100);
    return () => window.clearInterval(timer);
  }, [addTimeline, createCalibrationDetector, phase, setPhase]);

  useEffect(() => {
    if (!serial.isConnected && phaseRef.current !== 'idle') {
      detectorRef.current?.reset();
      detectorRef.current = null;
      calibrationRef.current = null;
      baselineStatsRef.current = null;
      setCalibration(null);
      setDecoder(resetDecoder());
      setPhase('idle');
      addTimeline({ at: sessionClockRef.current.now(), kind: 'blocked', message: '硬件已断开，请重新连接并校准' });
    }
  }, [addTimeline, serial.isConnected, setPhase]);

  useEffect(() => serial.onDataReceived((data) => {
    const timestamp = sessionClockRef.current.now();
    const sample = data.channel2;
    const currentPhase = phaseRef.current;

    if (currentPhase === 'baseline') {
      baselineSamplesRef.current.push(sample);
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
          addTimeline({ at: event.endedAt, kind: 'pulse', durationMs: event.durationMs, message: '记录短时事件' });
        } else if (currentPhase === 'longCalibration') {
          longDurationsRef.current = [...longDurationsRef.current, event.durationMs].slice(0, 5);
          setLongDurations(longDurationsRef.current);
          addTimeline({ at: event.endedAt, kind: 'pulse', durationMs: event.durationMs, message: '记录长时事件' });
        } else if (currentPhase === 'decoding') {
          const config = decoderConfigRef.current;
          if (config) {
            setDecoder((current) => appendPulse(current, event, config));
            addTimeline({ at: event.endedAt, kind: 'pulse', durationMs: event.durationMs, message: '识别动作脉冲' });
          }
        }
      }
    }

    if (currentPhase !== 'idle') {
      continuousCaptureRef.current = appendContinuousSample(continuousCaptureRef.current, {
        timestamp,
        ch1: data.channel1,
        ch2: data.channel2,
        ch3: data.channel3,
        envelope: snapshot.envelope,
        startThreshold: snapshot.startThreshold,
        endThreshold: snapshot.endThreshold,
        isActive: snapshot.isActive,
        isBlocked: snapshot.isBlocked,
        phase: currentPhase,
      });
      if (frameCountRef.current % 25 === 0) {
        setCaptureSampleCount(continuousCaptureRef.current.columns.timestamps.length);
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
      addTimeline({ at: sessionClockRef.current.now(), kind: 'blocked', message: `连接失败：${error instanceof Error ? error.message : '未知错误'}` });
    }
  };

  const finishSession = () => {
    const now = sessionClockRef.current.now();
    const finalizedDecoder = decoderConfig
      ? forceSplitDecoder(decoder, now, decoderConfig)
      : decoder;
    setDecoder(finalizedDecoder);
    setPhase('paused');
    setActualText(evaluationMode === 'scripted' ? targetText : finalizedDecoder.committedText);
    setReviewOpen(true);
    addTimeline({ at: now, kind: 'system', message: '会话结束，等待真实标签复核' });
  };

  const submitEvaluation = (verdict: ContinuousReviewVerdict) => {
    const predictedText = decoder.committedText;
    const resolvedActualText = verdict === 'correct'
      ? evaluationMode === 'scripted' ? targetText : predictedText
      : actualText;
    const evaluation = buildContinuousSessionEvaluation({
      mode: evaluationMode,
      targetText,
      predictedText,
      actualText: resolvedActualText,
      verdict,
      eventCorrections,
    });
    setActualText(evaluation.actualText);
    setSessionEvaluation(evaluation);
    setReviewOpen(false);
    addTimeline({
      at: evaluation.submittedAt,
      kind: verdict === 'rejected' ? 'blocked' : 'system',
      message: verdict === 'correct' ? '真实标签确认：识别正确' : verdict === 'corrected' ? '真实标签确认：已提交修正' : '本次会话已标记无效',
    });
  };

  const correctEvent = (event: StreamEvent, label: EventCorrectionLabel | null) => {
    setEventCorrections((current) => {
      const next = label
        ? upsertEventCorrection(current, {
            eventId: event.id,
            originalKind: event.kind,
            correctedLabel: label,
            correctedAt: Date.now(),
          })
        : current.filter((correction) => correction.eventId !== event.id);
      setSessionEvaluation((evaluation) => evaluation ? { ...evaluation, eventCorrections: next } : evaluation);
      return next;
    });
  };

  const exportSession = () => {
    if (continuousCaptureRef.current.columns.timestamps.length === 0) return;
    const payload = buildContinuousDiagnosticPackage({
      capture: continuousCaptureRef.current,
      sampleRate: HARDWARE_CONFIG.SAMPLE_RATE,
      sourceChannel: 'CH2',
      phase,
      paceMode,
      evaluationProtocol: { mode: evaluationMode, targetText },
      decoderConfig,
      calibration,
      baselineSamples: baselineSamplesRef.current,
      baselineStats: baselineStatsRef.current,
      shortDurationsMs: shortDurationsRef.current,
      longDurationsMs: longDurationsRef.current,
      decoder,
      timeline: [...timeline].reverse(),
      evaluation: sessionEvaluation,
    });
    downloadDiagnosticJson(payload, 'continuous-neuromuscular-decoder-complete-diagnostic');
  };

  const targetTextRequired = evaluationMode === 'scripted' && !targetText;
  const streamStandbyLabel = ({
    idle: 'CALIBRATE',
    baseline: 'BASELINE',
    shortCalibration: 'SHORT CAL',
    longCalibration: 'LONG CAL',
    ready: 'READY',
    decoding: '',
    paused: 'PAUSED',
  } satisfies Record<SessionPhase, string>)[phase];
  const sessionActionHint = !serial.isConnected
    ? '请先连接硬件，再完成个体化校准。'
    : phase === 'idle'
      ? baselineFailure ?? '首次使用需先完成静息、短时和长时事件校准。'
      : phase === 'baseline'
        ? `请保持放松，正在采集 3 秒静息基线（${Math.round(baselineProgress)}%，${baselineSampleCount} 个样本，约 ${Math.round(baselineSampleRate)} Hz）。`
        : phase === 'shortCalibration'
          ? `请完成至少 ${CALIBRATION_TARGET} 次短时肌电事件，当前 ${shortDurations.length} 次。`
          : phase === 'longCalibration'
            ? `请完成至少 ${CALIBRATION_TARGET} 次长时肌电事件，当前 ${longDurations.length} 次。`
            : phase === 'ready' && targetTextRequired
              ? '请先输入目标文本。'
              : phase === 'ready'
                ? '校准完成，可以开始解码。'
                : phase === 'decoding'
                  ? '正在持续解码。'
                  : reviewOpen
                    ? '会话已结束，请完成真实标签复核。'
                    : sessionEvaluation
                      ? '本次会话已完成并保存复核结果。'
                      : '会话已暂停。';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: '#111314' }}>
        <Container className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="label mb-2">CONTINUOUS EMG CODE</div>
              <h1 className="text-3xl font-bold">连续神经肌电时序解码</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate('/')}><ArrowLeft size={16} className="inline mr-2" />返回</Button>
              <span title={captureSampleCount > 0 ? '导出三通道原始 ADC、包络、动态阈值、校准参数、解码状态和事件日志' : '开始校准并采集数据后可导出'}>
                <Button onClick={exportSession} disabled={captureSampleCount === 0}>
                  <Download size={16} className="inline mr-2" />导出完整诊断包
                </Button>
              </span>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <Section className="py-10">
          <SectionLabel number="01">LIVE SESSION</SectionLabel>
          <SectionTitle subtitle="基于个体化生物电校准，实现实时事件分割、时序编码与流式字符输出。">
            自适应生物电事件解析
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
              {phase === 'baseline' && (
                <div className="mt-3 text-secondary">
                  {Math.round(baselineProgress)}% · {baselineSampleCount} 样本 · {Math.round(baselineSampleRate)} Hz
                </div>
              )}
              {phase === 'idle' && baselineFailure && (
                <div className="mt-3 text-error text-sm" role="alert">{baselineFailure}</div>
              )}
            </Card>
            <Card>
              <div className="label mb-3">动作阈值</div>
              <div className="text-xl">{Math.round(detectorSnapshot.envelope)} / {Math.round(detectorSnapshot.startThreshold)}</div>
              <div className="text-secondary text-sm mt-2">包络 / 触发阈值</div>
            </Card>
          </div>

          <Card className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="label mb-2">会话校准</div>
                <div className="text-secondary">静息 3 秒，随后各完成至少 3 次短时和长时肌电事件。</div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" disabled={!serial.isConnected || phase === 'baseline'} onClick={startBaseline}>
                  <RotateCcw size={16} className="inline mr-2" />{phase === 'idle' ? '开始校准' : '重新校准'}
                </Button>
                {phase === 'shortCalibration' && (
                  <Button variant="success" disabled={shortDurations.length < CALIBRATION_TARGET} onClick={startLongCalibration}>
                    短时事件完成 ({shortDurations.length})
                  </Button>
                )}
                {phase === 'longCalibration' && (
                  <Button variant="success" disabled={longDurations.length < CALIBRATION_TARGET} onClick={finishCalibration}>
                    完成长时事件校准 ({longDurations.length})
                  </Button>
                )}
              </div>
            </div>
            {calibration && (
              <div className="grid grid-cols-3 gap-4 mt-6 max-md:grid-cols-1">
                <div><span className="text-secondary">短时事件中位数</span><div>{Math.round(calibration.shortMedianMs)} ms</div></div>
                <div><span className="text-secondary">长时事件中位数</span><div>{Math.round(calibration.longMedianMs)} ms</div></div>
                <div><span className="text-secondary">分类边界</span><div>{Math.round(calibration.durationBoundaryMs)} ms</div></div>
              </div>
            )}
          </Card>

          <Card className="mb-8">
            <ContinuousSessionReview
              mode={evaluationMode}
              targetText={targetText}
              predictedText={decoder.committedText}
              actualText={actualText}
              reviewOpen={reviewOpen}
              locked={phase === 'decoding'}
              evaluation={sessionEvaluation}
              events={decoder.events}
              eventCorrections={eventCorrections}
              onModeChange={setEvaluationMode}
              onTargetTextChange={(value) => setTargetText(normalizeEvaluationText(value))}
              onActualTextChange={setActualText}
              onSubmit={submitEvaluation}
              onEventCorrection={correctEvent}
            />
          </Card>

          <Card className="mb-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="label mb-2">流式解码</div>
                <div className="text-secondary text-sm">自适应解析生物电事件持续特征与时序边界，连续生成编码序列。</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap justify-end gap-2">
                  {phase === 'idle' && (
                    <Button variant="primary" disabled={!serial.isConnected} onClick={startBaseline}>
                      <RotateCcw size={16} className="inline mr-2" />开始校准
                    </Button>
                  )}
                  {phase === 'baseline' && <Button disabled>正在采集静息基线</Button>}
                  {phase === 'shortCalibration' && <Button disabled>短时事件校准中</Button>}
                  {phase === 'longCalibration' && <Button disabled>长时事件校准中</Button>}
                  {phase === 'ready' && (
                    <Button variant="success" disabled={targetTextRequired} onClick={startDecoding}>
                      <Play size={16} className="inline mr-2" />开始解码
                    </Button>
                  )}
                  {phase === 'decoding' && (
                    <Button onClick={() => setPhase('paused')}><Pause size={16} className="inline mr-2" />暂停</Button>
                  )}
                  {phase === 'paused' && !reviewOpen && !sessionEvaluation && (
                    <Button variant="success" onClick={startDecoding}><Play size={16} className="inline mr-2" />继续</Button>
                  )}
                  {(phase === 'decoding' || phase === 'paused') && !reviewOpen && !sessionEvaluation && (
                    <Button variant="primary" onClick={finishSession}>
                      <Square size={15} className="inline mr-2" />结束并复核
                    </Button>
                  )}
                  {reviewOpen && <Button disabled>等待复核</Button>}
                  {sessionEvaluation && <Button disabled>本次已完成</Button>}
                </div>
                <div className="max-w-xl text-right text-xs text-secondary" role="status">{sessionActionHint}</div>
              </div>
            </div>
            <ContinuousCodeStreamPanel
              decodedText={decoder.committedText}
              pendingSymbols={decoder.pendingSymbols}
              events={decoder.events}
              status={decoder.status}
              standbyLabel={streamStandbyLabel}
              waveform={{
                rawSamples,
                envelopeSamples,
                startThreshold: detectorSnapshot.startThreshold,
                endThreshold: detectorSnapshot.endThreshold,
                isActive: detectorSnapshot.isActive,
              }}
              onForceSplit={() => decoderConfig && setDecoder((current) => forceSplitDecoder(current, Date.now(), decoderConfig))}
              onUndo={() => setDecoder(undoDecoder)}
              onClear={() => {
                setDecoder(resetDecoder());
                setActualText('');
                setReviewOpen(false);
                setSessionEvaluation(null);
                setEventCorrections([]);
              }}
            />
            {decoder.status === 'uncertain' && <p className="mt-4 text-amber-300">当前尾段存在时序或动作歧义，系统不会猜测；可继续输入、撤销或使用长静息收口。</p>}
            {decoder.status === 'discarded' && <p className="mt-4 text-orange-500">未决尾段无法可靠解码，已舍弃；此前确认文本保持不变。</p>}
          </Card>

          <div className="grid gap-8 xl:grid-cols-2">
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
                  <label className="text-secondary">普通字符边界（秒）
                    <input className="input mt-2" type="number" min={0.3} max={2.5} step={0.1} value={customCharacterBoundaryMs / 1000}
                      onChange={(event) => setCustomCharacterBoundaryMs(Math.min(2_500, Math.max(300, Number(event.target.value) * 1000)))} />
                  </label>
                  <label className="text-secondary">强制分隔静息（秒）
                    <input className="input mt-2" type="number" min={1.5} max={10} step={0.1} value={customForceSplitMs / 1000}
                      onChange={(event) => setCustomForceSplitMs(Math.min(10_000, Math.max(1_500, Number(event.target.value) * 1000)))} />
                  </label>
                </div>
              )}
              <p className="mt-4 text-sm text-secondary">强制分隔始终至少为普通字符边界的 1.8 倍；它不会回退已经确认的字符。</p>
            </Card>

            <Card>
              <div className="label mb-3">系统事件</div>
              <Divider className="my-6" />
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
          <div className="overflow-x-auto border" style={{ borderColor: 'var(--color-border)' }} data-role="compact-morse-reference">
            <table className="w-full min-w-[720px] table-fixed border-collapse font-mono" style={{ letterSpacing: 0 }}>
              <tbody>
                {Array.from({ length: Math.ceil(MORSE_ENTRIES.length / 6) }, (_, rowIndex) => (
                  <tr key={rowIndex} className="border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
                    {MORSE_ENTRIES.slice(rowIndex * 6, rowIndex * 6 + 6).map(({ character, code }) => (
                      <td key={character} className="px-4 py-2.5">
                        <span className="mr-3 font-bold text-accent">{character}</span>
                        <span className="text-sm text-secondary">{code}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Container>
    </div>
  );
}

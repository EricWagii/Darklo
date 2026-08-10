import type { ContinuousSessionEvaluation } from './continuous-session-evaluation';

export interface ThreeChannelWaveform {
  ch1: number[];
  ch2: number[];
  ch3: number[];
}

export interface RecognitionRawWaveform extends ThreeChannelWaveform {
  timestamps: number[];
}

export interface RecognitionDiagnosticTrial {
  trialId: string;
  startedAt: number;
  endedAt?: number;
  rawWaveform: RecognitionRawWaveform;
  processedWaveform?: ThreeChannelWaveform & { meta?: unknown };
  result?: Record<string, unknown>;
  feedback?: {
    actualCommand: string;
    isCorrect: boolean;
    submittedAt: number;
  };
  status?: 'capturing' | 'completed' | 'failed';
  failureReason?: string;
}

export interface ContinuousSampleColumns {
  timestamps: number[];
  ch1: number[];
  ch2: number[];
  ch3: number[];
  envelope: number[];
  startThreshold: number[];
  endThreshold: number[];
  isActive: number[];
  isBlocked: number[];
  phase: string[];
}

export interface ContinuousSampleCapture {
  maxSamples: number;
  totalSamplesObserved: number;
  captureTruncated: boolean;
  columns: ContinuousSampleColumns;
}

export interface ContinuousSampleInput {
  timestamp: number;
  ch1: number;
  ch2: number;
  ch3: number;
  envelope: number;
  startThreshold: number;
  endThreshold: number;
  isActive: boolean;
  isBlocked: boolean;
  phase: string;
}

const nowIso = () => new Date().toISOString();

const compactRecognitionResult = (
  result: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!result) return result;
  const { processedWaveform: _duplicatedWaveform, ...summary } = result;
  return summary;
};

export const createContinuousSessionId = (): string => {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `continuous-${randomId}`;
};

export const createContinuousSampleCapture = (maxSamples: number): ContinuousSampleCapture => ({
  maxSamples: Math.max(1, Math.floor(maxSamples)),
  totalSamplesObserved: 0,
  captureTruncated: false,
  columns: {
    timestamps: [],
    ch1: [],
    ch2: [],
    ch3: [],
    envelope: [],
    startThreshold: [],
    endThreshold: [],
    isActive: [],
    isBlocked: [],
    phase: [],
  },
});

export const appendContinuousSample = (
  capture: ContinuousSampleCapture,
  sample: ContinuousSampleInput
): ContinuousSampleCapture => {
  capture.totalSamplesObserved += 1;
  if (capture.columns.timestamps.length >= capture.maxSamples) {
    capture.captureTruncated = true;
    return capture;
  }

  capture.columns.timestamps.push(sample.timestamp);
  capture.columns.ch1.push(sample.ch1);
  capture.columns.ch2.push(sample.ch2);
  capture.columns.ch3.push(sample.ch3);
  capture.columns.envelope.push(sample.envelope);
  capture.columns.startThreshold.push(sample.startThreshold);
  capture.columns.endThreshold.push(sample.endThreshold);
  capture.columns.isActive.push(sample.isActive ? 1 : 0);
  capture.columns.isBlocked.push(sample.isBlocked ? 1 : 0);
  capture.columns.phase.push(sample.phase);
  return capture;
};

export const buildRecognitionDiagnosticPackage = (input: {
  trials: RecognitionDiagnosticTrial[];
  commands: any[];
  sampleRate: number;
  context?: Record<string, unknown>;
}) => {
  const trials = input.trials.map((trial) => ({
    ...trial,
    result: compactRecognitionResult(trial.result),
  }));

  return {
  exportFormat: 'darklo-emg-complete-diagnostic',
  version: '2.0',
  sourcePage: 'silent-recognition' as const,
  exportedAt: nowIso(),
  sampleRate: input.sampleRate,
  context: input.context ?? {},
  summary: {
    trialCount: trials.length,
    completedTrialCount: trials.filter((trial) => trial.status === 'completed').length,
    failedTrialCount: trials.filter((trial) => trial.status === 'failed').length,
    feedbackCount: trials.filter((trial) => Boolean(trial.feedback)).length,
  },
  trials,
  trainingCommands: input.commands,
  };
};

export const buildContinuousDiagnosticPackage = (input: {
  sessionId?: string;
  sessionStartedAt?: string;
  sessionEndedAt?: string | null;
  capture: ContinuousSampleCapture;
  sampleRate: number;
  sourceChannel: string;
  phase: string;
  paceMode: string;
  evaluationProtocol?: {
    mode: string;
    targetText: string;
  };
  decoderConfig: unknown;
  calibration: unknown;
  baselineSamples: number[];
  baselineStats: unknown;
  shortDurationsMs: number[];
  longDurationsMs: number[];
  rhythmCalibration?: {
    pattern: string;
    acceptedAttempts: number;
    targetAttempts: number;
    withinCharacterGapsMs: number[];
    withinCharacterGapsAfterDotMs: number[];
    withinCharacterGapsAfterDashMs: number[];
    betweenCharacterGapsMs: number[];
    warning: string | null;
  };
  decoder: unknown;
  tentativeText?: string;
  timeline: unknown[];
  evaluation?: ContinuousSessionEvaluation | null;
}) => {
  const decoder = input.decoder && typeof input.decoder === 'object'
    ? input.decoder as Record<string, unknown>
    : {};
  const candidates = Array.isArray(decoder.candidates) ? decoder.candidates : [];
  const events = Array.isArray(decoder.events)
    ? decoder.events.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  const firstMs = input.capture.columns.timestamps[0] ?? null;
  const lastMs = input.capture.columns.timestamps.at(-1) ?? null;
  const calibration = input.calibration && typeof input.calibration === 'object'
    ? input.calibration as Record<string, unknown>
    : {};

  return {
    exportFormat: 'darklo-emg-complete-diagnostic',
    version: '2.1',
    sourcePage: 'continuous-neuromuscular-decoder' as const,
    exportedAt: nowIso(),
    sampleRate: input.sampleRate,
    sourceChannel: input.sourceChannel,
    session: {
      sessionId: input.sessionId ?? createContinuousSessionId(),
      wallClock: {
        startedAt: input.sessionStartedAt ?? null,
        endedAt: input.sessionEndedAt ?? null,
      },
      phase: input.phase,
      paceMode: input.paceMode,
      evaluationProtocol: input.evaluationProtocol ?? null,
      decoderConfig: input.decoderConfig,
    },
    timing: {
      clockDomain: 'monotonic-session-ms' as const,
      sampleRange: {
        firstMs,
        lastMs,
        elapsedMs: firstMs === null || lastMs === null ? null : Math.max(0, lastMs - firstMs),
      },
      rhythmCalibration: input.rhythmCalibration ?? null,
      pauseTimingModel: calibration.pauseTimingModel ?? null,
    },
    calibration: {
      baselineSamples: input.baselineSamples,
      baselineStats: input.baselineStats,
      shortDurationsMs: input.shortDurationsMs,
      longDurationsMs: input.longDurationsMs,
      result: input.calibration,
    },
    adaptiveDecoding: {
      candidateScores: candidates,
      boundaryDecisions: events.filter((item) =>
        item.kind === 'candidate-boundary'
        || item.kind === 'confirmed-boundary'
        || item.kind === 'character-committed'
      ),
      pulseAlternatives: events.filter((item) => Array.isArray(item.alternatives)),
      tentativeOutput: input.tentativeText ?? '',
      finalStableOutput: typeof decoder.committedText === 'string' ? decoder.committedText : '',
    },
    decoder: input.decoder,
    timeline: input.timeline,
    evaluation: input.evaluation ?? null,
    sampleCapture: input.capture,
  };
};

export const downloadDiagnosticJson = (payload: unknown, filenamePrefix: string): void => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${timestamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

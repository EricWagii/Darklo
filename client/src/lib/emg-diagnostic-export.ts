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
}) => ({
  exportFormat: 'darklo-emg-complete-diagnostic',
  version: '2.0',
  sourcePage: 'silent-recognition' as const,
  exportedAt: nowIso(),
  sampleRate: input.sampleRate,
  context: input.context ?? {},
  summary: {
    trialCount: input.trials.length,
    completedTrialCount: input.trials.filter((trial) => trial.status === 'completed').length,
    failedTrialCount: input.trials.filter((trial) => trial.status === 'failed').length,
    feedbackCount: input.trials.filter((trial) => Boolean(trial.feedback)).length,
  },
  trials: input.trials,
  trainingCommands: input.commands,
});

export const buildContinuousDiagnosticPackage = (input: {
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
  decoder: unknown;
  timeline: unknown[];
  evaluation?: ContinuousSessionEvaluation | null;
}) => ({
  exportFormat: 'darklo-emg-complete-diagnostic',
  version: '2.0',
  sourcePage: 'continuous-neuromuscular-decoder' as const,
  exportedAt: nowIso(),
  sampleRate: input.sampleRate,
  sourceChannel: input.sourceChannel,
  session: {
    phase: input.phase,
    paceMode: input.paceMode,
    evaluationProtocol: input.evaluationProtocol ?? null,
    decoderConfig: input.decoderConfig,
  },
  calibration: {
    baselineSamples: input.baselineSamples,
    baselineStats: input.baselineStats,
    shortDurationsMs: input.shortDurationsMs,
    longDurationsMs: input.longDurationsMs,
    result: input.calibration,
  },
  decoder: input.decoder,
  timeline: input.timeline,
  evaluation: input.evaluation ?? null,
  sampleCapture: input.capture,
});

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

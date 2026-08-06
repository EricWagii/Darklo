export interface StartupArtifactMetadata {
  detected: boolean;
  ambiguous: boolean;
  suppressedSamples: number;
  artifactRatio: number;
  stabilizationIndex: number | null;
  reason: string;
}

export interface StartupArtifactSuppressionResult {
  cleaned: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  metadata: StartupArtifactMetadata;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
};

const movingMeanAbsolute = (signal: number[], windowSize: number): number[] => {
  const centered = signal.map((value) => value - median(signal));
  const output = new Array<number>(signal.length).fill(0);
  let sum = 0;

  for (let index = 0; index < centered.length; index++) {
    sum += Math.abs(centered[index]);
    if (index >= windowSize) sum -= Math.abs(centered[index - windowSize]);
    output[index] = sum / Math.min(windowSize, index + 1);
  }

  return output;
};

const unchangedResult = (
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  metadata: StartupArtifactMetadata
): StartupArtifactSuppressionResult => ({
  cleaned: {
    ch1: [...waveform.ch1],
    ch2: [...waveform.ch2],
    ch3: [...waveform.ch3],
  },
  metadata,
});

/**
 * Detects the connection/settling transient at the beginning of a capture.
 * Samples are suppressed only when a sustained quiet interval separates the
 * transient from the later muscle action. Ambiguous captures remain intact so
 * they can be exported for diagnosis, but recognition can reject them.
 */
export function suppressStartupArtifactMultiChannel(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  samplingRate = 500
): StartupArtifactSuppressionResult {
  const length = Math.min(waveform.ch1.length, waveform.ch2.length, waveform.ch3.length);
  const emptyMetadata: StartupArtifactMetadata = {
    detected: false,
    ambiguous: false,
    suppressedSamples: 0,
    artifactRatio: 1,
    stabilizationIndex: null,
    reason: '未检测到启动伪迹',
  };

  if (length < Math.max(80, Math.round(samplingRate * 0.3))) {
    return unchangedResult(waveform, {
      ...emptyMetadata,
      reason: '采样过短，跳过启动伪迹判断',
    });
  }

  const signal = waveform.ch2.slice(0, length);
  const envelopeWindow = Math.max(5, Math.round(samplingRate * 0.018));
  const envelope = movingMeanAbsolute(signal, envelopeWindow);
  const initialWindow = Math.max(envelopeWindow * 2, Math.round(samplingRate * 0.08));
  const searchEnd = Math.min(
    length - 1,
    Math.max(initialWindow + 1, Math.round(samplingRate * 0.6)),
    Math.floor(length * 0.32)
  );
  const laterEnvelope = envelope.slice(searchEnd, Math.max(searchEnd + 1, Math.floor(length * 0.9)));
  const baselineLevel = Math.max(percentile(laterEnvelope, 0.25), Number.EPSILON);
  const laterActiveLevel = Math.max(percentile(laterEnvelope, 0.9), baselineLevel);
  const initialLevel = percentile(envelope.slice(0, initialWindow), 0.85);
  const artifactRatio = initialLevel / Math.max(baselineLevel, laterActiveLevel * 0.08, Number.EPSILON);
  const signalCenter = median(signal);
  const initialCentered = signal.slice(0, initialWindow).map((value) => value - signalCenter);
  const positiveRatio = initialCentered.filter((value) => value >= 0).length /
    Math.max(1, initialCentered.length);
  const isUnipolarDrift = positiveRatio >= 0.88 || positiveRatio <= 0.12;

  const earlyLevel = median(envelope.slice(0, Math.max(2, Math.floor(initialWindow / 2))));
  const endOfSearchLevel = median(envelope.slice(
    Math.max(initialWindow, searchEnd - initialWindow),
    searchEnd
  ));
  const hasDecayShape = earlyLevel > endOfSearchLevel * 1.8;
  const detected = artifactRatio >= 2.8 && hasDecayShape && isUnipolarDrift;

  if (!detected) {
    return unchangedResult(waveform, {
      ...emptyMetadata,
      artifactRatio,
    });
  }

  // A slowly decaying capture with no later activity peak has no trustworthy
  // boundary between connection settling and a possible user action.
  if (laterActiveLevel / baselineLevel < 2.2) {
    return unchangedResult(waveform, {
      detected: true,
      ambiguous: true,
      suppressedSamples: 0,
      artifactRatio,
      stabilizationIndex: null,
      reason: '检测到启动瞬态，但后续信号没有形成可分离的动作峰',
    });
  }

  const quietThreshold = Math.max(
    baselineLevel * 2.5,
    Math.min(initialLevel * 0.16, laterActiveLevel * 0.22)
  );
  const quietRunLength = Math.max(envelopeWindow * 2, Math.round(samplingRate * 0.06));
  let stabilizationIndex: number | null = null;

  for (let start = initialWindow; start + quietRunLength <= searchEnd; start++) {
    const run = envelope.slice(start, start + quietRunLength);
    const quietSamples = run.filter((value) => value <= quietThreshold).length;
    if (quietSamples / run.length >= 0.9) {
      stabilizationIndex = start + quietRunLength;
      break;
    }
  }

  if (stabilizationIndex === null) {
    return unchangedResult(waveform, {
      detected: true,
      ambiguous: true,
      suppressedSamples: 0,
      artifactRatio,
      stabilizationIndex: null,
      reason: '检测到启动瞬态，但未找到与真实动作分离的稳定静息区间',
    });
  }

  const guardSamples = Math.max(2, Math.round(samplingRate * 0.02));
  const suppressedSamples = Math.min(length, stabilizationIndex + guardSamples);
  const suppress = (channel: number[]): number[] => channel.map((value, index) => (
    index < suppressedSamples ? 0 : value
  ));

  return {
    cleaned: {
      ch1: suppress(waveform.ch1),
      ch2: suppress(waveform.ch2),
      ch3: suppress(waveform.ch3),
    },
    metadata: {
      detected: true,
      ambiguous: false,
      suppressedSamples,
      artifactRatio,
      stabilizationIndex,
      reason: `已屏蔽前 ${suppressedSamples} 个启动伪迹样本`,
    },
  };
}

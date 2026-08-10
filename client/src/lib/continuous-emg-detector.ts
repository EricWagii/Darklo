import type { PauseTimingModel } from './continuous-pause-calibration';

export interface ContinuousBaselineStats {
  center: number;
  noise: number;
  sampleCount: number;
}

export interface ContinuousDetectorConfig {
  baselineCenter: number;
  baselineNoise: number;
  startupGuardMs?: number;
  minPulseMs?: number;
  releaseDebounceMs?: number;
  maxPulseMs?: number;
  startMultiplier?: number;
  endMultiplier?: number;
  envelopeAlpha?: number;
  saturationLimit?: number;
  driftMultiplier?: number;
  driftDebounceMs?: number;
}

export interface PulseDetectorEvent {
  type: 'pulse';
  startedAt: number;
  endedAt: number;
  durationMs: number;
  peakEnvelope: number;
}

export interface BlockedDetectorEvent {
  type: 'blocked';
  at: number;
  reason: 'saturation' | 'drift' | 'overlong';
}

export type DetectorEvent = PulseDetectorEvent | BlockedDetectorEvent;

export interface DetectorSnapshot {
  envelope: number;
  startThreshold: number;
  endThreshold: number;
  isActive: boolean;
  isBlocked: boolean;
  blockedReason: BlockedDetectorEvent['reason'] | null;
}

export interface ContinuousCalibration {
  baseline: ContinuousBaselineStats;
  shortMedianMs: number;
  longMedianMs: number;
  durationBoundaryMs: number;
  uncertaintyMarginMs: number;
  pauseTimingModel?: PauseTimingModel;
  detectorConfig: ContinuousDetectorConfig;
}

export type ContinuousCalibrationResult =
  | { ok: true; calibration: ContinuousCalibration }
  | { ok: false; reason: string };

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const medianAbsoluteDeviation = (values: number[], center = median(values)): number =>
  median(values.map((value) => Math.abs(value - center)));

export const estimateContinuousBaseline = (samples: number[]): ContinuousBaselineStats => {
  const center = median(samples);
  const robustSigma = medianAbsoluteDeviation(samples, center) * 1.4826;
  return {
    center,
    noise: Math.max(robustSigma, 1),
    sampleCount: samples.length,
  };
};

export const buildContinuousCalibration = ({
  baselineSamples,
  shortDurationsMs,
  longDurationsMs,
}: {
  baselineSamples: number[];
  shortDurationsMs: number[];
  longDurationsMs: number[];
}): ContinuousCalibrationResult => {
  if (baselineSamples.length < 250) {
    return { ok: false, reason: '静息样本不足，请保持放松后重新校准' };
  }
  if (shortDurationsMs.length < 3 || longDurationsMs.length < 3) {
    return { ok: false, reason: '长短咬样本不足，每组至少需要 3 次' };
  }

  const shortMedianMs = median(shortDurationsMs);
  const longMedianMs = median(longDurationsMs);
  const durationGap = longMedianMs - shortMedianMs;
  const shortSpread = medianAbsoluteDeviation(shortDurationsMs, shortMedianMs);
  const longSpread = medianAbsoluteDeviation(longDurationsMs, longMedianMs);
  const requiredGap = Math.max(120, shortMedianMs * 0.4, (shortSpread + longSpread) * 3);

  if (shortMedianMs >= longMedianMs || durationGap < requiredGap) {
    return { ok: false, reason: '短咬与长咬时长无法可靠区分，请放慢节奏后重新校准' };
  }

  const baseline = estimateContinuousBaseline(baselineSamples);
  // A geometric boundary is less biased toward the long-duration class when the
  // user's long bites vary widely. Keep the uncertainty band narrow enough that
  // valid field-recorded long bites do not fall into the ambiguous region.
  const durationBoundaryMs = Math.sqrt(shortMedianMs * longMedianMs);
  const uncertaintyMarginMs = Math.max(30, Math.min(70, durationGap * 0.07));

  return {
    ok: true,
    calibration: {
      baseline,
      shortMedianMs,
      longMedianMs,
      durationBoundaryMs,
      uncertaintyMarginMs,
      detectorConfig: {
        baselineCenter: baseline.center,
        baselineNoise: baseline.noise,
        startupGuardMs: 750,
        minPulseMs: Math.max(70, shortMedianMs * 0.35),
        releaseDebounceMs: 60,
        maxPulseMs: Math.max(1_500, longMedianMs * 2.5),
      },
    },
  };
};

export class ContinuousEmgDetector {
  private readonly config: Required<ContinuousDetectorConfig>;
  private readonly startThreshold: number;
  private readonly endThreshold: number;
  private readonly driftThreshold: number;
  private firstTimestamp: number | null = null;
  private envelope = 0;
  private dcOffset = 0;
  private activeStartedAt: number | null = null;
  private lastTimestamp: number | null = null;
  private activeStrongDurationMs = 0;
  private releaseStartedAt: number | null = null;
  private peakEnvelope = 0;
  private driftStartedAt: number | null = null;
  private blockedReason: BlockedDetectorEvent['reason'] | null = null;

  constructor(config: ContinuousDetectorConfig) {
    this.config = {
      startupGuardMs: 750,
      minPulseMs: 80,
      releaseDebounceMs: 60,
      maxPulseMs: 2_000,
      startMultiplier: 6,
      endMultiplier: 3,
      envelopeAlpha: 0.2,
      saturationLimit: 32_760,
      driftMultiplier: 18,
      driftDebounceMs: 300,
      ...config,
    };
    this.startThreshold = Math.max(10, this.config.baselineNoise * this.config.startMultiplier);
    this.endThreshold = Math.max(5, this.config.baselineNoise * this.config.endMultiplier);
    this.driftThreshold = Math.max(80, this.config.baselineNoise * this.config.driftMultiplier);
  }

  push(sample: number, timestamp: number): DetectorEvent[] {
    if (this.firstTimestamp === null) this.firstTimestamp = timestamp;
    const sampleDeltaMs = this.lastTimestamp === null ? 0 : Math.max(0, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;
    const events: DetectorEvent[] = [];
    const centered = sample - this.config.baselineCenter;
    const absolute = Math.abs(centered);

    this.envelope += this.config.envelopeAlpha * (absolute - this.envelope);
    this.dcOffset += 0.03 * (centered - this.dcOffset);

    if (absolute >= this.config.saturationLimit) {
      this.resetPulse();
      if (this.blockedReason !== 'saturation') {
        events.push({ type: 'blocked', at: timestamp, reason: 'saturation' });
      }
      this.blockedReason = 'saturation';
      return events;
    }

    const elapsed = timestamp - this.firstTimestamp;
    if (elapsed < this.config.startupGuardMs) {
      this.resetPulse();
      this.envelope = 0;
      this.dcOffset = 0;
      this.blockedReason = null;
      return events;
    }

    if (Math.abs(this.dcOffset) >= this.driftThreshold) {
      this.driftStartedAt ??= timestamp;
      if (timestamp - this.driftStartedAt >= this.config.driftDebounceMs) {
        this.resetPulse();
        if (this.blockedReason !== 'drift') {
          events.push({ type: 'blocked', at: timestamp, reason: 'drift' });
        }
        this.blockedReason = 'drift';
        return events;
      }
    } else {
      this.driftStartedAt = null;
      if (this.blockedReason === 'drift' || this.blockedReason === 'saturation') {
        this.blockedReason = null;
      }
    }

    if (this.blockedReason === 'overlong') {
      if (this.envelope <= this.endThreshold) {
        this.blockedReason = null;
      } else {
        return events;
      }
    }
    if (this.blockedReason) return events;

    if (this.activeStartedAt === null) {
      if (this.envelope >= this.startThreshold) {
        this.activeStartedAt = timestamp;
        this.peakEnvelope = this.envelope;
        this.activeStrongDurationMs = 0;
      }
      return events;
    }

    this.peakEnvelope = Math.max(this.peakEnvelope, this.envelope);
    if (absolute >= this.startThreshold) {
      this.activeStrongDurationMs += sampleDeltaMs;
    }
    if (timestamp - this.activeStartedAt >= this.config.maxPulseMs) {
      this.resetPulse();
      this.blockedReason = 'overlong';
      events.push({ type: 'blocked', at: timestamp, reason: 'overlong' });
      return events;
    }

    if (this.envelope <= this.endThreshold) {
      this.releaseStartedAt ??= timestamp;
      if (timestamp - this.releaseStartedAt >= this.config.releaseDebounceMs) {
        const startedAt = this.activeStartedAt;
        const endedAt = this.releaseStartedAt;
        const durationMs = endedAt - startedAt;
        const peakEnvelope = this.peakEnvelope;
        const strongDurationMs = this.activeStrongDurationMs;
        this.resetPulse();
        if (
          durationMs >= this.config.minPulseMs &&
          strongDurationMs >= this.config.minPulseMs * 0.6
        ) {
          events.push({ type: 'pulse', startedAt, endedAt, durationMs, peakEnvelope });
        }
      }
    } else {
      this.releaseStartedAt = null;
    }

    return events;
  }

  getSnapshot(): DetectorSnapshot {
    return {
      envelope: this.envelope,
      startThreshold: this.startThreshold,
      endThreshold: this.endThreshold,
      isActive: this.activeStartedAt !== null,
      isBlocked: this.blockedReason !== null,
      blockedReason: this.blockedReason,
    };
  }

  reset(): void {
    this.firstTimestamp = null;
    this.lastTimestamp = null;
    this.envelope = 0;
    this.dcOffset = 0;
    this.driftStartedAt = null;
    this.blockedReason = null;
    this.resetPulse();
  }

  private resetPulse(): void {
    this.activeStartedAt = null;
    this.releaseStartedAt = null;
    this.peakEnvelope = 0;
    this.activeStrongDurationMs = 0;
  }
}

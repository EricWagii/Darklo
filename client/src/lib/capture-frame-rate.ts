import { HARDWARE_CONFIG } from '@shared/hardware-config';

const MIN_CAPTURE_DURATION_MS = 1_000;
const SUPPORTED_SAMPLE_RATES = [HARDWARE_CONFIG.SAMPLE_RATE, HARDWARE_CONFIG.SAMPLE_RATE * 2];
const RATE_TOLERANCE = 0.2;

const getNominalRate = (measuredHz: number): number | null =>
  SUPPORTED_SAMPLE_RATES.find((nominalHz) =>
    measuredHz >= nominalHz * (1 - RATE_TOLERANCE) &&
    measuredHz <= nominalHz * (1 + RATE_TOLERANCE)
  ) ?? null;

export const isSupportedCaptureSampleRate = (rateHz: number): boolean =>
  Number.isFinite(rateHz) && getNominalRate(rateHz) !== null;

export const SUPPORTED_CAPTURE_RATE_DESCRIPTION = SUPPORTED_SAMPLE_RATES
  .map((rate) => `${rate * (1 - RATE_TOLERANCE)}–${rate * (1 + RATE_TOLERANCE)} Hz`)
  .join(' 或 ');

export interface CaptureFrameRateAssessment {
  acceptable: boolean;
  measuredHz: number | null;
  nominalHz: number | null;
  reason: 'acceptable' | 'invalid' | 'too-short' | 'low-rate' | 'unsupported-rate' | 'high-rate';
  message: string;
}

export interface CaptureBaselineCompatibility {
  compatible: boolean;
  message: string;
}

/** Baseline and action captures must come from the same device rate and remain close in throughput. */
export function assessCaptureBaselineCompatibility(
  captureHz: number | null,
  baselineHz: number | undefined
): CaptureBaselineCompatibility {
  const captureNominal = captureHz !== null && Number.isFinite(captureHz)
    ? getNominalRate(captureHz)
    : null;
  const baselineNominal = Number.isFinite(baselineHz)
    ? getNominalRate(baselineHz as number)
    : null;
  if (
    !captureNominal || !baselineNominal || captureNominal !== baselineNominal ||
    Math.abs(captureHz! - baselineHz!) / baselineHz! > RATE_TOLERANCE
  ) {
    const baselineDescription = Number.isFinite(baselineHz)
      ? `原基线约 ${Math.round(baselineHz!)} Hz`
      : '原基线缺少可靠的实收帧率';
    return {
      compatible: false,
      message: `本次采集约 ${captureHz === null ? '未知' : Math.round(captureHz)} Hz，${baselineDescription}，采样档位不同或帧率偏差超过 20%。请重录静息基线后再采集`,
    };
  }
  return { compatible: true, message: '本次采集与静息基线帧率一致' };
}

/** Check the actual number of decoded frames against wall-clock capture time. */
export function assessCaptureFrameRate(
  sampleCount: number,
  elapsedMs: number
): CaptureFrameRateAssessment {
  if (
    !Number.isInteger(sampleCount) || sampleCount < 0 ||
    !Number.isFinite(elapsedMs) || elapsedMs <= 0
  ) {
    return {
      acceptable: false,
      measuredHz: null,
      nominalHz: null,
      reason: 'invalid',
      message: '采集时长或串口帧数无效，请重新采集',
    };
  }

  const measuredHz = sampleCount / (elapsedMs / 1_000);
  const nominalHz = getNominalRate(measuredHz);
  if (elapsedMs < MIN_CAPTURE_DURATION_MS) {
    return {
      acceptable: false,
      measuredHz,
      nominalHz,
      reason: 'too-short',
      message: '本次录制不足 1 秒，请至少录制 1 秒后重试',
    };
  }

  if (nominalHz === null) {
    const minimumHz = SUPPORTED_SAMPLE_RATES[0] * (1 - RATE_TOLERANCE);
    const maximumHz = SUPPORTED_SAMPLE_RATES[SUPPORTED_SAMPLE_RATES.length - 1] * (1 + RATE_TOLERANCE);
    return {
      acceptable: false,
      measuredHz,
      nominalHz: null,
      reason: measuredHz < minimumHz ? 'low-rate' : measuredHz > maximumHz ? 'high-rate' : 'unsupported-rate',
      message: `本次实收帧率约 ${Math.round(measuredHz)} Hz，需在 ${SUPPORTED_CAPTURE_RATE_DESCRIPTION}。请检查串口输出、连接和设备采样设置后重录`,
    };
  }

  return {
    acceptable: true,
    measuredHz,
    nominalHz,
    reason: 'acceptable',
    message: `实收帧率约 ${Math.round(measuredHz)} Hz`,
  };
}

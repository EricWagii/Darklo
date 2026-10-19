import FFT from 'fft.js';
import { highPassFilter, notchFilter } from './adaptive-waveform-filtering';
import type { GestureCommand, GestureConfig, GestureExample, GestureFrame, GesturePrediction } from './gesture-contract';

/** Distances are calibrated template distances, never posterior probabilities. */
export const GESTURE_ENGINE_VERSION = 'hybrid-gesture-v1';
const EPS = 1e-12;
const ENVELOPE_POINTS = 32;
const MIN_EXAMPLES = 3;

interface GestureFeatures {
  descriptor: number[];
  envelope: number[];
  burstCount: number;
  meanBurstSeconds: number;
}
interface GestureProfile {
  labelId: string;
  labelName: string;
  kind: 'rhythm' | 'subtle' | 'rest';
  rhythmTrusted: boolean;
  samples: GestureFeatures[];
  radius: number;
  minMargin: number;
}
export interface GestureModel {
  id: string;
  engineVersion: string;
  createdAt: number;
  config: GestureConfig;
  commands: GestureCommand[];
  trainingIds: string[];
  featureScales: number[];
  noise: { on: number; off: number; medianRms: number };
  profiles: GestureProfile[];
  validation: { method: 'leave-one-template-out'; captureCount: number; minimumSeparation: number };
}

const mean = (values: number[]) => values.reduce((s, x) => s + x, 0) / Math.max(1, values.length);
const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)))] ?? 0;
};
const median = (values: number[]) => quantile(values, 0.5);
const finiteArray = (value: unknown, length?: number): value is number[] => Array.isArray(value) &&
  (length === undefined || value.length === length) && value.every(Number.isFinite);
const validConfig = (value: unknown): value is GestureConfig => {
  if (!value || typeof value !== 'object') return false;
  const c = value as GestureConfig;
  return (c.sampleRate === 500 || c.sampleRate === 1000) && [0, 1, 2].includes(c.channel) &&
    c.windowSeconds === 4 && [0, 50, 60].includes(c.mainsHz);
};
const validCommands = (value: unknown): value is GestureCommand[] => Array.isArray(value) && value.length >= 2 &&
  value.every(c => c && typeof c.id === 'string' && c.id.length > 0 && c.id !== 'rest' &&
    typeof c.name === 'string' && c.name.trim().length > 0 && ['rhythm', 'subtle'].includes(c.kind) &&
    (c.expectedBursts === undefined || (Number.isInteger(c.expectedBursts) && c.expectedBursts >= 1))) &&
  new Set(value.map(c => c.id)).size === value.length;

function validateFrames(config: GestureConfig, frames: GestureFrame[]): string | null {
  const expected = config.sampleRate * config.windowSeconds;
  if (!Array.isArray(frames) || frames.length < expected * 0.95 || frames.length > expected * 1.05) {
    return `需要完整 ${config.windowSeconds} 秒窗口（约 ${expected} 帧）；帧数与设定采样率不符`;
  }
  let maximumGap = 0;
  let repeated = 0;
  let longestRepeated = 0;
  let previous = frames[0]?.channels?.[config.channel];
  const values: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame || !Number.isFinite(frame.receivedAtMs) || !finiteArray(frame.channels, 3)) return '原始帧包含非有限数值或通道不完整';
    if (i > 0) {
      const gap = frame.receivedAtMs - frames[i - 1].receivedAtMs;
      if (gap < 0) return '接收时间倒退，无法确认采集完整性';
      maximumGap = Math.max(maximumGap, gap);
    }
    const value = frame.channels[config.channel];
    repeated = value === previous ? repeated + 1 : 1;
    longestRepeated = Math.max(longestRepeated, repeated);
    previous = value;
    values.push(value);
  }
  if (longestRepeated >= config.sampleRate * 0.3) return '信号平线或长时间冻结，不能当作静息或有效指令';
  const span = frames[frames.length - 1].receivedAtMs - frames[0].receivedAtMs;
  const physicalMs = (frames.length - 1) / config.sampleRate * 1000;
  // Equal timestamps within serial batches are legal, but a complete capture
  // must still span plausible wall time. Never mistake a stale replay/buffer
  // delivered in one burst for a fresh four-second recording. DSP timing below
  // remains sample index / configured Fs, independent of batching.
  if (maximumGap > 400 || span < physicalMs * 0.7 || span > physicalMs * 1.3) {
    return '接收时间显示断流或采样率不符，请检查设备设置与连接';
  }
  const center = median(values);
  const energy = values.reduce((sum, value) => sum + (value - center) ** 2, 0);
  if (!Number.isFinite(energy)) return '信号数值超出可计算范围，请检查设备数据格式';
  if (energy / values.length < EPS) return '未检测到有效动态信号，请检查电极接触';
  const peakEnergy = values.reduce((maximum, value) => Math.max(maximum, (value - center) ** 2), 0);
  if (peakEnergy / energy > 0.12) return '孤立电气脉冲占据信号能量，请检查接触后重录';
  return null;
}

function filteredSignal(config: GestureConfig, frames: GestureFrame[]): number[] {
  let signal = highPassFilter(frames.map(frame => frame.channels[config.channel]), 20, config.sampleRate);
  if (config.mainsHz) signal = notchFilter(signal, config.mainsHz, config.sampleRate, 35);
  return signal.slice(Math.round(config.sampleRate * 0.15));
}

function rmsEnvelope(signal: number[], rate: number): number[] {
  const width = Math.round(rate * 0.05);
  const step = Math.round(rate * 0.025);
  const envelope: number[] = [];
  let sum = 0;
  const prefix = [0];
  for (const value of signal) { sum += value * value; prefix.push(sum); }
  for (let start = 0; start + width <= signal.length; start += step) {
    envelope.push(Math.sqrt(Math.max(0, prefix[start + width] - prefix[start]) / width));
  }
  return envelope;
}

/** Welch powers retain physical frequencies; no raw waveform time compression. */
function spectralBands(signal: number[], rate: number): number[] {
  const size = rate === 500 ? 256 : 512;
  const bands = [[20, 40], [40, 70], [70, 110], [110, 170], [170, 245]];
  if (rate === 1000) bands.push([245, 450]);
  const fft = new FFT(size);
  const powers = bands.map(() => 0);
  const input = new Array<number>(size);
  const output = fft.createComplexArray();
  for (let start = 0; start + size <= signal.length; start += size / 2) {
    for (let i = 0; i < size; i++) input[i] = signal[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    // fft.js exposes realTransform, not forward (the older FFT defect).
    fft.realTransform(output, input);
    for (let bin = 1; bin < size / 2; bin++) {
      const frequency = bin * rate / size;
      const band = bands.findIndex(([low, high]) => frequency >= low && frequency < high);
      if (band >= 0) powers[band] += output[2 * bin] ** 2 + output[2 * bin + 1] ** 2;
    }
  }
  const total = powers.reduce((sum, power) => sum + power, 0);
  return powers.map(power => Math.log(power / Math.max(total, EPS) + 1e-4));
}

function features(config: GestureConfig, signal: number[], noise: GestureModel['noise']): GestureFeatures {
  const rms = Math.sqrt(mean(signal.map(value => value * value)));
  const rawEnvelope = rmsEnvelope(signal, config.sampleRate);
  const envelopeMaximum = Math.max(quantile(rawEnvelope, 0.99), EPS);
  const envelope = Array.from({ length: ENVELOPE_POINTS }, (_, index) => {
    const start = Math.floor(index * rawEnvelope.length / ENVELOPE_POINTS);
    const end = Math.max(start + 1, Math.floor((index + 1) * rawEnvelope.length / ENVELOPE_POINTS));
    return Math.min(1, mean(rawEnvelope.slice(start, end)) / envelopeMaximum);
  });
  const descriptor = [
    Math.log(rms + EPS),
    Math.log((quantile(rawEnvelope, 0.9) + EPS) / (quantile(rawEnvelope, 0.25) + EPS)),
    ...spectralBands(signal, config.sampleRate),
  ];
  const stepSeconds = Math.round(config.sampleRate * 0.025) / config.sampleRate;
  const minWindows = Math.max(2, Math.ceil(0.075 / stepSeconds));
  const endWindows = Math.max(2, Math.ceil(0.075 / stepSeconds));
  const durations: number[] = [];
  let start = -1;
  let quiet = 0;
  for (let i = 0; i <= rawEnvelope.length; i++) {
    const amplitude = rawEnvelope[i] ?? 0;
    if (start < 0) {
      if (amplitude > noise.on) start = i;
    } else {
      quiet = amplitude < noise.off ? quiet + 1 : 0;
      if (quiet >= endWindows || i === rawEnvelope.length) {
        const length = Math.max(0, i - start - quiet + 1);
        if (length >= minWindows) durations.push(length * stepSeconds + 0.05);
        start = -1;
        quiet = 0;
      }
    }
  }
  return { descriptor, envelope, burstCount: durations.length, meanBurstSeconds: mean(durations) };
}

function shapeDistance(left: number[], right: number[]): number {
  const previous = new Float64Array(right.length + 1).fill(Infinity);
  previous[0] = 0;
  for (let i = 1; i <= left.length; i++) {
    const current = new Float64Array(right.length + 1).fill(Infinity);
    for (let j = Math.max(1, i - 4); j <= Math.min(right.length, i + 4); j++) {
      current[j] = Math.abs(left[i - 1] - right[j - 1]) + Math.min(previous[j], current[j - 1], previous[j - 1]);
    }
    previous.set(current);
  }
  return previous[right.length] / Math.max(left.length, right.length);
}

function sampleDistance(left: GestureFeatures, right: GestureFeatures, scales: number[], rhythm: boolean): number {
  const descriptorDistance = Math.sqrt(mean(left.descriptor.map((value, index) =>
    ((value - right.descriptor[index]) / scales[index]) ** 2
  )));
  const rhythmDistance = rhythm
    ? Math.min(2, Math.abs(left.burstCount - right.burstCount)) * 0.65 +
      0.15 * Math.min(2, Math.abs(Math.log((left.meanBurstSeconds + 0.05) / (right.meanBurstSeconds + 0.05))))
    : 0;
  return descriptorDistance + 0.65 * shapeDistance(left.envelope, right.envelope) + rhythmDistance;
}

function profileDistance(feature: GestureFeatures, profile: GestureProfile, scales: number[], excludedIndex = -1): number {
  const distances = profile.samples.filter((_, index) => index !== excludedIndex)
    .map(sample => sampleDistance(feature, sample, scales, profile.rhythmTrusted)).sort((a, b) => a - b);
  return mean(distances.slice(0, Math.min(2, distances.length)));
}

export function trainGestureModel(config: GestureConfig, commands: GestureCommand[], examples: GestureExample[]): { model: GestureModel | null; issues: string[] } {
  if (!validConfig(config)) return { model: null, issues: ['采集配置无效：支持 500/1000 Hz、4 秒独立窗口和有效通道'] };
  if (!validCommands(commands)) return { model: null, issues: ['指令配置无效或重复；静息必须使用独立 rest 负类'] };
  if (!Array.isArray(examples)) return { model: null, issues: ['缺少训练录制'] };
  const labels = [...commands.map(command => command.id), 'rest'];
  const names = new Map([...commands.map(command => [command.id, command.name] as const), ['rest', '真正静息']]);
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const example of examples) {
    if (!example || !labels.includes(example.label) || typeof example.id !== 'string' || !example.id || ids.has(example.id)) {
      issues.push('训练录制标签或 ID 无效/重复');
      continue;
    }
    ids.add(example.id);
    const problem = validateFrames(config, example.frames);
    if (problem) issues.push(`${names.get(example.label)} · ${example.id}：${problem}`);
  }
  for (const label of labels) {
    if (examples.filter(example => example?.label === label).length < MIN_EXAMPLES) issues.push(`${names.get(label)}至少需要 ${MIN_EXAMPLES} 条独立录制`);
  }
  if (issues.length) return { model: null, issues };
  const signals = examples.map(example => filteredSignal(config, example.frames));
  const restingEnvelope = examples.flatMap((example, index) => example.label === 'rest' ? rmsEnvelope(signals[index], config.sampleRate) : []);
  const restMedian = median(restingEnvelope);
  const deviation = median(restingEnvelope.map(value => Math.abs(value - restMedian))) * 1.4826;
  const noise = {
    on: Math.max(quantile(restingEnvelope, 0.99) * 1.15, restMedian + 6 * deviation, EPS),
    off: Math.max(quantile(restingEnvelope, 0.95) * 1.05, restMedian + 3 * deviation, EPS),
    medianRms: restMedian,
  };
  const allFeatures = signals.map(signal => features(config, signal, noise));
  const featureScales = allFeatures[0].descriptor.map((_, index) => {
    const values = allFeatures.map(feature => feature.descriptor[index]);
    const center = mean(values);
    return Math.max(0.2, Math.sqrt(mean(values.map(value => (value - center) ** 2))));
  });
  const profiles: GestureProfile[] = labels.map(labelId => {
    const command = commands.find(item => item.id === labelId);
    const samples = allFeatures.filter((_, index) => examples[index].label === labelId);
    return {
      labelId, labelName: names.get(labelId)!, kind: command?.kind ?? 'rest',
      rhythmTrusted: command?.kind === 'rhythm' && command.expectedBursts !== undefined &&
        samples.filter(sample => sample.burstCount === command.expectedBursts).length / samples.length >= 0.75,
      samples, radius: 0, minMargin: 0,
    };
  });
  let minimumSeparation = Infinity;
  // Exclude the current capture's template when calibrating distances. Noise
  // and feature scales use the enrollment set, so this is internal calibration,
  // not an independent accuracy estimate. New recordings are still required.
  for (const profile of profiles) {
    const ownDistances: number[] = [];
    const competitorDistances: number[] = [];
    const margins: number[] = [];
    const collisions = new Map<string, number>();
    profile.samples.forEach((feature, index) => {
      const own = profileDistance(feature, profile, featureScales, index);
      const competitors = profiles.filter(other => other !== profile).map(other => ({
        label: other.labelName, distance: profileDistance(feature, other, featureScales),
      })).sort((left, right) => left.distance - right.distance);
      const nearest = competitors[0];
      ownDistances.push(own);
      competitorDistances.push(nearest.distance);
      margins.push(nearest.distance - own);
      if (nearest.distance <= Math.max(0.16, own * 1.4)) collisions.set(nearest.label, (collisions.get(nearest.label) ?? 0) + 1);
    });
    if (collisions.size > 0) {
      issues.push(`${profile.labelName}与${Array.from(collisions.keys()).join('、')}在内部留一模板校准中不可可靠区分；请补充真实样本或调整电极，不能作为已训练成功`);
    }
    // With only 3–5 captures, flooring a 95th percentile silently drops the
    // most variable enrolment example. Preserve its leave-one-out distance.
    const within = Math.max(...ownDistances);
    const between = Math.min(...competitorDistances);
    profile.radius = Math.min(Math.max(0.18, within * 1.8 + 0.05), between * 0.8);
    profile.minMargin = Math.max(0.06, Math.min(0.25, Math.min(...margins) * 0.35));
    minimumSeparation = Math.min(minimumSeparation, ...margins);
  }
  if (issues.length) return { model: null, issues };
  const createdAt = Date.now();
  return { model: {
    id: `gesture-${createdAt}-${Math.random().toString(36).slice(2, 10)}`,
    engineVersion: GESTURE_ENGINE_VERSION, createdAt,
    config: { ...config }, commands: commands.map(command => ({ ...command })),
    trainingIds: examples.map(example => example.id), featureScales, noise, profiles,
    validation: { method: 'leave-one-template-out', captureCount: examples.length, minimumSeparation },
  }, issues: [] };
}

export function recognizeGesture(model: GestureModel, frames: GestureFrame[]): GesturePrediction {
  const invalid = (reason: string): GesturePrediction => ({ status: 'invalid', reason, scores: [], diagnostics: {} });
  if (!isGestureModel(model)) return invalid('模型版本或内容无效，请加载可验证模型');
  const problem = validateFrames(model.config, frames);
  if (problem) return invalid(problem);
  const signal = filteredSignal(model.config, frames);
  const feature = features(model.config, signal, model.noise);
  const scores = model.profiles.map(profile => ({ labelId: profile.labelId, distance: profileDistance(feature, profile, model.featureScales) }))
    .sort((left, right) => left.distance - right.distance);
  const top = scores[0];
  const profile = model.profiles.find(item => item.labelId === top.labelId)!;
  const margin = scores[1].distance - top.distance;
  const diagnostics = {
    engineVersion: GESTURE_ENGINE_VERSION, physicalSeconds: frames.length / model.config.sampleRate,
    receptionTiming: 'validated',
    burstCount: feature.burstCount, meanBurstSeconds: feature.meanBurstSeconds,
    rmsToRest: Math.exp(feature.descriptor[0]) / Math.max(model.noise.medianRms, EPS),
    bestDistance: top.distance, acceptanceRadius: profile.radius, margin, requiredMargin: profile.minMargin,
    rhythmEvidenceUsed: profile.rhythmTrusted,
  };
  if (top.distance > profile.radius) return { status: 'unknown', reason: '本次信号超出已校准模板范围，保留录制后重试或补充训练', scores, diagnostics };
  if (margin < profile.minMargin) return { status: 'unknown', reason: '候选指令或静息之间证据不足，未强制输出指令', scores, diagnostics };
  return top.labelId === 'rest'
    ? { status: 'rest', labelId: 'rest', labelName: '真正静息', reason: '信号与独立静息负类一致', scores, diagnostics }
    : { status: 'recognized', labelId: top.labelId, labelName: profile.labelName, reason: profile.rhythmTrusted ? '模板与已校准节律证据一致' : '全窗口时频与包络模板证据支持该指令', scores, diagnostics };
}

export function isGestureModel(value: unknown): value is GestureModel {
  if (!value || typeof value !== 'object') return false;
  const model = value as GestureModel;
  if (model.engineVersion !== GESTURE_ENGINE_VERSION || typeof model.id !== 'string' || !model.id ||
    !Number.isFinite(model.createdAt) || !validConfig(model.config) || !validCommands(model.commands) ||
    !Array.isArray(model.trainingIds) || model.trainingIds.length < (model.commands.length + 1) * MIN_EXAMPLES ||
    !model.trainingIds.every(id => typeof id === 'string' && id.length > 0) || new Set(model.trainingIds).size !== model.trainingIds.length) return false;
  const dimensions = model.config.sampleRate === 500 ? 7 : 8;
  if (!finiteArray(model.featureScales, dimensions) || !model.featureScales.every(scale => scale > 0) ||
    !model.noise || ![model.noise.on, model.noise.off, model.noise.medianRms].every(number => Number.isFinite(number) && number > 0) ||
    model.noise.on < model.noise.off || !Array.isArray(model.profiles) || model.profiles.length !== model.commands.length + 1) return false;
  const expectedLabels = [...model.commands.map(command => command.id), 'rest'];
  if (new Set(model.profiles.map(profile => profile?.labelId)).size !== expectedLabels.length) return false;
  if (!model.validation || model.validation.method !== 'leave-one-template-out' ||
    model.validation.captureCount !== model.trainingIds.length || !Number.isFinite(model.validation.minimumSeparation) || model.validation.minimumSeparation <= 0) return false;
  const profilesValid = model.profiles.every(profile => profile && expectedLabels.includes(profile.labelId) && typeof profile.labelName === 'string' &&
    ['rhythm', 'subtle', 'rest'].includes(profile.kind) && (profile.labelId === 'rest') === (profile.kind === 'rest') &&
    (profile.labelId === 'rest' || model.commands.find(command => command.id === profile.labelId)?.kind === profile.kind) &&
    (!profile.rhythmTrusted || profile.kind === 'rhythm') &&
    typeof profile.rhythmTrusted === 'boolean' && Number.isFinite(profile.radius) && profile.radius > 0 && Number.isFinite(profile.minMargin) && profile.minMargin > 0 &&
    Array.isArray(profile.samples) && profile.samples.length >= MIN_EXAMPLES && profile.samples.every(sample =>
      sample && finiteArray(sample.descriptor, dimensions) && finiteArray(sample.envelope, ENVELOPE_POINTS) && sample.envelope.every(value => value >= 0 && value <= 1) &&
      Number.isInteger(sample.burstCount) && sample.burstCount >= 0 && Number.isFinite(sample.meanBurstSeconds) && sample.meanBurstSeconds >= 0
    ));
  return profilesValid && model.profiles.reduce((sum, profile) => sum + profile.samples.length, 0) === model.trainingIds.length;
}

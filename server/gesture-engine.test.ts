import { describe, expect, it } from 'vitest';
import { DEFAULT_GESTURE_COMMANDS, type GestureConfig, type GestureExample, type GestureFrame } from '../client/src/lib/gesture-contract';
import { isGestureModel, recognizeGesture, trainGestureModel } from '../client/src/lib/gesture-engine';

const config: GestureConfig = { sampleRate: 500, channel: 1, windowSeconds: 4, mainsHz: 50 };
type Label = 'long' | 'double' | 'triple' | 'water' | 'rest' | 'other' | 'single' | 'four';

// Independent phase/seed and slight time/amplitude perturbations make test
// captures different from the enrolled samples. These are synthetic signals,
// not evidence of accuracy for a person's silent articulation.
function capture(label: Label, seed: number, options: { rate?: 500 | 1000; batched?: boolean; longSeconds?: number; transientWater?: boolean; amplitudeScale?: number } = {}): GestureFrame[] {
  const rate = options.rate ?? 500;
  let random = seed >>> 0;
  const phase = seed * 0.71;
  const shift = Math.sin(seed * 1.7) * 0.035;
  const strongAmplitude = 20 * (1 + 0.08 * Math.sin(seed)) * (options.amplitudeScale ?? 1);
  const bursts: number[][] = label === 'long' ? [[0.8 + shift, 0.8 + shift + (options.longSeconds ?? 1.2)]]
    : label === 'double' ? [[0.8 + shift, 1.0 + shift], [1.5 + shift, 1.7 + shift]]
    : label === 'triple' ? [[0.7 + shift, 0.9 + shift], [1.35 + shift, 1.55 + shift], [2 + shift, 2.2 + shift]]
    : label === 'single' ? [[0.8 + shift, 1 + shift]]
    : label === 'four' ? [[0.55 + shift, 0.75 + shift], [1.2 + shift, 1.4 + shift], [1.85 + shift, 2.05 + shift], [2.5 + shift, 2.7 + shift]] : [];
  return Array.from({ length: 4 * rate }, (_, index) => {
    random = (1664525 * random + 1013904223) >>> 0;
    const noise = (random / 0xffffffff - 0.5) * 0.45;
    const t = index / rate;
    const background = Math.sin(2 * Math.PI * 32 * t + phase) + 0.3 * Math.sin(2 * Math.PI * 155 * t + phase * 0.3) + noise;
    const active = bursts.some(([start, end]) => t >= start && t < end)
      ? strongAmplitude * (Math.sin(2 * Math.PI * 85 * t + phase) + 0.35 * Math.sin(2 * Math.PI * 115 * t + phase)) : 0;
    // Water is deliberately below a 2.5x raw RMS gate and has no required
    // contraction count. The only evidence is a stable low-amplitude spectral change.
    const subtle = label === 'water' && (!options.transientWater || (t >= 0.7 + shift && t < 2.1 + shift))
      ? 0.55 * Math.sin(2 * Math.PI * 210 * t + phase * 0.6) : 0;
    const unknown = label === 'other' ? 3 * Math.sin(2 * Math.PI * 65 * t + phase) : 0;
    const value = background + active + subtle + unknown;
    return { receivedAtMs: options.batched ? Math.floor(index / (rate / 20)) * 50 : index * 1000 / rate, channels: [value * 0.2, value, Math.abs(value) * 0.1] };
  });
}

function examples(rate: 500 | 1000 = 500): GestureExample[] {
  return (['long', 'double', 'triple', 'water', 'rest'] as const).flatMap(label =>
    [1, 2, 3, 4].map(seed => ({ id: `${label}-${seed}`, label, frames: capture(label, seed, { rate }) }))
  );
}

describe('gesture engine with strong rhythm and subtle active inputs', () => {
  it.each([500, 1000] as const)('recognizes all four active classes and true rest independently at %i Hz', rate => {
    const training = trainGestureModel({ ...config, sampleRate: rate }, DEFAULT_GESTURE_COMMANDS, examples(rate));
    expect(training.issues).toEqual([]);
    expect(training.model).not.toBeNull();
    for (const label of ['long', 'double', 'triple', 'water', 'rest'] as const) {
      for (const seed of [21, 38]) {
        const result = recognizeGesture(training.model!, capture(label, seed, { rate }));
        expect(result.status, `${label}: ${JSON.stringify(result)}`).toBe(label === 'rest' ? 'rest' : 'recognized');
        expect(result.labelId, `${label}: ${JSON.stringify(result)}`).toBe(label);
      }
    }
  });

  it('never silently relabels indistinguishable water examples as rest or claims a trained model', () => {
    const data = examples().map(e => e.label === 'water'
      ? { ...e, frames: capture('rest', Number(e.id.split('-')[1])) } : e);
    const result = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, data);
    expect(result.model).toBeNull();
    expect(result.issues.join(' ')).toMatch(/喝水.*静息|静息.*喝水|water.*rest|rest.*water/);
  });

  it('does not turn an untrained frequency pattern into water or rest', () => {
    const { model } = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, examples());
    expect(model).not.toBeNull();
    const result = recognizeGesture(model!, capture('other', 100));
    expect(result.status, JSON.stringify(result)).toBe('unknown');
  });

  it('requires at least three separate examples for every command and true rest', () => {
    const data = examples().filter(e => e.id !== 'water-3' && e.id !== 'water-4');
    const result = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, data);
    expect(result.model).toBeNull();
    expect(result.issues.join(' ')).toMatch(/喝水.*3|water.*3/);
    const noRest = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, examples().filter(e => e.label !== 'rest'));
    expect(noRest.model).toBeNull();
    expect(noRest.issues.join(' ')).toMatch(/静息|rest/);
  });

  it('uses sample index for timing when frames arrive in batches', () => {
    const { model } = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, examples());
    expect(model).not.toBeNull();
    for (const label of ['long', 'double', 'triple', 'water'] as const) {
      const normal = recognizeGesture(model!, capture(label, 41));
      const batched = recognizeGesture(model!, capture(label, 41, { batched: true }));
      expect(batched.status).toBe('recognized');
      expect(batched.labelId).toBe(normal.labelId);
      expect(batched.scores).toEqual(normal.scores);
    }
    for (const batchMs of [10, 50, 100]) {
      const frames = capture('water', 42).map(frame => ({ ...frame, receivedAtMs: Math.floor(frame.receivedAtMs / batchMs) * batchMs }));
      expect(recognizeGesture(model!, frames).labelId).toBe('water');
    }
  });

  it('rejects a four-second frame count received at one timestamp or compressed into 100 ms', () => {
    const { model } = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, examples());
    expect(model).not.toBeNull();
    for (const span of [0, 100]) {
      const frames = capture('water', 42).map(frame => ({ ...frame, receivedAtMs: frame.receivedAtMs * span / 4000 }));
      expect(recognizeGesture(model!, frames).status).toBe('invalid');
    }
  });

  it('rejects invalid configuration, nonfinite data, missing frames, incompatible frame rates and gaps', () => {
    expect(trainGestureModel({ ...config, sampleRate: 750 as 500 }, DEFAULT_GESTURE_COMMANDS, examples()).model).toBeNull();
    expect(trainGestureModel({ ...config, windowSeconds: 0 }, DEFAULT_GESTURE_COMMANDS, examples()).model).toBeNull();
    const { model } = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, examples());
    expect(model).not.toBeNull();
    const good = capture('long', 11);
    const cases: GestureFrame[][] = [
      good.map((f, i) => i === 10 ? { ...f, channels: [0, Number.NaN, 0] } : f),
      good.slice(0, 1200),
      capture('long', 11, { rate: 1000 }),
      good.map((f, i) => ({ ...f, receivedAtMs: f.receivedAtMs + (i > 1000 ? 800 : 0) })),
      good.map(f => ({ ...f, channels: [0, 0, 0] })),
      good.map((f, i) => i === 100 ? { ...f, channels: [0, 1e308, 0] } : f),
    ];
    for (const frames of cases) expect(recognizeGesture(model!, frames).status).toBe('invalid');
  });

  it('rejects isolated electrical spikes rather than treating them as silent intent', () => {
    const { model } = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, examples());
    const frames = capture('rest', 30);
    frames[900].channels[1] += 10000;
    expect(recognizeGesture(model!, frames).status).toBe('invalid');
  });

  it('round-trips a model and rejects malformed or incompatible saved models', () => {
    const { model } = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, examples());
    expect(model).not.toBeNull();
    const restored = JSON.parse(JSON.stringify(model));
    expect(isGestureModel(restored)).toBe(true);
    expect(restored.trainingIds).toHaveLength(20);
    expect(restored.validation.method).toBe('leave-one-template-out');
    expect(recognizeGesture(restored, capture('water', 99)).labelId).toBe('water');
    expect(isGestureModel({ ...restored, engineVersion: 'unknown-version' })).toBe(false);
    expect(isGestureModel({ ...restored, config: { ...restored.config, sampleRate: 1 } })).toBe(false);
    expect(isGestureModel({ ...restored, trainingIds: [] })).toBe(false);
    expect(isGestureModel({})).toBe(false);
    expect(isGestureModel(null)).toBe(false);
  });

  it('handles a sustained 1.8-second strong action and a short low-amplitude active spectral change', () => {
    const data = examples().map(example => ({ ...example,
      frames: capture(example.label as Label, Number(example.id.split('-')[1]), { longSeconds: 1.8, transientWater: true }),
    }));
    const { model, issues } = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, data);
    expect(issues).toEqual([]);
    expect(model).not.toBeNull();
    for (const label of ['long', 'water', 'rest'] as const) {
      const prediction = recognizeGesture(model!, capture(label, 77, { longSeconds: 1.8, transientWater: true }));
      expect(prediction.labelId, JSON.stringify(prediction)).toBe(label);
      if (label === 'water') expect(prediction.diagnostics.rmsToRest).toBeLessThan(2.5);
    }
  });

  it('refuses saved models with forged profile metadata or mismatched training counts', () => {
    const { model } = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, examples());
    expect(model).not.toBeNull();
    const wrongKind = JSON.parse(JSON.stringify(model));
    wrongKind.profiles.find((profile: { labelId: string }) => profile.labelId === 'water').kind = 'rhythm';
    expect(isGestureModel(wrongKind)).toBe(false);
    const wrongCount = JSON.parse(JSON.stringify(model));
    wrongCount.profiles[0].samples.pop();
    expect(isGestureModel(wrongCount)).toBe(false);
    const nullSample = JSON.parse(JSON.stringify(model));
    nullSample.profiles[0].samples[0] = null;
    expect(() => isGestureModel(nullSample)).not.toThrow();
    expect(isGestureModel(nullSample)).toBe(false);
  });

  it('does not count repeated IDs as independent enrolment captures', () => {
    const data = examples();
    data[1].id = data[0].id;
    const result = trainGestureModel(config, DEFAULT_GESTURE_COMMANDS, data);
    expect(result.model).toBeNull();
    expect(result.issues.join(' ')).toContain('ID');
  });

  it.each([500, 1000] as const)('rejects untrained single-short and four-short rhythms at %i Hz rather than assigning a known command', rate => {
    const { model } = trainGestureModel({ ...config, sampleRate: rate }, DEFAULT_GESTURE_COMMANDS, examples(rate));
    expect(model).not.toBeNull();
    for (const label of ['single', 'four'] as const) {
      for (const seed of [17, 55]) {
        const prediction = recognizeGesture(model!, capture(label, seed, { rate }));
        expect(prediction.status, JSON.stringify(prediction)).toBe('unknown');
      }
    }
  });

  it.each([500, 1000] as const)('recognizes long contractions with held-out duration and amplitude inside the enrolled range at %i Hz', rate => {
    const data = examples(rate).map(example => {
      if (example.label !== 'long') return example;
      const index = Number(example.id.split('-')[1]) - 1;
      return { ...example, frames: capture('long', index + 1, {
        rate, longSeconds: [1, 1.2, 1.4, 1.6][index], amplitudeScale: [0.8, 1, 1.2, 1.4][index],
      }) };
    });
    const { model, issues } = trainGestureModel({ ...config, sampleRate: rate }, DEFAULT_GESTURE_COMMANDS, data);
    expect(issues).toEqual([]);
    expect(model).not.toBeNull();
    for (const [seed, duration, amplitude] of [[33, 1.05, 0.85], [41, 1.3, 1.05], [65, 1.5, 1.3]]) {
      const prediction = recognizeGesture(model!, capture('long', seed, { rate, longSeconds: duration, amplitudeScale: amplitude }));
      expect(prediction.status, JSON.stringify(prediction)).toBe('recognized');
      expect(prediction.labelId).toBe('long');
    }
  });
});

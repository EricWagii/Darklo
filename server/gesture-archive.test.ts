import { describe, expect, it } from 'vitest';
import {
  createArchiveEntry,
  appendArchiveFrames,
  finishArchiveEntry,
  annotateArchiveEntry,
  serializeArchiveBundle,
  parseArchiveBundle,
  planArchiveImport,
  createGestureArchive,
  setArchiveTrainingIncluded,
  type ArchiveMeta,
} from '../client/src/lib/gesture-archive';
import type { GestureFrame, GesturePrediction } from '../client/src/lib/gesture-contract';

const frames: GestureFrame[] = [
  { receivedAtMs: 10, channels: [1, -2, 3] },
  { receivedAtMs: 10, channels: [2, -3, 4] },
];
const meta = (id = 'record-1'): ArchiveMeta => ({
  id, createdAt: 100, mode: 'single', windowCount: 1,
  config: { sampleRate: 1000, channel: 1, windowSeconds: 4, mainsHz: 50 },
  modelSnapshot: { version: 'demo-v2', examples: [{ id: 'example-1', label: 'water' }] },
});
const prediction: GesturePrediction = {
  status: 'unknown', reason: '弱动作尚未可靠区分', scores: [{ labelId: 'water', distance: 2 }],
  diagnostics: { rms: 0.01, valid: true },
};
const complete = (owner = 'alice', id = 'record-1') => finishArchiveEntry(
  appendArchiveFrames(createArchiveEntry(owner, meta(id)), 0, frames),
  { frameCount: 2, predictions: [prediction], expectedLabels: ['water'] },
);

describe('gesture archive integrity rules (pure data, not an IndexedDB persistence test)', () => {
  it('freezes the model and config at begin instead of retaining caller references', () => {
    const input = meta();
    const entry = createArchiveEntry('alice', input);
    input.config.channel = 2;
    (input.modelSnapshot as any).examples[0].label = 'changed';
    expect(entry.meta.config.channel).toBe(1);
    expect((entry.meta.modelSnapshot as any).examples[0].label).toBe('water');
    expect(entry.status).toBe('capturing');
  });

  it('preserves all three channels and repeated batch arrival times without truncation', () => {
    const entry = appendArchiveFrames(createArchiveEntry('alice', meta()), 0, frames);
    expect(entry.rawFrames).toEqual(frames);
    expect(entry.chunkSizes).toEqual([2]);
    frames[0].channels[0] = 9;
    expect(entry.rawFrames[0].channels[0]).toBe(1);
    frames[0].channels[0] = 1;
  });

  it('accepts only consecutive chunk indices and identical retries', () => {
    const entry = appendArchiveFrames(createArchiveEntry('alice', meta()), 0, frames);
    expect(appendArchiveFrames(entry, 0, structuredClone(frames))).toEqual(entry);
    expect(() => appendArchiveFrames(entry, 2, frames)).toThrow(/chunk|顺序/i);
    expect(() => appendArchiveFrames(entry, 0, [{ ...frames[0], channels: [99, 0, 0] }])).toThrow(/冲突|conflict/i);
  });

  it('rejects empty, non-finite, malformed and backwards-time frame chunks', () => {
    const entry = createArchiveEntry('alice', meta());
    expect(() => appendArchiveFrames(entry, 0, [])).toThrow();
    expect(() => appendArchiveFrames(entry, 0, [{ receivedAtMs: 0, channels: [0, NaN, 0] }])).toThrow();
    expect(() => appendArchiveFrames(entry, 0, [{ receivedAtMs: 0, channels: [1, 2] } as any])).toThrow();
    expect(() => appendArchiveFrames(entry, 0, [{ ...frames[0], receivedAtMs: 10 }, { ...frames[1], receivedAtMs: 9 }])).toThrow();
    expect(() => appendArchiveFrames(appendArchiveFrames(entry, 0, frames), 1, [{ ...frames[0], receivedAtMs: 9 }])).toThrow();
  });

  it('requires a matching committed frame count before declaring completion', () => {
    const entry = appendArchiveFrames(createArchiveEntry('alice', meta()), 0, frames);
    expect(() => finishArchiveEntry(entry, { frameCount: 3, predictions: [prediction] })).toThrow(/帧|frame/i);
    expect(finishArchiveEntry(entry, { frameCount: 2, predictions: [prediction] }).status).toBe('complete');
    expect(() => appendArchiveFrames(complete(), 1, frames)).toThrow();
  });

  it('preserves original predictions and refuses a conflicting second finish', () => {
    const entry = complete();
    expect(finishArchiveEntry(entry, entry.result!)).toEqual(entry);
    expect(() => finishArchiveEntry(entry, { frameCount: 2, predictions: [{ ...prediction, status: 'recognized', labelId: 'water' }] })).toThrow(/冲突|conflict/i);
    expect(entry.result?.predictions[0].status).toBe('unknown');
  });

  it('appends independent annotations without changing the prediction or model', async () => {
    const original = complete();
    const first = annotateArchiveEntry(original, ['water'], 100);
    const second = annotateArchiveEntry(first, ['unknown'], 101);
    expect(second.annotations).toEqual([
      { createdAt: 100, expectedLabels: ['water'] },
      { createdAt: 101, expectedLabels: ['unknown'] },
    ]);
    expect(second.result).toEqual(original.result);
    expect(second.meta).toEqual(original.meta);
    expect(original.annotations).toBeUndefined();
    expect(() => annotateArchiveEntry(original, [])).toThrow(/标签|label/i);
    expect(() => annotateArchiveEntry(createArchiveEntry('alice', meta()), ['water'])).toThrow();
    expect(await parseArchiveBundle(await serializeArchiveBundle('alice', [second]), 'alice')).toEqual([second]);
  });

  it('keeps interrupted and never-finished sessions exportable without claiming complete', async () => {
    const capturing = appendArchiveFrames(createArchiveEntry('alice', meta('live')), 0, frames);
    const interrupted = finishArchiveEntry(createArchiveEntry('alice', meta('cancelled')), {
      frameCount: 0, predictions: [], status: 'interrupted',
    });
    const entries = await parseArchiveBundle(await serializeArchiveBundle('alice', [capturing, interrupted]), 'alice');
    expect(entries.map((entry) => entry.status)).toEqual(['capturing', 'interrupted']);
    expect(entries[0].rawFrames).toEqual(frames);
  });

  it('round trips every raw frame, model snapshot, prediction and expected label', async () => {
    const entries = [complete()];
    const text = await serializeArchiveBundle('alice', entries);
    expect(await parseArchiveBundle(text, 'alice')).toEqual(entries);
  });

  it('rejects another owner even if their record ids match', async () => {
    const text = await serializeArchiveBundle('alice', [complete()]);
    await expect(parseArchiveBundle(text, 'bob')).rejects.toThrow(/用户|owner/i);
    expect(() => planArchiveImport([complete('bob')], [complete('alice')], 'bob')).toThrow(/用户|owner/i);
  });

  it('rejects tampering, malformed schemas and unsupported versions before import', async () => {
    const bundle = JSON.parse(await serializeArchiveBundle('alice', [complete()]));
    const modified = structuredClone(bundle);
    modified.entries[0].rawFrames[0].channels[0] += 1;
    await expect(parseArchiveBundle(JSON.stringify(modified), 'alice')).rejects.toThrow(/校验|checksum/i);
    const future = { ...bundle, version: 200 };
    await expect(parseArchiveBundle(JSON.stringify(future), 'alice')).rejects.toThrow(/版本|version/i);
    await expect(parseArchiveBundle('{"ownerId":"alice"}', 'alice')).rejects.toThrow();
  });

  it('plans atomic append imports, skips exact duplicates and rejects conflicts', () => {
    const previous = [complete()];
    const newEntry = complete('alice', 'record-2');
    expect(planArchiveImport(previous, [complete(), newEntry], 'alice')).toEqual({ entries: [newEntry], skipped: 1 });
    const conflict = complete();
    conflict.meta.label = 'changed';
    expect(() => planArchiveImport(previous, [newEntry, conflict], 'alice')).toThrow(/冲突|conflict/i);
    expect(previous).toEqual([complete()]);
  });

  it('rejects duplicate ids inside an import and snapshots that JSON cannot preserve', () => {
    expect(() => planArchiveImport([], [complete(), complete()], 'alice')).toThrow(/重复|duplicate/i);
    expect(() => createArchiveEntry('alice', { ...meta(), modelSnapshot: { loss: Infinity } })).toThrow();
    expect(() => createArchiveEntry('alice', { ...meta(), modelSnapshot: { fn: () => 0 } })).toThrow();
    expect(() => createArchiveEntry('', meta())).toThrow();
  });

  it('stores zero-frame model snapshots separately and preserves calibration grouping', async () => {
    const modelMeta = { ...meta('model-1'), mode: 'model' as const, windowCount: 0, calibrationId: 'calibration-1' };
    const entry = finishArchiveEntry(createArchiveEntry('alice', modelMeta), { frameCount: 0, predictions: [] });
    expect(entry.status).toBe('complete');
    expect(entry.meta.calibrationId).toBe('calibration-1');
    expect(await parseArchiveBundle(await serializeArchiveBundle('alice', [entry]), 'alice')).toEqual([entry]);
    expect(() => createArchiveEntry('alice', { ...modelMeta, modelSnapshot: undefined })).toThrow();
    expect(() => createArchiveEntry('alice', { ...meta(), windowCount: 0 })).toThrow();
    expect(() => appendArchiveFrames(createArchiveEntry('alice', modelMeta), 0, frames)).toThrow();
    expect(() => finishArchiveEntry(createArchiveEntry('alice', modelMeta), { frameCount: 0, predictions: [prediction] })).toThrow();
  });

  it('never silently drops non-JSON model values during export', async () => {
    const entry = complete();
    entry.meta.modelSnapshot = { transform: () => 0 };
    await expect(serializeArchiveBundle('alice', [entry])).rejects.toThrow(/JSON|快照/i);
  });

  it('keeps more than the previous 150000-frame ceiling and leaves separate modes independent', () => {
    const longFrames: GestureFrame[] = Array.from({ length: 150_001 }, (_, index) => ({ receivedAtMs: index, channels: [index, -index, 1] }));
    const sequence = appendArchiveFrames(createArchiveEntry('alice', { ...meta('sequence'), mode: 'sequence', windowCount: 40 }), 0, longFrames);
    const single = complete('alice', 'single');
    expect(sequence.rawFrames).toHaveLength(150_001);
    expect(sequence.rawFrames.at(-1)?.channels).toEqual([150_000, -150_000, 1]);
    expect(single.meta.mode).toBe('single');
    expect(single.rawFrames).toHaveLength(2);
  });

  it('never marks missing prediction windows complete but preserves interrupted work', () => {
    const entry = appendArchiveFrames(createArchiveEntry('alice', { ...meta(), mode: 'sequence', windowCount: 2 }), 0, frames);
    expect(() => finishArchiveEntry(entry, { frameCount: 2, predictions: [prediction] })).toThrow(/窗口|预测/i);
    expect(finishArchiveEntry(entry, { frameCount: 2, predictions: [prediction], status: 'interrupted' }).status).toBe('interrupted');
    expect(finishArchiveEntry(entry, { frameCount: 2, predictions: [prediction, prediction] }).status).toBe('complete');
    const training = appendArchiveFrames(createArchiveEntry('alice', { ...meta(), mode: 'training', label: 'water' }), 0, frames);
    expect(() => finishArchiveEntry(training, { frameCount: 2, predictions: [prediction] })).toThrow(/训练|预测/i);
    expect(finishArchiveEntry(training, { frameCount: 2, predictions: [] }).status).toBe('complete');
  });

  it('reports unavailable IndexedDB instead of silently pretending to persist in memory', async () => {
    expect(globalThis.indexedDB).toBeUndefined();
    await expect(createGestureArchive('alice').begin(meta())).rejects.toThrow(/IndexedDB/);
  });

  it('requires explicit owner rebinding and preserves the earliest owner and all signal/model content', async () => {
    const original = complete('old-account');
    const text = await serializeArchiveBundle('old-account', [original]);
    await expect(parseArchiveBundle(text, 'new-account')).rejects.toThrow(/owner|用户/i);
    const recovered = await parseArchiveBundle(text, 'new-account', { rebindOwner: true });
    expect(recovered[0].ownerId).toBe('new-account');
    expect(recovered[0].sourceOwnerId).toBe('old-account');
    expect(recovered[0].meta).toEqual(original.meta);
    expect(recovered[0].rawFrames).toEqual(original.rawFrames);
    expect(recovered[0].result).toEqual(original.result);
    const nextText = await serializeArchiveBundle('new-account', recovered);
    const twiceRecovered = await parseArchiveBundle(nextText, 'third-account', { rebindOwner: true });
    expect(twiceRecovered[0].sourceOwnerId).toBe('old-account');
    const sameOwner = await parseArchiveBundle(text, 'old-account', { rebindOwner: true });
    expect(sameOwner).toEqual([original]);
  });

  it('validates the source checksum before rebinding and keeps id-conflict protection', async () => {
    const text = await serializeArchiveBundle('old-account', [complete('old-account')]);
    const corrupt = JSON.parse(text);
    corrupt.entries[0].result.predictions[0].reason = 'tampered';
    await expect(parseArchiveBundle(JSON.stringify(corrupt), 'new-account', { rebindOwner: true })).rejects.toThrow(/校验|checksum/i);
    const recovered = await parseArchiveBundle(text, 'new-account', { rebindOwner: true });
    expect(() => planArchiveImport([complete('new-account')], recovered, 'new-account')).toThrow(/冲突/i);
  });

  it('excludes and reincludes training with an append-only history and full export', async () => {
    const training = finishArchiveEntry(appendArchiveFrames(createArchiveEntry('alice', {
      ...meta(), mode: 'training', label: 'water', calibrationId: 'cal-1',
    }), 0, frames), { frameCount: 2, predictions: [] });
    const excluded = setArchiveTrainingIncluded(training, false, 100);
    const included = setArchiveTrainingIncluded(excluded, true, 101);
    expect(included.trainingSelections).toEqual([{ createdAt: 100, included: false }, { createdAt: 101, included: true }]);
    expect(included.rawFrames).toEqual(training.rawFrames);
    expect(included.meta).toEqual(training.meta);
    expect(training.trainingSelections).toBeUndefined();
    expect(() => setArchiveTrainingIncluded(complete(), false)).toThrow(/训练/i);
    expect(() => setArchiveTrainingIncluded(training, 'false' as any)).toThrow();
    expect(await parseArchiveBundle(await serializeArchiveBundle('alice', [included]), 'alice')).toEqual([included]);
  });

  it('rejects unsupported capture durations at creation and import instead of restoring unusable configuration', async () => {
    expect(() => createArchiveEntry('alice', { ...meta(), config: { ...meta().config, windowSeconds: 3 } })).toThrow(/4|时长|窗口/i);
    const bundle = JSON.parse(await serializeArchiveBundle('alice', [complete()]));
    bundle.entries[0].meta.config.windowSeconds = 3;
    await expect(parseArchiveBundle(JSON.stringify(bundle), 'alice')).rejects.toThrow(/4|时长|窗口/i);
    expect(() => createArchiveEntry('alice', { ...meta(), config: { ...meta().config, channel: 0 } })).not.toThrow();
    expect(() => createArchiveEntry('alice', { ...meta(), config: { ...meta().config, channel: 2 } })).not.toThrow();
  });
});

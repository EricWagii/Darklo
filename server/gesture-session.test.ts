import { describe, expect, it } from 'vitest';
import { RawGestureCapture, splitGestureWindows, splitAvailableGestureWindows, summarizeGestureTrials } from '../client/src/lib/gesture-session';
import { DEFAULT_GESTURE_CONFIG, type GestureFrame, type GesturePrediction } from '../client/src/lib/gesture-contract';

const frame = (i: number): GestureFrame => ({ receivedAtMs: 1000 + Math.floor(i / 10) * 10, channels: [i, i, i] });
describe('recoverable independent gesture capture', () => {
  it('serializes chunk writes and finishes only after raw frames are committed', async () => {
    const chunks: number[][] = [];
    let settled = false;
    const capture = new RawGestureCapture(5, 2, async (_index, frames) => {
      await new Promise(resolve => setTimeout(resolve, 2));
      chunks.push(frames.map(f => f.channels[0]));
    });
    capture.done.then(() => { settled = true; });
    for (let i = 0; i < 8; i++) capture.push(frame(i));
    expect(settled).toBe(false);
    const result = await capture.done;
    expect(result.complete).toBe(true);
    expect(result.frames).toHaveLength(5);
    expect(chunks).toEqual([[0, 1], [2, 3], [4]]);
  });
  it('marks stopped captures incomplete and flushes their partial chunk', async () => {
    const chunks: GestureFrame[][] = [];
    const capture = new RawGestureCapture(5, 2, async (_index, frames) => { chunks.push(frames); });
    capture.push(frame(0));
    capture.stop();
    capture.push(frame(1));
    const result = await capture.done;
    expect(result.complete).toBe(false);
    expect(result.frames).toHaveLength(1);
    expect(chunks).toHaveLength(1);
  });
  it('does not report a successful capture when persistence fails', async () => {
    const capture = new RawGestureCapture(2, 1, async () => { throw new Error('quota'); });
    capture.push(frame(0)); capture.push(frame(1));
    const result = await capture.done;
    expect(result.complete).toBe(false);
    expect(result.saveError).toContain('quota');
  });
  it('creates stable physical-time windows despite batched browser timestamps', () => {
    const frames = Array.from({ length: 4000 }, (_, i) => frame(i));
    const windows = splitGestureWindows(frames, { ...DEFAULT_GESTURE_CONFIG, sampleRate: 500 }, 2);
    expect(windows.map(w => [w.startMs, w.endMs, w.frames.length])).toEqual([[0, 4000, 2000], [4000, 8000, 2000]]);
    expect(() => splitGestureWindows(frames.slice(1), { ...DEFAULT_GESTURE_CONFIG, sampleRate: 500 }, 2)).toThrow();
  });
  it('retains completed sequence windows when a later window is interrupted', () => {
    const config = { ...DEFAULT_GESTURE_CONFIG, sampleRate: 500 as const };
    const frames = Array.from({ length: 4500 }, (_, i) => frame(i));
    const windows = splitAvailableGestureWindows(frames, config);
    expect(windows).toHaveLength(2);
    expect(windows[1].frames.at(-1)).toEqual(frame(3999));
    expect(splitAvailableGestureWindows(frames.slice(0, 100), config)).toEqual([]);
  });
  it('counts rejection and wrong predictions in the denominator without using unlabelled trials', () => {
    const result = (status: GesturePrediction['status'], labelId?: string): GesturePrediction => ({ status, labelId, reason: '', scores: [], diagnostics: {} });
    expect(summarizeGestureTrials([
      { prediction: result('recognized', 'water'), expected: 'water' },
      { prediction: result('unknown'), expected: 'water' },
      { prediction: result('recognized', 'long'), expected: 'rest' },
      { prediction: result('recognized', 'long'), expected: '' },
    ])).toEqual({ labelled: 3, correct: 1, wrong: 1, rejected: 1, unlabelled: 1 });
  });
});

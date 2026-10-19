import type { GestureConfig, GestureFrame, GesturePrediction } from './gesture-contract';

interface CaptureOutcome {
  frames: GestureFrame[];
  complete: boolean;
  saveError?: string;
}

/** One writer per run. Classification must await done, including its final commit. */
export class RawGestureCapture {
  readonly done: Promise<CaptureOutcome>;
  private resolve!: (outcome: CaptureOutcome) => void;
  private frames: GestureFrame[] = [];
  private pending: GestureFrame[] = [];
  private chain: Promise<void> = Promise.resolve();
  private chunk = 0;
  private stopped = false;
  private saveError: string | undefined;

  constructor(
    private readonly targetFrames: number,
    private readonly chunkSize: number,
    private readonly append: (chunk: number, frames: GestureFrame[]) => Promise<void>,
  ) {
    if (!Number.isInteger(targetFrames) || targetFrames < 1 || !Number.isInteger(chunkSize) || chunkSize < 1) {
      throw new Error('录制长度无效');
    }
    this.done = new Promise(resolve => { this.resolve = resolve; });
  }

  get count() { return this.frames.length; }

  push(frame: GestureFrame) {
    if (this.stopped) return;
    this.frames.push(frame);
    this.pending.push(frame);
    if (this.pending.length >= this.chunkSize) this.flush();
    if (this.frames.length === this.targetFrames) this.stop();
  }

  private flush() {
    if (!this.pending.length) return;
    const frames = this.pending;
    const index = this.chunk++;
    this.pending = [];
    this.chain = this.chain.then(async () => {
      if (this.saveError) return;
      try { await this.append(index, frames); }
      catch (error) {
        this.saveError = error instanceof Error ? error.message : String(error);
        this.stop();
      }
    });
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.flush();
    void this.chain.then(() => this.resolve({
      frames: this.frames,
      complete: !this.saveError && this.frames.length === this.targetFrames,
      saveError: this.saveError,
    }));
  }
}

export function splitGestureWindows(frames: GestureFrame[], config: GestureConfig, count: number) {
  const size = config.sampleRate * config.windowSeconds;
  if (!Number.isInteger(size) || size < 1 || !Number.isInteger(count) || count < 1 || frames.length !== size * count) {
    throw new Error('录制不完整，不能把缺失的样本当作完整指令');
  }
  return Array.from({ length: count }, (_, index) => ({
    index,
    startMs: index * config.windowSeconds * 1000,
    endMs: (index + 1) * config.windowSeconds * 1000,
    frames: frames.slice(index * size, (index + 1) * size),
  }));
}

export function summarizeGestureTrials(trials: Array<{ prediction: GesturePrediction; expected: string }>) {
  const result = { labelled: 0, correct: 0, wrong: 0, rejected: 0, unlabelled: 0 };
  for (const { prediction, expected } of trials) {
    if (!expected) { result.unlabelled++; continue; }
    result.labelled++;
    const actual = prediction.status === 'recognized' ? prediction.labelId : prediction.status;
    if (actual === expected) result.correct++;
    else if (prediction.status === 'unknown' || prediction.status === 'invalid') result.rejected++;
    else result.wrong++;
  }
  return result;
}

export function splitAvailableGestureWindows(frames: GestureFrame[], config: GestureConfig) {
  const size = config.sampleRate * config.windowSeconds;
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('采集时长或采样率无效');
  const count = Math.floor(frames.length / size);
  return count === 0 ? [] : splitGestureWindows(frames.slice(0, count * size), config, count);
}

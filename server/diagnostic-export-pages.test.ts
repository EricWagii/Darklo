import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const readPage = (name: string) => fs.readFileSync(path.join(root, 'client/src/pages', name), 'utf8');

describe('diagnostic export controls', () => {
  it('exports complete raw and processed trials from silent recognition', () => {
    const source = readPage('RecognitionMode.tsx');
    expect(source).toContain('导出完整诊断包');
    expect(source).toContain('recognitionTrialsRef');
    expect(source).toContain('rawWaveform');
    expect(source).toContain('processedWaveform');
    expect(source).not.toContain('不含波形');
  });

  it('exports three-channel continuous samples and uses technical presentation copy', () => {
    const source = readPage('ContinuousCodeMode.tsx');
    expect(source).toContain('导出完整诊断包');
    expect(source).toContain('appendContinuousSample');
    expect(source).toContain('channel1');
    expect(source).toContain('channel2');
    expect(source).toContain('channel3');
    expect(source).toContain('ContinuousSessionReview');
    expect(source).toContain('buildContinuousSessionEvaluation');
    expect(source).toContain('evaluation: sessionEvaluation');
    expect(source).toContain('sessionIdRef');
    expect(source).toContain('sessionStartedAtRef');
    expect(source).toContain('rhythmCalibration:');
    expect(source).toContain('tentativeText');
    expect(source).toContain('结束并复核');
    expect(source).toContain('连续神经肌电时序解码');
    expect(source).toContain('基于个体化生物电校准，实现实时事件分割、时序编码与流式字符输出。');
    expect(source).not.toContain('长咬、短咬与停顿输入');
  });
});

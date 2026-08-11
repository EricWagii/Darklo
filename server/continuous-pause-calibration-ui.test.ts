import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'client/src/pages/ContinuousCodeMode.tsx'), 'utf8');

describe('continuous Morse pause calibration UI', () => {
  it('runs repeated SOS rhythm practice after duration calibration', () => {
    expect(source).toContain("| 'rhythmCalibration'");
    expect(source).toContain("rhythmCalibration: '校准输入节奏'");
    expect(source).toContain('RHYTHM_CALIBRATION_PATTERN');
    expect(source).toContain('RHYTHM_CALIBRATION_TARGET');
    expect(source).toContain('节奏练习');
    expect(source).toContain('... --- ...');
    expect(source).toContain('开始本轮');
    expect(source).toContain('结束本轮');
    expect(source).toContain('确认有效');
    expect(source).toContain('重来');
    expect(source).toContain('只有确认有效的轮次才会进入最终节奏模型');
  });

  it('retries mismatched practice and surfaces overlap warnings', () => {
    expect(source).toContain('finishRhythmCalibrationTrial');
    expect(source).toContain('resetRhythmCalibrationTrial');
    expect(source).toContain('acceptRhythmCalibrationTrial');
    expect(source).toContain('buildPauseTimingModel');
    expect(source).toContain('rhythmCalibrationWarning');
    expect(source).toContain('本轮节奏与 SOS 不一致');
  });

  it('passes the learned pause model into recognition without target leakage', () => {
    expect(source).toContain('pauseTimingModel: calibration.pauseTimingModel');
    expect(source).toContain('candidateCommitScoreWindow');
    const configBlock = source.slice(source.indexOf('const decoderConfig'), source.indexOf('const decoderConfigRef'));
    expect(configBlock).not.toContain('targetText');
  });
});

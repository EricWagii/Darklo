import { describe, expect, it } from 'vitest';
import {
  assessRecognitionCollectionsForBaseline,
  formatTrainingExclusions,
  summarizeRecognitionTraining,
} from './recognition-readiness';

const clearBurstCollection = (samplingRate: number) => {
  const ch2 = Array.from({ length: 512 }, (_, index) => {
    const offset = index - 220;
    return Math.abs(offset) <= 25
      ? 900 * Math.exp(-(offset * offset) / 180) * Math.sin(offset * 0.9)
      : 0;
  });
  return {
    waveform: { ch1: ch2.map((value) => value * 0.2), ch2, ch3: ch2.map((value) => value * 0.1) },
    preprocessingMeta: { pipelineVersion: 'resting-baseline-v3', requiresRestingBaseline: true },
    pipelineMetadata: {
      samplingRate,
      croppedLength: 1000,
      activityEvidence: {
        reliable: true,
        usable: true,
        sustainedRmsRatio: 3.2,
        thresholdRatio: 2.5,
        baselineRms: 0.2,
        reason: '原始肌电动作强于静息基线' as const,
      },
      startupArtifact: {
        detected: false,
        ambiguous: false,
        suppressedSamples: 0,
        artifactRatio: 1,
        stabilizationIndex: null,
        reason: '未检测到启动伪迹',
      },
    },
  };
};

describe('recognition training readiness', () => {
  it('excludes old 500 Hz templates before evaluating rhythm against a new 1000 Hz baseline', () => {
    const oldRate = clearBurstCollection(500);
    const currentRate = clearBurstCollection(1_000);
    const assessment = assessRecognitionCollectionsForBaseline([oldRate, currentRate], 1_000);
    expect(assessment.usableCollections).toEqual([currentRate]);
    expect(assessment.rejected).toHaveLength(1);
    expect(assessment.rejected[0].index).toBe(0);
    expect(assessment.rejected[0].reasons.join(' ')).toContain('当前静息基线');
    expect(assessment.rejected[0].reasons.join(' ')).toContain('重录');
  });

  it('keeps original sample indices when a mixed-rate command also has invalid current-rate templates', () => {
    const oldRate = clearBurstCollection(500);
    const weakCurrentRate = clearBurstCollection(1_000);
    weakCurrentRate.waveform = {
      ch1: Array(512).fill(0), ch2: Array(512).fill(0), ch3: Array(512).fill(0),
    };
    const validCurrentRate = clearBurstCollection(1_000);
    const assessment = assessRecognitionCollectionsForBaseline(
      [oldRate, weakCurrentRate, validCurrentRate], 1_000
    );
    expect(assessment.usableCollections).toEqual([validCurrentRate]);
    expect(assessment.rejected.map(({ index }) => index)).toEqual([0, 1]);
  });

  it('defers baseline-specific filtering until a valid baseline has loaded', () => {
    const template = clearBurstCollection(500);
    expect(assessRecognitionCollectionsForBaseline([template], undefined).usableCollections).toEqual([template]);
  });
  it('blocks recording before capture when saved samples were all rejected by the recognizer', () => {
    const status = summarizeRecognitionTraining({
      savedCommandCount: 4,
      usableCommandCount: 0,
      temporalModelApplicable: false,
      temporalModelReason: 'no usable profiles',
    });
    expect(status.canStart).toBe(false);
    expect(status.message).toContain('没有可用于识别的训练样本');
  });

  it('requires two usable commands to compare', () => {
    const status = summarizeRecognitionTraining({
      savedCommandCount: 4,
      usableCommandCount: 1,
      temporalModelApplicable: false,
      temporalModelReason: 'only one profile',
    });
    expect(status.canStart).toBe(false);
    expect(status.message).toContain('至少两个');
  });

  it('blocks a partial model when some saved commands have no usable templates', () => {
    const status = summarizeRecognitionTraining({
      savedCommandCount: 4,
      usableCommandCount: 2,
      temporalModelApplicable: true,
      temporalModelReason: 'remaining commands distinguishable',
    });
    expect(status.canStart).toBe(false);
    expect(status.message).toContain('2 个指令');
  });

  it('blocks testing when the burst model is not trained for every command', () => {
    const status = summarizeRecognitionTraining({
      savedCommandCount: 4,
      usableCommandCount: 4,
      temporalModelApplicable: false,
      temporalModelReason: '节律不稳定',
    });
    expect(status.canStart).toBe(false);
    expect(status.message).toContain('节律不稳定');
    expect(status.message).toContain('补充或重录');
  });

  it('starts only when all saved commands have usable samples and a complete model', () => {
    const status = summarizeRecognitionTraining({
      savedCommandCount: 4,
      usableCommandCount: 4,
      temporalModelApplicable: true,
      temporalModelReason: 'trained',
    });
    expect(status.canStart).toBe(true);
  });

  it('identifies which stored command is excluded because its pipeline version is old', () => {
    const message = formatTrainingExclusions([{ commandName: '长咬', rejected: [{
      index: 0,
      reasons: ['预处理版本不兼容，请重新采集'],
    }] }]);
    expect(message).toContain('长咬 第 1 条');
    expect(message).toContain('版本不兼容');
  });
});

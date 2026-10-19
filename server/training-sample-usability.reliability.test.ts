import { describe, expect, it, vi } from 'vitest';
import { handleCompleteCollectionV2, handleSaveAfterAnomalyRemoval } from '../client/src/lib/collection-handler-v2';
import {
  assessTrainingCollections,
  trimTrainingCollection,
  trimTrainingCollections,
} from '../client/src/lib/training-sample-usability';

const lowClarityWaveform = () => {
  const ch2 = Array.from({ length: 512 }, (_, index) => Math.sin(index * 0.8));
  return {
    ch1: ch2.map((value) => value * 0.2),
    ch2,
    ch3: ch2.map((value) => value * 0.1),
  };
};

const clearBurstWaveform = (centers = [170, 340]) => {
  const ch2 = Array.from({ length: 512 }, (_, index) => {
    return centers.reduce((sum, center) => {
      const offset = index - center;
      return sum + (Math.abs(offset) <= 25
        ? 900 * Math.exp(-(offset * offset) / 180) * Math.sin(offset * 0.9)
        : 0);
    }, 0);
  });
  return {
    ch1: ch2.map((value) => value * 0.2),
    ch2,
    ch3: ch2.map((value) => value * 0.1),
  };
};

const collection = (waveform: ReturnType<typeof clearBurstWaveform>) => ({
  waveform,
  preprocessingMeta: {
    pipelineVersion: 'resting-baseline-v3',
    requiresRestingBaseline: true,
  },
  pipelineMetadata: {
    croppedLength: 1000,
    finalLength: 512,
    samplingRate: 500,
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
});

describe('training sample usability at save time', () => {
  it('requires the new filtering version so old processed templates are not mixed with new test signals', () => {
    const currentTemplate = collection(clearBurstWaveform());
    const oldTemplate = {
      ...currentTemplate,
      preprocessingMeta: {
        ...currentTemplate.preprocessingMeta,
        pipelineVersion: 'resting-baseline-v2',
      },
    };
    const newTemplate = {
      ...currentTemplate,
      preprocessingMeta: {
        ...currentTemplate.preprocessingMeta,
        pipelineVersion: 'resting-baseline-v3',
      },
    };

    expect(assessTrainingCollections([oldTemplate]).usableCollections).toHaveLength(0);
    expect(assessTrainingCollections([oldTemplate]).rejected[0].reasons.join(' ')).toContain('版本');
    expect(assessTrainingCollections([newTemplate]).usableCollections).toHaveLength(1);
  });

  it('keeps clear 512-point bursts and rejects low-clarity samples with an explicit reason', () => {
    const good = collection(clearBurstWaveform());
    const weak = collection(lowClarityWaveform());
    const assessment = assessTrainingCollections([good, weak]);

    expect(assessment.usableCollections).toEqual([good]);
    expect(assessment.rejected).toHaveLength(1);
    expect(assessment.rejected[0].index).toBe(1);
    expect(assessment.rejected[0].reasons.join(' ')).toContain('动作清晰度');
  });

  it('rejects samples without the baseline preprocessing metadata required by recognition', () => {
    const { preprocessingMeta: _metadata, ...legacy } = collection(clearBurstWaveform());
    const assessment = assessTrainingCollections([legacy]);

    expect(assessment.usableCollections).toHaveLength(0);
    expect(assessment.rejected[0].reasons.join(' ')).toContain('静息基线');
  });

  it('rejects v3 samples without reliable activity evidence from the original signal', () => {
    const base = collection(clearBurstWaveform());
    const { activityEvidence: _missing, ...withoutEvidence } = base.pipelineMetadata;
    const absent = { ...base, pipelineMetadata: withoutEvidence };
    const quiet = {
      ...base,
      pipelineMetadata: {
        ...base.pipelineMetadata,
        activityEvidence: {
          ...base.pipelineMetadata.activityEvidence,
          usable: false,
          sustainedRmsRatio: 1.1,
          reason: '原始肌电强度与静息基线无明显差异' as const,
        },
      },
    };

    expect(assessTrainingCollections([absent]).usableCollections).toHaveLength(0);
    expect(assessTrainingCollections([quiet]).usableCollections).toHaveLength(0);
    expect(assessTrainingCollections([absent]).rejected[0].reasons.join(' ')).toContain('静息基线');
    expect(assessTrainingCollections([quiet]).rejected[0].reasons.join(' ')).toContain('静息基线');
  });

  it('requires the measured sampling rate that defines physical action duration', () => {
    const base = collection(clearBurstWaveform());
    const { samplingRate: _missing, ...withoutRate } = base.pipelineMetadata;
    const missing = { ...base, pipelineMetadata: withoutRate };
    const unsupported = { ...base, pipelineMetadata: { ...base.pipelineMetadata, samplingRate: 750 } };
    const oneKilohertz = { ...base, pipelineMetadata: { ...base.pipelineMetadata, samplingRate: 1000 } };

    expect(assessTrainingCollections([missing]).usableCollections).toHaveLength(0);
    expect(assessTrainingCollections([unsupported]).usableCollections).toHaveLength(0);
    expect(assessTrainingCollections([oneKilohertz]).usableCollections).toHaveLength(1);
    expect(assessTrainingCollections([missing]).rejected[0].reasons.join(' ')).toContain('采样率');
  });

  it('rejects a training sample below the test-processing quality gate', () => {
    const base = collection(clearBurstWaveform());
    const item = {
      ...base,
      pipelineMetadata: { ...base.pipelineMetadata, qualityScore: 25 },
    };
    const assessment = assessTrainingCollections([item]);

    expect(assessment.usableCollections).toHaveLength(0);
    expect(assessment.rejected[0].reasons.join(' ')).toContain('处理质量');
  });

  it('resamples a manual trim to 512 points and updates original-time cropped length', () => {
    const original = collection(clearBurstWaveform());
    const result = trimTrainingCollection(original, 128, 384);

    expect(result.error).toBeNull();
    expect(result.collection?.waveform.ch1).toHaveLength(512);
    expect(result.collection?.waveform.ch2).toHaveLength(512);
    expect(result.collection?.waveform.ch3).toHaveLength(512);
    expect(result.collection?.pipelineMetadata?.croppedLength).toBe(500);
    expect(result.collection?.pipelineMetadata?.finalLength).toBe(512);
    expect(original.pipelineMetadata.croppedLength).toBe(1000);
  });

  it('marks duration unavailable if the original cropped length is unknown', () => {
    const base = collection(clearBurstWaveform());
    const { croppedLength: _unknown, ...pipelineMetadata } = base.pipelineMetadata;
    const result = trimTrainingCollection({ ...base, pipelineMetadata }, 128, 384);

    expect(result.error).toBeNull();
    expect(result.collection?.pipelineMetadata?.croppedLength).toBeUndefined();
    expect(result.collection?.pipelineMetadata?.durationReliable).toBe(false);
  });

  it('refuses a manual trim that removes the muscle action', () => {
    const original = collection(clearBurstWaveform([280]));
    const result = trimTrainingCollection(original, 0, 64);

    expect(result.collection).toBeNull();
    expect(result.error).toContain('动作');
    expect(original.waveform.ch2).toHaveLength(512);
  });

  it('does not reuse full-capture activity evidence after a trim removes a different action burst', () => {
    const original = collection(clearBurstWaveform([170, 340]));
    const result = trimTrainingCollection(original, 300, 390);

    expect(result.collection).toBeNull();
    expect(result.error).toMatch(/动作次数|动作能量/);
  });

  it('refuses too-short manual trims before interpolating them into false long actions', () => {
    const result = trimTrainingCollection(collection(clearBurstWaveform()), 160, 176);

    expect(result.collection).toBeNull();
    expect(result.error).toContain('过短');
  });

  it('resamples every automatically trimmed template and updates each physical duration', () => {
    const first = collection(clearBurstWaveform([170]));
    const second = collection(clearBurstWaveform([340]));
    const result = trimTrainingCollections([first, second], 128, 384);

    expect(result.error).toBeNull();
    expect(result.collections).toHaveLength(2);
    expect(result.collections?.every((item) => item.waveform.ch2.length === 512)).toBe(true);
    expect(result.collections?.map((item) => item.pipelineMetadata?.croppedLength)).toEqual([500, 500]);
    expect(first.waveform.ch2).toHaveLength(512);
    expect(second.pipelineMetadata.croppedLength).toBe(1000);
  });

  it('rejects an entire automatic trim when one sample loses its action', () => {
    const first = collection(clearBurstWaveform([170]));
    const second = collection(clearBurstWaveform([450]));
    const result = trimTrainingCollections([first, second], 128, 384);

    expect(result.collections).toBeNull();
    expect(result.error).toContain('第 2 条');
    expect(result.error).toContain('动作');
    expect(first.pipelineMetadata.croppedLength).toBe(1000);
    expect(second.waveform.ch2).toHaveLength(512);
  });

  it('rejects an automatic trim when both samples retain actions but acquire different burst counts', () => {
    const first = collection(clearBurstWaveform([170, 340]));
    const second = collection(clearBurstWaveform([170, 450]));
    const result = trimTrainingCollections([first, second], 128, 384);

    expect(result.collections).toBeNull();
    expect(result.error).toContain('动作次数');
    expect(first.waveform.ch2).toHaveLength(512);
    expect(second.pipelineMetadata.croppedLength).toBe(1000);
  });

  it('rejects a batch whose samples would all be filtered out by recognition', async () => {
    const saveCommand = vi.fn();
    const result = await handleCompleteCollectionV2({
      commandName: '短咬牙',
      collectionHistory: Array.from({ length: 5 }, (_, index) => ({
        index,
        timestamp: new Date(),
        waveform: lowClarityWaveform(),
        preprocessingMeta: {
          pipelineVersion: 'resting-baseline-v3',
          requiresRestingBaseline: true,
        },
        pipelineMetadata: {
          samplingRate: 500,
          activityEvidence: collection(lowClarityWaveform()).pipelineMetadata.activityEvidence,
          startupArtifact: {
            detected: false,
            ambiguous: false,
            suppressedSamples: 0,
            artifactRatio: 1,
            stabilizationIndex: null,
            reason: '未检测到启动伪迹',
          },
        },
      })),
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: {
        getCommand: vi.fn().mockResolvedValue(null),
        saveCommand,
      },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('动作清晰度');
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it('rejects every sample when five individually clear actions have no stable burst count', () => {
    const samples = [[256], [170, 340], [128, 256, 384], [256], [170, 340]]
      .map((centers) => collection(clearBurstWaveform(centers)));
    const assessment = assessTrainingCollections(samples);

    expect(assessment.usableCollections).toHaveLength(0);
    expect(assessment.rejected.map((item) => item.index)).toEqual([0, 1, 2, 3, 4]);
    expect(assessment.rejected[0].reasons.join(' ')).toContain('动作次数');
    expect(assessment.rejected[0].reasons.join(' ')).toContain('重录');
  });

  it('rejects the minority actions even when the burst count has a stable majority', () => {
    const samples = [[256], [256], [170, 340], [256], [170, 340]]
      .map((centers) => collection(clearBurstWaveform(centers)));
    const assessment = assessTrainingCollections(samples);

    expect(assessment.usableCollections).toEqual([samples[0], samples[1], samples[3]]);
    expect(assessment.rejected.map((item) => item.index)).toEqual([2, 4]);
    expect(assessment.rejected[0].reasons.join(' ')).toContain('动作次数');
  });

  it('allows a single clear action to remain provisional while the command is being collected', () => {
    const sample = collection(clearBurstWaveform([256]));
    expect(assessTrainingCollections([sample]).usableCollections).toEqual([sample]);
  });

  it('refuses to save a new command with individually usable but rhythmically inconsistent samples', async () => {
    const saveCommand = vi.fn();
    const result = await handleCompleteCollectionV2({
      commandName: '咬牙指令',
      collectionHistory: [[256], [170, 340], [128, 256, 384], [256], [170, 340]]
        .map((centers, index) => ({ ...collection(clearBurstWaveform(centers)), index, timestamp: new Date() })),
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(null), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('动作次数');
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it('refuses continued collection when new v3 actions conflict with usable existing v3 templates', async () => {
    const saveCommand = vi.fn();
    const existing = {
      id: 'cmd-existing', name: '咬牙指令',
      collections: Array.from({ length: 5 }, () => collection(clearBurstWaveform([256]))),
    };
    const result = await handleCompleteCollectionV2({
      commandName: '咬牙指令',
      collectionHistory: Array.from({ length: 3 }, (_, index) => ({
        ...collection(clearBurstWaveform([170, 340])), index, timestamp: new Date(),
      })),
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(existing), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('动作次数');
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it('refuses an appended batch that would leave the merged command below 60% rhythm consistency', async () => {
    const saveCommand = vi.fn();
    const existing = {
      id: 'cmd-existing', name: '咬牙指令',
      collections: Array.from({ length: 3 }, () => collection(clearBurstWaveform([256]))),
    };
    const result = await handleCompleteCollectionV2({
      commandName: '咬牙指令',
      collectionHistory: Array.from({ length: 3 }, (_, index) => ({
        ...collection(clearBurstWaveform([170, 340])), index, timestamp: new Date(),
      })),
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(existing), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('稳定多数');
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it('does not let legacy v1 templates veto a new v3 batch for the same command', async () => {
    const saveCommand = vi.fn();
    const v1 = collection(clearBurstWaveform([256]));
    const existing = {
      id: 'cmd-existing', name: '咬牙指令',
      collections: Array.from({ length: 5 }, () => ({
        ...v1,
        preprocessingMeta: { ...v1.preprocessingMeta, pipelineVersion: 'resting-baseline-v1' },
      })),
    };
    const result = await handleCompleteCollectionV2({
      commandName: '咬牙指令',
      collectionHistory: Array.from({ length: 5 }, (_, index) => ({
        ...collection(clearBurstWaveform([170, 340])), index, timestamp: new Date(),
      })),
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(existing), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    });

    expect(result.success).toBe(true);
    expect(saveCommand).toHaveBeenCalledOnce();
  });

  it('does not let old 500 Hz templates veto a new 1000 Hz batch during device-rate migration', async () => {
    const saveCommand = vi.fn();
    const existing = {
      id: 'cmd-existing', name: '咬牙指令',
      collections: Array.from({ length: 5 }, () => collection(clearBurstWaveform([170, 340]))),
    };
    const additions = Array.from({ length: 5 }, (_, index) => ({
      ...collection(clearBurstWaveform([256])),
      index,
      timestamp: new Date(),
      pipelineMetadata: { ...collection(clearBurstWaveform([256])).pipelineMetadata, samplingRate: 1_000 },
    }));
    const result = await handleCompleteCollectionV2({
      commandName: '咬牙指令',
      collectionHistory: additions,
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(existing), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    });

    expect(result.success).toBe(true);
    expect(saveCommand).toHaveBeenCalledOnce();
  });

  it('ignores old templates that are incompatible with part of the new rate-compatible batch', async () => {
    const saveCommand = vi.fn();
    const oldSample = collection(clearBurstWaveform([170, 340]));
    const existing = {
      id: 'cmd-existing', name: '咬牙指令',
      collections: Array.from({ length: 5 }, () => ({
        ...oldSample,
        pipelineMetadata: { ...oldSample.pipelineMetadata, samplingRate: 560 },
      })),
    };
    const additions = Array.from({ length: 5 }, (_, index) => {
      const sample = collection(clearBurstWaveform([256]));
      return {
        ...sample,
        index,
        timestamp: new Date(),
        pipelineMetadata: { ...sample.pipelineMetadata, samplingRate: index < 3 ? 400 : 480 },
      };
    });
    const result = await handleCompleteCollectionV2({
      commandName: '咬牙指令',
      collectionHistory: additions,
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(existing), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    });

    expect(result.success).toBe(true);
    expect(saveCommand).toHaveBeenCalledOnce();
  });

  it('rejects a newly collected batch that mixes 500 and 1000 Hz samples', async () => {
    const saveCommand = vi.fn();
    const additions = Array.from({ length: 5 }, (_, index) => ({
      ...collection(clearBurstWaveform([256])),
      index,
      timestamp: new Date(),
      pipelineMetadata: {
        ...collection(clearBurstWaveform([256])).pipelineMetadata,
        samplingRate: index < 3 ? 500 : 1_000,
      },
    }));
    const result = await handleCompleteCollectionV2({
      commandName: '咬牙指令',
      collectionHistory: additions,
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(null), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('采样档位');
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it('checks the combined rhythm after removing anomalies, before saving the remaining batch', async () => {
    const saveCommand = vi.fn();
    const sources = Array.from({ length: 3 }, (_, index) => ({
      ...collection(clearBurstWaveform([170, 340])), index, timestamp: new Date(),
    }));
    const existing = {
      id: 'cmd-existing', name: '咬牙指令',
      collections: Array.from({ length: 5 }, () => collection(clearBurstWaveform([256]))),
    };
    const result = await handleSaveAfterAnomalyRemoval({
      commandName: '咬牙指令',
      collectionHistory: sources,
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(existing), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    }, sources.map((source) => ({ ...source.waveform, meta: {} })), []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('动作次数');
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it('keeps the five-sample minimum after anomaly removal for a new command', async () => {
    const saveCommand = vi.fn();
    const sources = Array.from({ length: 4 }, (_, index) => ({
      ...collection(clearBurstWaveform([256])), index, timestamp: new Date(),
    }));
    const result = await handleSaveAfterAnomalyRemoval({
      commandName: '新指令',
      collectionHistory: sources,
      currentUser: { userId: 'user-1', userName: 'Tester' },
      emgDatabase: { getCommand: vi.fn().mockResolvedValue(null), saveCommand },
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      operationLogger: { log: vi.fn() },
    }, sources.map((source) => ({ ...source.waveform, meta: {} })), []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('至少需要 5 条');
    expect(saveCommand).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { getTestCaptureDurationSeconds, getTrainingCaptureDurationSeconds } from '../client/src/lib/recognition-capture-duration';
import { processTestWaveform } from '../client/src/lib/recognition-processing';
import { assessTestBurstActivity, buildTemporalBurstModel, recognizeTemporalBurst } from '../client/src/lib/temporal-burst-recognition';
import { assessTrainingCollections, TRAINING_PIPELINE_VERSION } from '../client/src/lib/training-sample-usability';
import { isProcessingAcceptable } from '../client/src/lib/recognition-processing';
import { processWaveformUnified } from '../client/src/lib/unified-waveform-pipeline';

const makeWaveform = (samplingRate: number, contractionSeconds: number) => {
  const ch2 = Array.from({ length: 3 * samplingRate }, (_, index) => {
    const seconds = index / samplingRate;
    const rest = 1.2 * Math.sin(2 * Math.PI * 34 * seconds);
    const contraction = seconds >= 0.7 && seconds < 0.7 + contractionSeconds
      ? 100 * Math.sin(2 * Math.PI * 80 * seconds + 1.2)
      : 0;
    return rest + contraction;
  });
  return { ch1: ch2.map(value => value * 0.45), ch2, ch3: ch2.map(value => value * 0.18) };
};

const makeBaseline = (samplingRate: number) => {
  const ch2 = Array.from({ length: samplingRate }, (_, index) =>
    1.2 * Math.sin(2 * Math.PI * 34 * index / samplingRate)
  );
  return { ch1: ch2.map(value => value * 0.45), ch2, ch3: ch2.map(value => value * 0.18) };
};

const makePatternWaveform = (
  samplingRate: number,
  bursts: Array<[number, number]>,
  frequency: number,
  phase: number,
) => {
  const ch2 = Array.from({ length: Math.round(2.4 * samplingRate) }, (_, index) => {
    const seconds = index / samplingRate;
    const rest = 1.2 * Math.sin(2 * Math.PI * 34 * seconds);
    const contraction = bursts.some(([start, end]) => seconds >= start && seconds < end)
      ? 100 * Math.sin(2 * Math.PI * frequency * seconds + phase)
      : 0;
    return rest + contraction;
  });
  return { ch1: ch2.map(value => value * 0.45), ch2, ch3: ch2.map(value => value * 0.18) };
};

describe('dynamic sample-rate waveform processing', () => {
  it('retains the source rate and comparable physical crop for 500 and 1000 Hz training', () => {
    const durations: Record<number, Record<number, number>> = {};
    const burstDurations: Record<number, Record<number, number>> = {};
    for (const contractionSeconds of [0.18, 0.55]) {
      durations[contractionSeconds] = {};
      burstDurations[contractionSeconds] = {};
      for (const samplingRate of [500, 1_000]) {
        const result = processWaveformUnified(makeWaveform(samplingRate, contractionSeconds), {
          targetLength: 512,
          samplingRate,
          restingBaseline: makeBaseline(samplingRate),
        });
        expect(result.metadata.samplingRate).toBe(samplingRate);
        expect(result.metadata.croppedLength).toBe(
          result.metadata.cropRange.endIdx - result.metadata.cropRange.startIdx + 1
        );
        const duration = getTrainingCaptureDurationSeconds({ pipelineMetadata: result.metadata });
        expect(duration).toBeDefined();
        durations[contractionSeconds][samplingRate] = duration!;
        const activity = assessTestBurstActivity(result.processed.ch2, result.metadata.activityEvidence, duration);
        expect(activity.usable).toBe(true);
        expect(activity.features.burstCount).toBe(1);
        burstDurations[contractionSeconds][samplingRate] = activity.features.meanBurstDurationSeconds!;
      }
      expect(
        Math.abs(durations[contractionSeconds][500] - durations[contractionSeconds][1_000]),
        `${contractionSeconds}s crop durations: ${JSON.stringify(durations[contractionSeconds])}`
      )
        .toBeLessThan(0.08);
      expect(
        Math.abs(burstDurations[contractionSeconds][500] - burstDurations[contractionSeconds][1_000]),
        `${contractionSeconds}s burst durations: ${JSON.stringify(burstDurations[contractionSeconds])}`
      ).toBeLessThan(0.10);
    }
    expect(burstDurations[0.55][500] - burstDurations[0.18][500]).toBeGreaterThan(0.20);
    expect(burstDurations[0.55][1_000] - burstDurations[0.18][1_000]).toBeGreaterThan(0.20);
  });

  it('passes measured rate through test processing and derives duration before resampling', () => {
    for (const samplingRate of [500, 1_000]) {
      const waveform = makeWaveform(samplingRate, 0.55);
      const processed = processTestWaveform(
        waveform.ch1, waveform.ch2, waveform.ch3, makeBaseline(samplingRate), samplingRate
      );
      expect(processed.meta.samplingRate).toBe(samplingRate);
      expect(processed.ch2).toHaveLength(512);
      const duration = getTestCaptureDurationSeconds(processed);
      expect(duration).toBeDefined();
      expect(duration).toBeGreaterThan(0.5);
      expect(duration).toBeLessThan(0.9);
      expect(assessTestBurstActivity(processed.ch2, processed.meta.activityEvidence, duration).usable).toBe(true);
    }
  });

  it('trains and independently recognizes all four gesture patterns at 1000 Hz', () => {
    const samplingRate = 1_000;
    const baseline = makeBaseline(samplingRate);
    const patterns: Array<{ name: string; bursts: Array<[number, number]>; count: number }> = [
      { name: '短咬', bursts: [[0.7, 0.88]], count: 1 },
      { name: '长咬', bursts: [[0.7, 1.25]], count: 1 },
      { name: '双短', bursts: [[0.65, 0.83], [1.10, 1.28]], count: 2 },
      { name: '三短', bursts: [[0.55, 0.72], [0.95, 1.12], [1.35, 1.52]], count: 3 },
    ];
    const commands = patterns.map(({ name, bursts }) => {
      const collections = [
        makePatternWaveform(samplingRate, bursts, 80, 0),
        makePatternWaveform(samplingRate, bursts, 90, 1.2),
      ].map(waveform => {
        const processed = processWaveformUnified(waveform, {
          targetLength: 512, samplingRate, restingBaseline: baseline,
        });
        return {
          waveform: processed.processed,
          pipelineMetadata: processed.metadata,
          preprocessingMeta: { pipelineVersion: TRAINING_PIPELINE_VERSION, requiresRestingBaseline: true },
        };
      });
      const assessment = assessTrainingCollections(collections);
      expect(assessment.rejected, `${name} training: ${JSON.stringify(assessment.rejected)}`).toHaveLength(0);
      expect(assessment.usableCollections).toHaveLength(2);
      return {
        name,
        signals: assessment.usableCollections.map(collection => collection.waveform.ch2),
        captureDurationsSeconds: assessment.usableCollections.map(getTrainingCaptureDurationSeconds),
      };
    });
    const model = buildTemporalBurstModel(commands);
    expect(model.applicable, `model: ${model.reason}; ${JSON.stringify(model.profiles)}`).toBe(true);

    for (const { name, bursts, count } of patterns) {
      for (const [frequency, phase] of [[70, 0.5], [85, 2]]) {
        const waveform = makePatternWaveform(samplingRate, bursts, frequency, phase);
        const processed = processTestWaveform(
          waveform.ch1, waveform.ch2, waveform.ch3, baseline, samplingRate
        );
        const duration = getTestCaptureDurationSeconds(processed);
        expect(isProcessingAcceptable(processed), `${name} ${frequency}Hz processing`).toBe(true);
        const activity = assessTestBurstActivity(processed.ch2, processed.meta.activityEvidence, duration);
        expect(activity.usable, `${name} ${frequency}Hz activity: ${activity.reason}`).toBe(true);
        expect(activity.features.burstCount, `${name} ${frequency}Hz burst count`).toBe(count);
        const recognition = recognizeTemporalBurst(processed.ch2, model, duration);
        expect(recognition?.command, `${name} ${frequency}Hz scores: ${JSON.stringify(recognition?.scores)}`).toBe(name);
      }
    }
  });
});

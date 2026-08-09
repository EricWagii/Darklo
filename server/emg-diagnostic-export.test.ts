import { describe, expect, it } from 'vitest';
import {
  buildContinuousDiagnosticPackage,
  buildRecognitionDiagnosticPackage,
  createContinuousSampleCapture,
  appendContinuousSample,
} from '../client/src/lib/emg-diagnostic-export';

describe('complete EMG diagnostic exports', () => {
  it('preserves original and processed recognition waveforms and training collections', () => {
    const trial = {
      trialId: 'trial-1',
      startedAt: 10,
      endedAt: 20,
      rawWaveform: { ch1: [1], ch2: [2], ch3: [3], timestamps: [10] },
      processedWaveform: { ch1: [4], ch2: [5], ch3: [6], meta: { stage: 'success' } },
      result: { predictedCommand: 'play', confidence: 88 },
    };
    const commands = [{ name: 'play', collections: [{ waveform: { ch1: [7], ch2: [8], ch3: [9] } }] }];

    const payload = buildRecognitionDiagnosticPackage({
      trials: [trial],
      commands,
      sampleRate: 500,
    });

    expect(payload.sourcePage).toBe('silent-recognition');
    expect(payload.trials[0].rawWaveform.ch2).toEqual([2]);
    expect(payload.trials[0].processedWaveform?.ch2).toEqual([5]);
    expect(payload.trainingCommands[0].collections[0].waveform.ch2).toEqual([8]);
  });

  it('keeps continuous sample columns aligned and reports truncation explicitly', () => {
    let capture = createContinuousSampleCapture(2);
    capture = appendContinuousSample(capture, {
      timestamp: 1,
      ch1: 10,
      ch2: 20,
      ch3: 30,
      envelope: 2,
      startThreshold: 3,
      endThreshold: 1,
      isActive: false,
      isBlocked: false,
      phase: 'baseline',
    });
    capture = appendContinuousSample(capture, {
      timestamp: 2,
      ch1: 11,
      ch2: 21,
      ch3: 31,
      envelope: 4,
      startThreshold: 5,
      endThreshold: 2,
      isActive: true,
      isBlocked: false,
      phase: 'decoding',
    });
    capture = appendContinuousSample(capture, {
      timestamp: 3,
      ch1: 12,
      ch2: 22,
      ch3: 32,
      envelope: 6,
      startThreshold: 7,
      endThreshold: 3,
      isActive: false,
      isBlocked: true,
      phase: 'decoding',
    });

    const lengths = Object.values(capture.columns).map((values) => values.length);
    expect(new Set(lengths)).toEqual(new Set([2]));
    expect(capture.captureTruncated).toBe(true);

    const payload = buildContinuousDiagnosticPackage({
      capture,
      sampleRate: 500,
      sourceChannel: 'CH2',
      phase: 'decoding',
      paceMode: 'slow',
      evaluationProtocol: { mode: 'scripted', targetText: 'A' },
      decoderConfig: null,
      calibration: null,
      baselineSamples: [],
      baselineStats: null,
      shortDurationsMs: [],
      longDurationsMs: [],
      decoder: { committedText: 'A', pendingSymbols: '', events: [] },
      timeline: [],
      evaluation: {
        mode: 'scripted',
        targetText: 'A',
        predictedText: 'A',
        actualText: 'A',
        verdict: 'correct',
        includeInAccuracy: true,
        submittedAt: 100,
        metrics: { referenceLength: 1, predictedLength: 1, editDistance: 0, cer: 0, characterAccuracy: 1, exactMatch: true },
        alignment: [{ type: 'match', expected: 'A', predicted: 'A', expectedIndex: 0, predictedIndex: 0 }],
        eventCorrections: [],
      },
    });

    expect(payload.sourcePage).toBe('continuous-neuromuscular-decoder');
    expect(payload.session.evaluationProtocol).toEqual({ mode: 'scripted', targetText: 'A' });
    expect(payload.sampleCapture.captureTruncated).toBe(true);
    expect(payload.sampleCapture.columns.ch3).toEqual([30, 31]);
    expect(payload.evaluation?.targetText).toBe('A');
    expect(payload.evaluation?.metrics.characterAccuracy).toBe(1);
    expect(payload.evaluation?.includeInAccuracy).toBe(true);
  });
});

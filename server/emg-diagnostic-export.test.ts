import { describe, expect, it } from 'vitest';
import {
  buildContinuousDiagnosticPackage,
  buildRecognitionDiagnosticPackage,
  createContinuousSampleCapture,
  appendContinuousSample,
  createContinuousSessionId,
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

  it('does not duplicate a processed waveform inside the recognition result', () => {
    const processedWaveform = { ch1: [4], ch2: [5], ch3: [6], meta: { stage: 'success' } };
    const payload = buildRecognitionDiagnosticPackage({
      trials: [{
        trialId: 'trial-compact',
        startedAt: 10,
        endedAt: 20,
        rawWaveform: { ch1: [1], ch2: [2], ch3: [3], timestamps: [10] },
        processedWaveform,
        result: { predictedCommand: 'play', confidence: 88, processedWaveform },
      }],
      commands: [],
      sampleRate: 500,
    });

    expect(payload.trials[0].processedWaveform).toEqual(processedWaveform);
    expect(payload.trials[0].result).not.toHaveProperty('processedWaveform');
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
      sessionId: 'continuous-session-1',
      sessionStartedAt: '2026-08-10T09:00:00.000Z',
      sessionEndedAt: '2026-08-10T09:01:00.000Z',
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
      rhythmCalibration: {
        pattern: '...---...',
        acceptedAttempts: 3,
        targetAttempts: 3,
        withinCharacterGapsMs: [400, 420, 450, 470],
        betweenCharacterGapsMs: [1_200, 1_250],
        warning: null,
      },
      decoder: {
        committedText: 'A',
        pendingSymbols: '',
        candidates: [{ committedText: 'A', pendingSymbols: '', score: -2 }],
        events: [
          { id: 'b1', kind: 'candidate-boundary', at: 1_200 },
          { id: 'u1', kind: 'uncertain', at: 1_400, alternatives: [{ symbol: '.', scoreAdjustment: -0.2 }, { symbol: '-', scoreAdjustment: -1.8 }] },
          { id: 'c1', kind: 'character-committed', at: 1_600, character: 'A', code: '.-' },
        ],
      },
      tentativeText: 'B',
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
    expect(payload.version).toBe('2.1');
    expect(payload.session.sessionId).toBe('continuous-session-1');
    expect(payload.session.wallClock).toEqual({
      startedAt: '2026-08-10T09:00:00.000Z',
      endedAt: '2026-08-10T09:01:00.000Z',
    });
    expect(payload.timing.clockDomain).toBe('monotonic-session-ms');
    expect(payload.timing.sampleRange).toEqual({ firstMs: 1, lastMs: 2, elapsedMs: 1 });
    expect(payload.timing.rhythmCalibration?.betweenCharacterGapsMs).toEqual([1_200, 1_250]);
    expect(payload.adaptiveDecoding.candidateScores[0].score).toBe(-2);
    expect(payload.adaptiveDecoding.boundaryDecisions[0].kind).toBe('candidate-boundary');
    expect(payload.adaptiveDecoding.pulseAlternatives[0].alternatives).toHaveLength(2);
    expect(payload.adaptiveDecoding.tentativeOutput).toBe('B');
    expect(payload.adaptiveDecoding.finalStableOutput).toBe('A');
    expect(payload.session.evaluationProtocol).toEqual({ mode: 'scripted', targetText: 'A' });
    expect(payload.sampleCapture.captureTruncated).toBe(true);
    expect(payload.sampleCapture.columns.ch3).toEqual([30, 31]);
    expect(payload.evaluation?.targetText).toBe('A');
    expect(payload.evaluation?.metrics.characterAccuracy).toBe(1);
    expect(payload.evaluation?.includeInAccuracy).toBe(true);
  });

  it('creates distinct portable session ids for repeated attempts', () => {
    const first = createContinuousSessionId();
    const second = createContinuousSessionId();
    expect(first).toMatch(/^continuous-/);
    expect(second).toMatch(/^continuous-/);
    expect(first).not.toBe(second);
  });
});

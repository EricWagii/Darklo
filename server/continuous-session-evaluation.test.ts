import { describe, expect, it } from 'vitest';
import {
  buildContinuousSessionEvaluation,
  evaluateContinuousText,
  normalizeEvaluationText,
  upsertEventCorrection,
} from '../client/src/lib/continuous-session-evaluation';

describe('continuous session evaluation', () => {
  it('normalizes evaluation text to the supported uppercase alphabet', () => {
    expect(normalizeEvaluationText(' Darklo-27 / sos! ')).toBe('DARKLO27 SOS');
  });

  it('reports exact-match accuracy against the actual text', () => {
    const result = evaluateContinuousText('SOS', 'SOS');

    expect(result.metrics).toEqual({
      referenceLength: 3,
      predictedLength: 3,
      editDistance: 0,
      cer: 0,
      characterAccuracy: 1,
      exactMatch: true,
    });
    expect(result.alignment.every((operation) => operation.type === 'match')).toBe(true);
  });

  it('aligns substitutions, insertions, and deletions for diagnosis', () => {
    const substitution = evaluateContinuousText('SOS', 'SAS');
    expect(substitution.alignment.some((operation) => operation.type === 'substitution')).toBe(true);
    expect(substitution.metrics.editDistance).toBe(1);

    const insertion = evaluateContinuousText('SOS', 'SOOS');
    expect(insertion.alignment.some((operation) => operation.type === 'insertion')).toBe(true);

    const deletion = evaluateContinuousText('SOS', 'SS');
    expect(deletion.alignment.some((operation) => operation.type === 'deletion')).toBe(true);
  });

  it('does not manufacture accuracy when no ground truth is available', () => {
    const result = evaluateContinuousText('', 'SOS');

    expect(result.metrics.cer).toBeNull();
    expect(result.metrics.characterAccuracy).toBeNull();
    expect(result.metrics.exactMatch).toBe(false);
  });

  it('builds corrected free-input feedback without changing the prediction', () => {
    const feedback = buildContinuousSessionEvaluation({
      mode: 'free',
      predictedText: 'S0S',
      actualText: 'SOS',
      verdict: 'corrected',
      submittedAt: 1234,
      eventCorrections: [],
    });

    expect(feedback.predictedText).toBe('S0S');
    expect(feedback.actualText).toBe('SOS');
    expect(feedback.metrics.editDistance).toBe(1);
    expect(feedback.submittedAt).toBe(1234);
    expect(feedback.includeInAccuracy).toBe(true);
  });

  it('keeps rejected sessions for diagnosis but excludes them from accuracy aggregates', () => {
    const feedback = buildContinuousSessionEvaluation({
      mode: 'scripted',
      targetText: 'SOS',
      predictedText: 'SOS',
      actualText: 'SOS',
      verdict: 'rejected',
      submittedAt: 1234,
      eventCorrections: [],
    });

    expect(feedback.includeInAccuracy).toBe(false);
    expect(feedback.metrics.exactMatch).toBe(true);
  });

  it('replaces an existing event correction by stable event id', () => {
    const first = upsertEventCorrection([], {
      eventId: 'event-1',
      originalKind: 'symbol-pending',
      correctedLabel: 'dash',
      correctedAt: 10,
    });
    const replaced = upsertEventCorrection(first, {
      eventId: 'event-1',
      originalKind: 'symbol-pending',
      correctedLabel: 'artifact',
      correctedAt: 20,
    });

    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({ correctedLabel: 'artifact', correctedAt: 20 });
  });
});

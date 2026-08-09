export type ContinuousEvaluationMode = 'scripted' | 'free';
export type ContinuousReviewVerdict = 'correct' | 'corrected' | 'rejected';
export type EventCorrectionLabel = 'dot' | 'dash' | 'boundary' | 'artifact';

export interface CharacterAlignmentOperation {
  type: 'match' | 'substitution' | 'insertion' | 'deletion';
  expected: string | null;
  predicted: string | null;
  expectedIndex: number | null;
  predictedIndex: number | null;
}

export interface ContinuousEvaluationMetrics {
  referenceLength: number;
  predictedLength: number;
  editDistance: number;
  cer: number | null;
  characterAccuracy: number | null;
  exactMatch: boolean;
}

export interface ContinuousEventCorrection {
  eventId: string;
  originalKind: string;
  correctedLabel: EventCorrectionLabel;
  correctedAt: number;
}

export interface ContinuousSessionEvaluation {
  mode: ContinuousEvaluationMode;
  targetText: string;
  predictedText: string;
  actualText: string;
  verdict: ContinuousReviewVerdict;
  includeInAccuracy: boolean;
  submittedAt: number;
  metrics: ContinuousEvaluationMetrics;
  alignment: CharacterAlignmentOperation[];
  eventCorrections: ContinuousEventCorrection[];
}

export const normalizeEvaluationText = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const evaluateContinuousText = (actualValue: string, predictedValue: string) => {
  const actualText = normalizeEvaluationText(actualValue);
  const predictedText = normalizeEvaluationText(predictedValue);
  const referenceLength = actualText.length;
  const predictedLength = predictedText.length;
  const distances = Array.from({ length: referenceLength + 1 }, () =>
    Array<number>(predictedLength + 1).fill(0)
  );

  for (let row = 0; row <= referenceLength; row += 1) distances[row][0] = row;
  for (let column = 0; column <= predictedLength; column += 1) distances[0][column] = column;

  for (let row = 1; row <= referenceLength; row += 1) {
    for (let column = 1; column <= predictedLength; column += 1) {
      const substitutionCost = actualText[row - 1] === predictedText[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + substitutionCost
      );
    }
  }

  const alignment: CharacterAlignmentOperation[] = [];
  let row = referenceLength;
  let column = predictedLength;
  while (row > 0 || column > 0) {
    const sameCharacter = row > 0 && column > 0 && actualText[row - 1] === predictedText[column - 1];
    if (sameCharacter && distances[row][column] === distances[row - 1][column - 1]) {
      alignment.push({
        type: 'match',
        expected: actualText[row - 1],
        predicted: predictedText[column - 1],
        expectedIndex: row - 1,
        predictedIndex: column - 1,
      });
      row -= 1;
      column -= 1;
      continue;
    }
    if (row > 0 && column > 0 && distances[row][column] === distances[row - 1][column - 1] + 1) {
      alignment.push({
        type: 'substitution',
        expected: actualText[row - 1],
        predicted: predictedText[column - 1],
        expectedIndex: row - 1,
        predictedIndex: column - 1,
      });
      row -= 1;
      column -= 1;
      continue;
    }
    if (row > 0 && distances[row][column] === distances[row - 1][column] + 1) {
      alignment.push({
        type: 'deletion',
        expected: actualText[row - 1],
        predicted: null,
        expectedIndex: row - 1,
        predictedIndex: null,
      });
      row -= 1;
      continue;
    }
    alignment.push({
      type: 'insertion',
      expected: null,
      predicted: predictedText[column - 1],
      expectedIndex: null,
      predictedIndex: column - 1,
    });
    column -= 1;
  }
  alignment.reverse();

  const editDistance = distances[referenceLength][predictedLength];
  const cer = referenceLength > 0 ? editDistance / referenceLength : null;
  return {
    actualText,
    predictedText,
    metrics: {
      referenceLength,
      predictedLength,
      editDistance,
      cer,
      characterAccuracy: cer === null ? null : Math.max(0, 1 - cer),
      exactMatch: referenceLength > 0 && actualText === predictedText,
    } satisfies ContinuousEvaluationMetrics,
    alignment,
  };
};

export const upsertEventCorrection = (
  current: readonly ContinuousEventCorrection[],
  correction: ContinuousEventCorrection
): ContinuousEventCorrection[] => [
  ...current.filter((item) => item.eventId !== correction.eventId),
  correction,
];

export const buildContinuousSessionEvaluation = (input: {
  mode: ContinuousEvaluationMode;
  targetText?: string;
  predictedText: string;
  actualText: string;
  verdict: ContinuousReviewVerdict;
  submittedAt?: number;
  eventCorrections: ContinuousEventCorrection[];
}): ContinuousSessionEvaluation => {
  const result = evaluateContinuousText(input.actualText, input.predictedText);
  return {
    mode: input.mode,
    targetText: normalizeEvaluationText(input.targetText ?? ''),
    predictedText: result.predictedText,
    actualText: result.actualText,
    verdict: input.verdict,
    includeInAccuracy: input.verdict !== 'rejected',
    submittedAt: input.submittedAt ?? Date.now(),
    metrics: result.metrics,
    alignment: result.alignment,
    eventCorrections: [...input.eventCorrections],
  };
};

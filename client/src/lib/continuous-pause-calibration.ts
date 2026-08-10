export interface RobustPauseDistribution {
  centerMs: number;
  spreadMs: number;
  sampleCount: number;
}

export interface PauseTimingModel {
  withinCharacter: RobustPauseDistribution;
  betweenCharacter: RobustPauseDistribution;
  boundaryMs: number;
  separationConfidence: number;
  source: 'calibrated' | 'fallback';
}

export interface PauseTimingModelResult {
  model: PauseTimingModel;
  warning: string | null;
}

export interface PauseGapScore {
  continuationScore: number;
  boundaryScore: number;
  confidence: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const buildDistribution = (values: readonly number[]): RobustPauseDistribution => {
  const centerMs = median(values);
  const mad = median(values.map((value) => Math.abs(value - centerMs)));
  return {
    centerMs,
    spreadMs: Math.max(40, centerMs * 0.06, mad * 1.4826),
    sampleCount: values.length,
  };
};

const fallbackModel = (boundaryMs: number): PauseTimingModel => ({
  withinCharacter: {
    centerMs: boundaryMs * 0.5,
    spreadMs: Math.max(80, boundaryMs * 0.22),
    sampleCount: 0,
  },
  betweenCharacter: {
    centerMs: boundaryMs * 1.35,
    spreadMs: Math.max(120, boundaryMs * 0.28),
    sampleCount: 0,
  },
  boundaryMs,
  separationConfidence: 0,
  source: 'fallback',
});

export const buildPauseTimingModel = ({
  withinCharacterGapsMs,
  betweenCharacterGapsMs,
  fallbackBoundaryMs,
}: {
  withinCharacterGapsMs: readonly number[];
  betweenCharacterGapsMs: readonly number[];
  fallbackBoundaryMs: number;
}): PauseTimingModelResult => {
  const withinValues = withinCharacterGapsMs.filter((value) => Number.isFinite(value) && value >= 0);
  const betweenValues = betweenCharacterGapsMs.filter((value) => Number.isFinite(value) && value >= 0);
  if (withinValues.length < 4 || betweenValues.length < 2) {
    return {
      model: fallbackModel(fallbackBoundaryMs),
      warning: '停顿校准样本不足，当前使用低置信度节奏预设',
    };
  }

  const withinCharacter = buildDistribution(withinValues);
  const betweenCharacter = buildDistribution(betweenValues);
  const centerGap = betweenCharacter.centerMs - withinCharacter.centerMs;
  const combinedSpread = withinCharacter.spreadMs + betweenCharacter.spreadMs;
  const separationZ = centerGap / Math.max(1, combinedSpread);
  const separationConfidence = clamp((separationZ - 0.75) / 2.5, 0, 1);
  const boundaryMs = centerGap > 0
    ? (withinCharacter.centerMs + betweenCharacter.centerMs) / 2
    : fallbackBoundaryMs;
  const model: PauseTimingModel = {
    withinCharacter,
    betweenCharacter,
    boundaryMs,
    separationConfidence,
    source: 'calibrated',
  };

  return {
    model,
    warning: separationConfidence < 0.5
      ? '字符内停顿与字符间停顿分布重叠，请略微延长字符间停顿后重试'
      : null,
  };
};

const distributionScore = (distribution: RobustPauseDistribution, gapMs: number): number => {
  const z = (gapMs - distribution.centerMs) / Math.max(1, distribution.spreadMs);
  return -0.5 * z * z - Math.log(Math.max(1, distribution.spreadMs));
};

export const scorePauseGap = (model: PauseTimingModel, gapMs: number): PauseGapScore => {
  const continuationScore = distributionScore(model.withinCharacter, gapMs);
  const boundaryScore = distributionScore(model.betweenCharacter, gapMs);
  const distance = Math.abs(boundaryScore - continuationScore);
  return {
    continuationScore,
    boundaryScore,
    confidence: clamp(1 - Math.exp(-distance), 0, 1) * Math.max(0.2, model.separationConfidence),
  };
};

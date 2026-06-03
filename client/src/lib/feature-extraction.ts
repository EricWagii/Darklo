/**
 * Multi-dimensional feature extraction for EMG signals
 * 
 * Extracts time-domain, frequency-domain, and other features
 * for comprehensive waveform comparison and anomaly detection
 */

import { logger } from './logger';

export interface EMGFeatures {
  // Time-domain features
  rmsEnergy: number;           // Root Mean Square energy
  peakValue: number;           // Maximum absolute value
  energyCenter: number;        // Center of mass (normalized 0-1)
  variance: number;            // Signal variance
  zeroCrossingRate: number;    // Zero crossing rate (0-1)
  
  // Frequency-domain features
  dominantFrequency: number;   // Dominant frequency (normalized 0-1)
  spectralCentroid: number;    // Spectral centroid (normalized 0-1)
  spectralSpread: number;      // Spectral spread (normalized 0-1)
  
  // Multi-channel aggregation
  ch1Features: number[];       // Channel 1 feature vector
  ch2Features: number[];       // Channel 2 feature vector
  ch3Features: number[];       // Channel 3 feature vector
  
  // Overall feature vector (for distance calculation)
  featureVector: number[];     // Normalized feature vector for comparison
}

/**
 * Calculate RMS (Root Mean Square) energy
 */
export function calculateRMSEnergy(signal: number[]): number {
  if (signal.length === 0) return 0;
  const sumSquares = signal.reduce((sum, x) => sum + x * x, 0);
  return Math.sqrt(sumSquares / signal.length);
}

/**
 * Calculate peak value (maximum absolute value)
 */
export function calculatePeakValue(signal: number[]): number {
  if (signal.length === 0) return 0;
  return Math.max(...signal.map(x => Math.abs(x)));
}

/**
 * Calculate energy center (center of mass, normalized to 0-1)
 */
export function calculateEnergyCenter(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  const energy = signal.map(x => Math.abs(x));
  const totalEnergy = energy.reduce((sum, x) => sum + x, 0);
  
  if (totalEnergy === 0) return 0;
  
  const weightedSum = energy.reduce((sum, x, i) => sum + x * i, 0);
  return weightedSum / (totalEnergy * (signal.length - 1)); // Normalize to 0-1
}

/**
 * Calculate signal variance
 */
export function calculateVariance(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  const mean = signal.reduce((sum, x) => sum + x, 0) / signal.length;
  const sumSquaredDiff = signal.reduce((sum, x) => sum + (x - mean) ** 2, 0);
  
  return sumSquaredDiff / signal.length;
}

/**
 * Calculate zero crossing rate (0-1)
 */
export function calculateZeroCrossingRate(signal: number[]): number {
  if (signal.length < 2) return 0;
  
  let zeroCrossings = 0;
  for (let i = 1; i < signal.length; i++) {
    if ((signal[i] >= 0 && signal[i - 1] < 0) || (signal[i] < 0 && signal[i - 1] >= 0)) {
      zeroCrossings++;
    }
  }
  
  return zeroCrossings / (signal.length - 1); // Normalize to 0-1
}

/**
 * Simple FFT implementation (Cooley-Tukey algorithm)
 * Returns magnitude spectrum
 */
export function computeFFT(signal: number[]): number[] {
  const n = signal.length;
  
  // Pad to power of 2
  let paddedSize = 1;
  while (paddedSize < n) paddedSize *= 2;
  
  const padded = [...signal, ...Array(paddedSize - n).fill(0)];
  
  // Simple DFT (not full FFT, but sufficient for feature extraction)
  const spectrum: number[] = [];
  for (let k = 0; k < paddedSize / 2; k++) {
    let real = 0;
    let imag = 0;
    
    for (let n = 0; n < paddedSize; n++) {
      const angle = (-2 * Math.PI * k * n) / paddedSize;
      real += padded[n] * Math.cos(angle);
      imag += padded[n] * Math.sin(angle);
    }
    
    spectrum.push(Math.sqrt(real * real + imag * imag));
  }
  
  return spectrum;
}

/**
 * Calculate dominant frequency (normalized 0-1)
 */
export function calculateDominantFrequency(signal: number[]): number {
  if (signal.length < 2) return 0;
  
  const spectrum = computeFFT(signal);
  if (spectrum.length === 0) return 0;
  
  let maxIdx = 0;
  let maxMagnitude = spectrum[0];
  
  for (let i = 1; i < spectrum.length; i++) {
    if (spectrum[i] > maxMagnitude) {
      maxMagnitude = spectrum[i];
      maxIdx = i;
    }
  }
  
  return maxIdx / spectrum.length; // Normalize to 0-1
}

/**
 * Calculate spectral centroid (normalized 0-1)
 */
export function calculateSpectralCentroid(signal: number[]): number {
  if (signal.length < 2) return 0;
  
  const spectrum = computeFFT(signal);
  if (spectrum.length === 0) return 0;
  
  const totalPower = spectrum.reduce((sum, x) => sum + x, 0);
  if (totalPower === 0) return 0;
  
  const weightedSum = spectrum.reduce((sum, x, i) => sum + x * i, 0);
  return weightedSum / (totalPower * spectrum.length); // Normalize to 0-1
}

/**
 * Calculate spectral spread (normalized 0-1)
 */
export function calculateSpectralSpread(signal: number[]): number {
  if (signal.length < 2) return 0;
  
  const spectrum = computeFFT(signal);
  if (spectrum.length === 0) return 0;
  
  const centroid = calculateSpectralCentroid(signal);
  const totalPower = spectrum.reduce((sum, x) => sum + x, 0);
  
  if (totalPower === 0) return 0;
  
  const weightedVariance = spectrum.reduce((sum, x, i) => {
    const diff = i / spectrum.length - centroid;
    return sum + x * diff * diff;
  }, 0);
  
  const spread = Math.sqrt(weightedVariance / totalPower);
  return Math.min(spread, 1); // Normalize to 0-1
}

/**
 * Extract all features from a single channel
 */
export function extractChannelFeatures(signal: number[]): number[] {
  return [
    calculateRMSEnergy(signal),
    calculatePeakValue(signal),
    calculateEnergyCenter(signal),
    calculateVariance(signal),
    calculateZeroCrossingRate(signal),
  ];
}

/**
 * Extract all features from multi-channel EMG waveform
 */
export function extractEMGFeatures(waveform: {
  ch1: number[];
  ch2: number[];
  ch3: number[];
}): EMGFeatures {
  // Extract channel features
  const ch1Features = extractChannelFeatures(waveform.ch1);
  const ch2Features = extractChannelFeatures(waveform.ch2);
  const ch3Features = extractChannelFeatures(waveform.ch3);
  
  // Aggregate across channels
  const rmsEnergy = (ch1Features[0] + ch2Features[0] + ch3Features[0]) / 3;
  const peakValue = (ch1Features[1] + ch2Features[1] + ch3Features[1]) / 3;
  const energyCenter = (ch1Features[2] + ch2Features[2] + ch3Features[2]) / 3;
  const variance = (ch1Features[3] + ch2Features[3] + ch3Features[3]) / 3;
  const zeroCrossingRate = (ch1Features[4] + ch2Features[4] + ch3Features[4]) / 3;
  
  // Frequency-domain features (from aggregated signal)
  const aggregatedSignal = waveform.ch1.map((x, i) => (x + waveform.ch2[i] + waveform.ch3[i]) / 3);
  const dominantFrequency = calculateDominantFrequency(aggregatedSignal);
  const spectralCentroid = calculateSpectralCentroid(aggregatedSignal);
  const spectralSpread = calculateSpectralSpread(aggregatedSignal);
  
  // Build overall feature vector (normalized)
  const featureVector = [
    rmsEnergy,
    peakValue,
    energyCenter,
    variance,
    zeroCrossingRate,
    dominantFrequency,
    spectralCentroid,
    spectralSpread,
  ];
  
  return {
    rmsEnergy,
    peakValue,
    energyCenter,
    variance,
    zeroCrossingRate,
    dominantFrequency,
    spectralCentroid,
    spectralSpread,
    ch1Features,
    ch2Features,
    ch3Features,
    featureVector,
  };
}

/**
 * Normalize features using z-score normalization
 */
export function normalizeFeatures(
  features: number[],
  mean: number[],
  stdDev: number[]
): number[] {
  return features.map((f, i) => {
    if (stdDev[i] === 0) return 0;
    return (f - mean[i]) / stdDev[i];
  });
}

/**
 * Calculate Euclidean distance between two feature vectors
 */
export function calculateFeatureDistance(
  features1: number[],
  features2: number[]
): number {
  if (features1.length !== features2.length) {
    throw new Error('Feature vectors must have the same length');
  }
  
  const sumSquaredDiff = features1.reduce((sum, f1, i) => {
    const diff = f1 - features2[i];
    return sum + diff * diff;
  }, 0);
  
  return Math.sqrt(sumSquaredDiff);
}

/**
 * Calculate mean features from multiple waveforms
 */
export function calculateMeanFeatures(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): number[] {
  if (waveforms.length === 0) return [];
  
  const allFeatures = waveforms.map(w => extractEMGFeatures(w).featureVector);
  const featureCount = allFeatures[0].length;
  
  const meanFeatures: number[] = [];
  for (let i = 0; i < featureCount; i++) {
    const sum = allFeatures.reduce((s, f) => s + f[i], 0);
    meanFeatures.push(sum / allFeatures.length);
  }
  
  return meanFeatures;
}

/**
 * Calculate standard deviation of features from multiple waveforms
 */
export function calculateStdDevFeatures(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  meanFeatures: number[]
): number[] {
  if (waveforms.length === 0) return [];
  
  const allFeatures = waveforms.map(w => extractEMGFeatures(w).featureVector);
  const featureCount = allFeatures[0].length;
  
  const stdDevFeatures: number[] = [];
  for (let i = 0; i < featureCount; i++) {
    const sumSquaredDiff = allFeatures.reduce((s, f) => {
      const diff = f[i] - meanFeatures[i];
      return s + diff * diff;
    }, 0);
    stdDevFeatures.push(Math.sqrt(sumSquaredDiff / allFeatures.length));
  }
  
  return stdDevFeatures;
}

/**
 * Detect anomalous waveforms based on feature distance
 */
export function detectAnomalousWaveforms(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  threshold: number = 0.5
): Array<{ index: number; distance: number; isAnomalous: boolean }> {
  if (waveforms.length < 3) {
    // Not enough data for anomaly detection
    return waveforms.map((_, i) => ({
      index: i,
      distance: 0,
      isAnomalous: false,
    }));
  }
  
  const meanFeatures = calculateMeanFeatures(waveforms);
  const stdDevFeatures = calculateStdDevFeatures(waveforms, meanFeatures);
  
  return waveforms.map((waveform, index) => {
    const features = extractEMGFeatures(waveform).featureVector;
    const normalizedFeatures = normalizeFeatures(features, meanFeatures, stdDevFeatures);
    const distance = calculateFeatureDistance(normalizedFeatures, Array(normalizedFeatures.length).fill(0));
    
    return {
      index,
      distance,
      isAnomalous: distance > threshold,
    };
  });
}

/**
 * Generate feature analysis report
 */
export function generateFeatureReport(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  threshold: number = 0.5
): string {
  const anomalies = detectAnomalousWaveforms(waveforms, threshold);
  const anomalousIndices = anomalies.filter(a => a.isAnomalous).map(a => a.index);
  
  let report = `\n========== Feature Analysis Report ==========\n`;
  report += `Total waveforms: ${waveforms.length}\n`;
  report += `Anomaly threshold: ${threshold}\n`;
  report += `Anomalous waveforms: ${anomalousIndices.length}\n`;
  
  if (anomalousIndices.length > 0) {
    report += `\nAnomalous indices: ${anomalousIndices.join(', ')}\n`;
    report += `\nDetails:\n`;
    anomalies.forEach(a => {
      if (a.isAnomalous) {
        report += `  Waveform ${a.index}: distance=${a.distance.toFixed(3)}\n`;
      }
    });
  }
  
  return report;
}

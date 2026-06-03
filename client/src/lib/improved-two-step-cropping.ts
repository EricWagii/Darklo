/**
 * Improved two-step cropping scheme
 * 
 * Step 1: Adaptive dynamic cropping to remove blank sections
 * Step 2: Uniform length scaling to handle speed variations
 */

import { logger } from './logger';
import { calculateRMSEnergy, extractEMGFeatures, detectAnomalousWaveforms } from './feature-extraction';

export interface CroppingResult {
  step1StartIdx: number;      // Start index after removing blanks
  step1EndIdx: number;        // End index after removing blanks
  step1Length: number;        // Length after step 1
  step2StartIdx: number;      // Start index after scaling (always 0)
  step2EndIdx: number;        // End index after scaling (always targetLength)
  step2Length: number;        // Length after step 2 (always targetLength)
  confidence: number;         // Confidence score (0-1)
  isQualityAcceptable: boolean; // Whether quality is acceptable
  qualityReason?: string;     // Reason if not acceptable
}

export interface AnomalyInfo {
  index: number;              // Index of anomalous waveform
  distance: number;           // Feature distance from mean
  isAnomalous: boolean;       // Whether it's anomalous
}

/**
 * Calculate adaptive threshold based on signal statistics
 * 
 * Instead of fixed threshold, adapt based on:
 * - Signal variance
 * - Energy distribution
 * - Noise characteristics
 */
export function calculateAdaptiveThreshold(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): number {
  // Calculate RMS energy for each channel
  const rms1 = calculateRMSEnergy(ch1);
  const rms2 = calculateRMSEnergy(ch2);
  const rms3 = calculateRMSEnergy(ch3);
  
  // Average RMS across channels
  const avgRMS = (rms1 + rms2 + rms3) / 3;
  
  // Calculate variance for each channel
  const var1 = calculateVariance(ch1);
  const var2 = calculateVariance(ch2);
  const var3 = calculateVariance(ch3);
  
  const avgVar = (var1 + var2 + var3) / 3;
  
  // Adaptive threshold = mean + k * std_dev
  // where k is adjusted based on signal characteristics
  const threshold = avgRMS * 0.3 + Math.sqrt(avgVar) * 0.5;
  
  logger.debug(
    `[Adaptive Threshold] RMS=${avgRMS.toFixed(3)}, Var=${avgVar.toFixed(3)}, ` +
    `Threshold=${threshold.toFixed(3)}`
  );
  
  return Math.max(threshold, 0.01); // Ensure threshold is positive
}

/**
 * Calculate variance of a signal
 */
export function calculateVariance(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  const mean = signal.reduce((sum, x) => sum + x, 0) / signal.length;
  const sumSquaredDiff = signal.reduce((sum, x) => sum + (x - mean) ** 2, 0);
  
  return sumSquaredDiff / signal.length;
}

/**
 * Detect valid section boundaries using energy-based method
 * 
 * Returns [startIdx, endIdx] of the valid section
 */
export function detectValidSection(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  threshold: number,
  windowSize: number = 20
): [number, number] {
  if (ch1.length === 0) return [0, 0];
  
  // Calculate energy for each window
  const energy: number[] = [];
  for (let i = 0; i < ch1.length; i += windowSize) {
    const end = Math.min(i + windowSize, ch1.length);
    const window1 = ch1.slice(i, end);
    const window2 = ch2.slice(i, end);
    const window3 = ch3.slice(i, end);
    
    const e1 = calculateRMSEnergy(window1);
    const e2 = calculateRMSEnergy(window2);
    const e3 = calculateRMSEnergy(window3);
    
    // Weighted average (using variance as weight)
    const var1 = calculateVariance(window1);
    const var2 = calculateVariance(window2);
    const var3 = calculateVariance(window3);
    
    const totalVar = var1 + var2 + var3;
    if (totalVar === 0) {
      energy.push(0);
    } else {
      const weightedEnergy = (e1 * var1 + e2 * var2 + e3 * var3) / totalVar;
      energy.push(weightedEnergy);
    }
  }
  
  // Find valid section using bidirectional search
  let startIdx = 0;
  let endIdx = energy.length - 1;
  
  // Forward search: find first index above threshold
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > threshold) {
      startIdx = i;
      break;
    }
  }
  
  // Backward search: find last index above threshold
  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > threshold) {
      endIdx = i;
      break;
    }
  }
  
  // Convert window indices back to sample indices
  const startSample = startIdx * windowSize;
  const endSample = Math.min((endIdx + 1) * windowSize, ch1.length);
  
  logger.debug(
    `[Valid Section Detection] Start=${startSample}, End=${endSample}, ` +
    `Length=${endSample - startSample}`
  );
  
  return [startSample, endSample];
}

/**
 * Step 1: Adaptive dynamic cropping to remove blank sections
 */
export function step1AdaptiveCropping(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): CroppingResult {
  const threshold = calculateAdaptiveThreshold(ch1, ch2, ch3);
  const [startIdx, endIdx] = detectValidSection(ch1, ch2, ch3, threshold);
  
  const step1Length = endIdx - startIdx;
  const confidence = Math.min(1, step1Length / Math.max(ch1.length, 1));
  
  return {
    step1StartIdx: startIdx,
    step1EndIdx: endIdx,
    step1Length,
    step2StartIdx: 0,
    step2EndIdx: 0,
    step2Length: 0,
    confidence,
    isQualityAcceptable: step1Length > 0,
    qualityReason: step1Length === 0 ? 'No valid section detected' : undefined,
  };
}

/**
 * Resample signal to target length
 */
export function resampleSignal(signal: number[], targetLength: number): number[] {
  if (signal.length === 0 || targetLength === 0) return [];
  if (signal.length === targetLength) return [...signal];
  
  const resampled: number[] = [];
  const ratio = (signal.length - 1) / (targetLength - 1);
  
  for (let i = 0; i < targetLength; i++) {
    const srcIdx = i * ratio;
    const srcIdxFloor = Math.floor(srcIdx);
    const srcIdxCeil = Math.ceil(srcIdx);
    
    if (srcIdxFloor === srcIdxCeil) {
      resampled.push(signal[srcIdxFloor]);
    } else {
      // Linear interpolation
      const fraction = srcIdx - srcIdxFloor;
      resampled.push(
        signal[srcIdxFloor] * (1 - fraction) + signal[srcIdxCeil] * fraction
      );
    }
  }
  
  return resampled;
}

/**
 * Step 2: Uniform length scaling
 */
export function step2UniformScaling(
  step1Result: CroppingResult,
  ch1: number[],
  ch2: number[],
  ch3: number[],
  targetLength: number = 512
): CroppingResult {
  // Extract valid sections
  const validCh1 = ch1.slice(step1Result.step1StartIdx, step1Result.step1EndIdx);
  const validCh2 = ch2.slice(step1Result.step1StartIdx, step1Result.step1EndIdx);
  const validCh3 = ch3.slice(step1Result.step1StartIdx, step1Result.step1EndIdx);
  
  // Resample to target length
  const resampledCh1 = resampleSignal(validCh1, targetLength);
  const resampledCh2 = resampleSignal(validCh2, targetLength);
  const resampledCh3 = resampleSignal(validCh3, targetLength);
  
  return {
    step1StartIdx: step1Result.step1StartIdx,
    step1EndIdx: step1Result.step1EndIdx,
    step1Length: step1Result.step1Length,
    step2StartIdx: 0,
    step2EndIdx: targetLength,
    step2Length: targetLength,
    confidence: step1Result.confidence,
    isQualityAcceptable: step1Result.isQualityAcceptable && targetLength > 0,
    qualityReason: step1Result.qualityReason,
  };
}

/**
 * Complete two-step cropping process
 */
export function performTwoStepCropping(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  targetLength: number = 512
): CroppingResult {
  const step1Result = step1AdaptiveCropping(ch1, ch2, ch3);
  if (!step1Result.isQualityAcceptable) {
    return step1Result;
  }
  
  const step2Result = step2UniformScaling(step1Result, ch1, ch2, ch3, targetLength);
  return step2Result;
}

/**
 * Get cropped waveform after two-step cropping
 */
export function getCroppedWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  croppingResult: CroppingResult,
  targetLength: number = 512
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  // Extract valid sections (step 1)
  const validCh1 = ch1.slice(croppingResult.step1StartIdx, croppingResult.step1EndIdx);
  const validCh2 = ch2.slice(croppingResult.step1StartIdx, croppingResult.step1EndIdx);
  const validCh3 = ch3.slice(croppingResult.step1StartIdx, croppingResult.step1EndIdx);
  
  // Resample to target length (step 2)
  const resampledCh1 = resampleSignal(validCh1, targetLength);
  const resampledCh2 = resampleSignal(validCh2, targetLength);
  const resampledCh3 = resampleSignal(validCh3, targetLength);
  
  return {
    ch1: resampledCh1,
    ch2: resampledCh2,
    ch3: resampledCh3,
  };
}

/**
 * Detect anomalous waveforms in a collection
 * 
 * Supports two scenarios:
 * 1. First-time collection: requires at least 5 waveforms
 * 2. Append collection: can have any number, compared with historical data
 */
export function detectAnomalousWaveformsInCollection(
  waveforms: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  croppingResults: CroppingResult[],
  anomalyThreshold: number = 0.5,
  historicalWaveforms?: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>
): AnomalyInfo[] {
  // Determine collection mode
  const isFirstTimeCollection = !historicalWaveforms || historicalWaveforms.length === 0;
  const minWaveformsRequired = isFirstTimeCollection ? 5 : 1;
  
  if (waveforms.length < minWaveformsRequired) {
    // Not enough data for anomaly detection
    return waveforms.map((_, i) => ({
      index: i,
      distance: 0,
      isAnomalous: false,
    }));
  }
  
  // Combine waveforms for comparison
  let comparisonWaveforms = waveforms;
  if (!isFirstTimeCollection && historicalWaveforms) {
    comparisonWaveforms = [...historicalWaveforms, ...waveforms];
  }
  
  // Get cropped waveforms
  const croppedWaveforms = waveforms.map((wf, i) =>
    getCroppedWaveform(wf.ch1, wf.ch2, wf.ch3, croppingResults[i])
  );
  
  // Get cropped comparison waveforms
  const croppedComparisonWaveforms = comparisonWaveforms.map((wf, i) => {
    // Use original cropping results for current waveforms
    if (i < waveforms.length) {
      return getCroppedWaveform(wf.ch1, wf.ch2, wf.ch3, croppingResults[i]);
    } else {
      // For historical waveforms, perform cropping
      const croppingResult = performTwoStepCropping(wf.ch1, wf.ch2, wf.ch3, 512);
      return getCroppedWaveform(wf.ch1, wf.ch2, wf.ch3, croppingResult);
    }
  });
  
  // Detect anomalies based on features
  const allAnomalies = detectAnomalousWaveforms(croppedComparisonWaveforms, anomalyThreshold);
  
  // Only return anomalies for current waveforms
  return allAnomalies.slice(isFirstTimeCollection ? 0 : historicalWaveforms!.length);
}

/**
 * Generate cropping report with collection mode information
 */
export function generateCroppingReport(
  croppingResults: CroppingResult[],
  anomalies: AnomalyInfo[],
  isFirstTimeCollection: boolean = true,
  historicalCount: number = 0
): string {
  let report = `\n========== Two-Step Cropping Report ==========\n`;
  report += `Collection mode: ${isFirstTimeCollection ? 'First-time' : 'Append'}\n`;
  if (!isFirstTimeCollection) {
    report += `Historical waveforms: ${historicalCount}\n`;
  }
  report += `Current waveforms: ${croppingResults.length}\n`;
  
  const successCount = croppingResults.filter(r => r.isQualityAcceptable).length;
  report += `Successful crops: ${successCount}/${croppingResults.length}\n`;
  
  const anomalousCount = anomalies.filter(a => a.isAnomalous).length;
  report += `Anomalous waveforms: ${anomalousCount}\n`;
  
  if (anomalousCount > 0) {
    report += `\nAnomalous indices: ${anomalies.filter(a => a.isAnomalous).map(a => a.index).join(', ')}\n`;
  }
  
  report += `\nDetails:\n`;
  croppingResults.forEach((result, i) => {
    const anomaly = anomalies[i];
    report += `  Waveform ${i}: `;
    report += `Step1=${result.step1Length}, Step2=${result.step2Length}, `;
    report += `Confidence=${result.confidence.toFixed(3)}, `;
    report += `Anomalous=${anomaly?.isAnomalous ? 'Yes' : 'No'}`;
    if (anomaly?.isAnomalous) {
      report += ` (distance=${anomaly.distance.toFixed(3)})`;
    }
    report += `\n`;
  });
  
  return report;
}

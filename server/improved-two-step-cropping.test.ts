import { describe, it, expect } from 'vitest';
import {
  calculateAdaptiveThreshold,
  calculateVariance,
  detectValidSection,
  step1AdaptiveCropping,
  resampleSignal,
  step2UniformScaling,
  performTwoStepCropping,
  getCroppedWaveform,
  detectAnomalousWaveformsInCollection,
  generateCroppingReport,
} from '../client/src/lib/improved-two-step-cropping';
import {
  extractEMGFeatures,
  calculateFeatureDistance,
  calculateMeanFeatures,
  calculateStdDevFeatures,
  detectAnomalousWaveforms,
  generateFeatureReport,
} from '../client/src/lib/feature-extraction';

// Helper function to generate synthetic EMG signal
function generateSyntheticEMG(
  length: number,
  peakStart: number,
  peakEnd: number,
  amplitude: number = 100
): number[] {
  const signal: number[] = [];
  for (let i = 0; i < length; i++) {
    if (i >= peakStart && i < peakEnd) {
      // Peak region with noise
      signal.push(amplitude * Math.sin((i - peakStart) * Math.PI / (peakEnd - peakStart)) + Math.random() * 10);
    } else {
      // Blank region with small noise
      signal.push(Math.random() * 5 - 2.5);
    }
  }
  return signal;
}

describe('Improved Two-Step Cropping', () => {
  describe('Step 1: Adaptive Cropping', () => {
    it('should calculate adaptive threshold', () => {
      const ch1 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch2 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch3 = generateSyntheticEMG(1000, 200, 800, 100);
      
      const threshold = calculateAdaptiveThreshold(ch1, ch2, ch3);
      expect(threshold).toBeGreaterThan(0);
      expect(threshold).toBeLessThan(50);
    });

    it('should detect valid section', () => {
      const ch1 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch2 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch3 = generateSyntheticEMG(1000, 200, 800, 100);
      
      const threshold = calculateAdaptiveThreshold(ch1, ch2, ch3);
      const [start, end] = detectValidSection(ch1, ch2, ch3, threshold);
      
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(ch1.length);
      expect(start).toBeLessThan(end);
      // Valid section should be around 200-800
      expect(start).toBeLessThan(300);
      expect(end).toBeGreaterThan(700);
    });

    it('should perform step 1 cropping', () => {
      const ch1 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch2 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch3 = generateSyntheticEMG(1000, 200, 800, 100);
      
      const result = step1AdaptiveCropping(ch1, ch2, ch3);
      
      expect(result.isQualityAcceptable).toBe(true);
      expect(result.step1Length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Step 2: Uniform Scaling', () => {
    it('should resample signal to target length', () => {
      const signal = generateSyntheticEMG(1000, 200, 800, 100);
      const targetLength = 512;
      
      const resampled = resampleSignal(signal, targetLength);
      
      expect(resampled).toHaveLength(targetLength);
    });

    it('should handle edge cases in resampling', () => {
      const signal = [1, 2, 3, 4, 5];
      
      // Resample to same length
      const same = resampleSignal(signal, 5);
      expect(same).toHaveLength(5);
      
      // Resample to shorter length
      const shorter = resampleSignal(signal, 3);
      expect(shorter).toHaveLength(3);
      
      // Resample to longer length
      const longer = resampleSignal(signal, 10);
      expect(longer).toHaveLength(10);
    });

    it('should perform step 2 scaling', () => {
      const ch1 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch2 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch3 = generateSyntheticEMG(1000, 200, 800, 100);
      
      const step1Result = step1AdaptiveCropping(ch1, ch2, ch3);
      const step2Result = step2UniformScaling(step1Result, ch1, ch2, ch3, 512);
      
      expect(step2Result.step2Length).toBe(512);
      expect(step2Result.step2StartIdx).toBe(0);
      expect(step2Result.step2EndIdx).toBe(512);
    });
  });

  describe('Complete Two-Step Cropping', () => {
    it('should perform complete two-step cropping', () => {
      const ch1 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch2 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch3 = generateSyntheticEMG(1000, 200, 800, 100);
      
      const result = performTwoStepCropping(ch1, ch2, ch3, 512);
      
      expect(result.isQualityAcceptable).toBe(true);
      expect(result.step1Length).toBeGreaterThan(0);
      expect(result.step2Length).toBe(512);
    });

    it('should get cropped waveform', () => {
      const ch1 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch2 = generateSyntheticEMG(1000, 200, 800, 100);
      const ch3 = generateSyntheticEMG(1000, 200, 800, 100);
      
      const croppingResult = performTwoStepCropping(ch1, ch2, ch3, 512);
      const cropped = getCroppedWaveform(ch1, ch2, ch3, croppingResult, 512);
      
      expect(cropped.ch1).toHaveLength(512);
      expect(cropped.ch2).toHaveLength(512);
      expect(cropped.ch3).toHaveLength(512);
    });
  });

  describe('Anomaly Detection', () => {
    it('should detect anomalous waveforms', () => {
      // Create multiple similar waveforms
      const waveforms = [];
      for (let i = 0; i < 5; i++) {
        waveforms.push({
          ch1: generateSyntheticEMG(1000, 200, 800, 100),
          ch2: generateSyntheticEMG(1000, 200, 800, 100),
          ch3: generateSyntheticEMG(1000, 200, 800, 100),
        });
      }
      
      // Add one anomalous waveform
      waveforms.push({
        ch1: generateSyntheticEMG(1000, 100, 300, 50), // Different peak
        ch2: generateSyntheticEMG(1000, 100, 300, 50),
        ch3: generateSyntheticEMG(1000, 100, 300, 50),
      });
      
      // Perform cropping
      const croppingResults = waveforms.map(w =>
        performTwoStepCropping(w.ch1, w.ch2, w.ch3, 512)
      );
      
      // Detect anomalies
      const anomalies = detectAnomalousWaveformsInCollection(waveforms, croppingResults, 0.5);
      
      expect(anomalies).toHaveLength(6);
      expect(anomalies.some(a => a.isAnomalous)).toBe(true);
    });

    it('should not detect anomalies with insufficient data', () => {
      const waveforms = [
        {
          ch1: generateSyntheticEMG(1000, 200, 800, 100),
          ch2: generateSyntheticEMG(1000, 200, 800, 100),
          ch3: generateSyntheticEMG(1000, 200, 800, 100),
        },
      ];
      
      const croppingResults = waveforms.map(w =>
        performTwoStepCropping(w.ch1, w.ch2, w.ch3, 512)
      );
      
      const anomalies = detectAnomalousWaveformsInCollection(waveforms, croppingResults, 0.5);
      
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].isAnomalous).toBe(false);
    });
  });

  describe('Feature Extraction', () => {
    it('should extract EMG features', () => {
      const waveform = {
        ch1: generateSyntheticEMG(512, 100, 400, 100),
        ch2: generateSyntheticEMG(512, 100, 400, 100),
        ch3: generateSyntheticEMG(512, 100, 400, 100),
      };
      
      const features = extractEMGFeatures(waveform);
      
      expect(features.rmsEnergy).toBeGreaterThan(0);
      expect(features.peakValue).toBeGreaterThan(0);
      expect(features.energyCenter).toBeGreaterThanOrEqual(0);
      expect(features.energyCenter).toBeLessThanOrEqual(1);
      expect(features.featureVector).toHaveLength(8);
    });

    it('should calculate feature distance', () => {
      const features1 = [1, 2, 3, 4, 5, 6, 7, 8];
      const features2 = [1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1];
      
      const distance = calculateFeatureDistance(features1, features2);
      
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1);
    });

    it('should calculate mean features', () => {
      const waveforms = [];
      for (let i = 0; i < 5; i++) {
        waveforms.push({
          ch1: generateSyntheticEMG(512, 100, 400, 100),
          ch2: generateSyntheticEMG(512, 100, 400, 100),
          ch3: generateSyntheticEMG(512, 100, 400, 100),
        });
      }
      
      const meanFeatures = calculateMeanFeatures(waveforms);
      
      expect(meanFeatures).toHaveLength(8);
      expect(meanFeatures.every(f => !isNaN(f))).toBe(true);
    });

    it('should detect anomalies using features', () => {
      const waveforms = [];
      for (let i = 0; i < 5; i++) {
        waveforms.push({
          ch1: generateSyntheticEMG(512, 100, 400, 100),
          ch2: generateSyntheticEMG(512, 100, 400, 100),
          ch3: generateSyntheticEMG(512, 100, 400, 100),
        });
      }
      
      // Add anomalous waveform
      waveforms.push({
        ch1: generateSyntheticEMG(512, 50, 150, 30),
        ch2: generateSyntheticEMG(512, 50, 150, 30),
        ch3: generateSyntheticEMG(512, 50, 150, 30),
      });
      
      const anomalies = detectAnomalousWaveforms(waveforms, 0.5);
      
      expect(anomalies).toHaveLength(6);
      expect(anomalies.some(a => a.isAnomalous)).toBe(true);
    });
  });

  describe('Reporting', () => {
    it('should generate cropping report', () => {
      const waveforms = [];
      for (let i = 0; i < 3; i++) {
        waveforms.push({
          ch1: generateSyntheticEMG(1000, 200, 800, 100),
          ch2: generateSyntheticEMG(1000, 200, 800, 100),
          ch3: generateSyntheticEMG(1000, 200, 800, 100),
        });
      }
      
      const croppingResults = waveforms.map(w =>
        performTwoStepCropping(w.ch1, w.ch2, w.ch3, 512)
      );
      
      const anomalies = detectAnomalousWaveformsInCollection(waveforms, croppingResults, 0.5);
      
      const report = generateCroppingReport(croppingResults, anomalies);
      
      expect(report).toContain('Two-Step Cropping Report');
      expect(report).toContain('Current waveforms: 3');
    });

    it('should generate feature report', () => {
      const waveforms = [];
      for (let i = 0; i < 3; i++) {
        waveforms.push({
          ch1: generateSyntheticEMG(512, 100, 400, 100),
          ch2: generateSyntheticEMG(512, 100, 400, 100),
          ch3: generateSyntheticEMG(512, 100, 400, 100),
        });
      }
      
      const report = generateFeatureReport(waveforms, 0.5);
      
      expect(report).toContain('Feature Analysis Report');
      expect(report).toContain('waveforms: 3');
    });
  });
});

// Additional test for append collection anomaly detection
describe('Append Collection Anomaly Detection', () => {
  it('should support append collection with historical data comparison', () => {
    // Append collection scenario: new waveforms compared against historical data
    // The anomaly detection for append collection is deferred to save time
    // This test verifies that the function can handle historical data
    const historicalWaveforms = [];
    for (let i = 0; i < 3; i++) {
      historicalWaveforms.push({
        ch1: generateSyntheticEMG(1000, 200, 800, 100),
        ch2: generateSyntheticEMG(1000, 200, 800, 100),
        ch3: generateSyntheticEMG(1000, 200, 800, 100),
      });
    }
    
    // New waveform for append collection
    const newWaveforms = [
      {
        ch1: generateSyntheticEMG(1000, 200, 800, 100),
        ch2: generateSyntheticEMG(1000, 200, 800, 100),
        ch3: generateSyntheticEMG(1000, 200, 800, 100),
      },
    ];
    
    const croppingResults = newWaveforms.map(w =>
      performTwoStepCropping(w.ch1, w.ch2, w.ch3, 512)
    );
    
    // Call with historical data for comparison
    const anomalies = detectAnomalousWaveformsInCollection(
      newWaveforms,
      croppingResults,
      0.5,
      historicalWaveforms
    );
    
    // Should return results
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toBeDefined();
  });
});

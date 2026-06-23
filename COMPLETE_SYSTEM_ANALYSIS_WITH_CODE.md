# Ear-EMG Silent Speech Recognition System - Complete Analysis with Code

## 1. System Overview

### 1.1 Project Purpose
**Darklo EMG Silent Speech Recognition System** - A web-based application that captures electromyography (EMG) signals from the ear region and uses deep learning to recognize silent speech (默念) commands without any audible sound.

### 1.2 Hardware Architecture
- **Sensor**: 3-channel EMG sensor placed on the ear (mastoid region behind ear)
- **Sampling Rate**: 500 Hz
- **Channels**: 
  - Ch1: Primary EMG signal
  - Ch2: Secondary EMG signal
  - Ch3: Reference signal (often weak/noisy)
- **Signal Range**: ±10mV (±10,000 microvolts)

### 1.3 Application Workflow
```
┌─────────────────────────────────────────────────────────────┐
│                    User Application                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. COLLECTION MODE                                         │
│     ├─ User thinks a command (e.g., "snap")                │
│     ├─ 3-channel EMG signals captured (2-3 seconds)        │
│     ├─ Waveform processing pipeline applied                │
│     └─ Data stored in IndexedDB                            │
│                                                              │
│  2. RECOGNITION MODE                                        │
│     ├─ User thinks a command                               │
│     ├─ Real-time waveform processing                       │
│     ├─ Feature extraction and comparison                   │
│     ├─ Similarity scoring against all stored commands      │
│     └─ Return top-N matches with confidence scores         │
│                                                              │
│  3. DATA MANAGEMENT                                         │
│     ├─ View all collected commands and waveforms          │
│     ├─ Delete commands or individual waveforms            │
│     ├─ Export data as CSV/JSON                            │
│     └─ View recognition history                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Waveform Processing Pipeline

### 2.1 Three-Step Processing (Unified for Collection & Recognition)

The system uses a **unified waveform processing pipeline** to ensure consistency between collection and recognition:

```
Raw Waveform (3 channels × ~1500 samples)
    ↓
[Step 1: Filtering & Denoising]
    ↓
[Step 2: Adaptive Cropping]
    ↓
[Step 3: Scaling to Fixed Length]
    ↓
Processed Waveform (3 channels × 1000 samples)
```

### 2.2 Step 1: Filtering & Denoising

**File**: `client/src/lib/adaptive-waveform-filtering.ts`

#### High-Pass Filter (Remove DC offset and low-frequency noise)
```typescript
export function highPassFilter(
  signal: number[],
  cutoffFreq: number = 20,
  samplingRate: number = 500
): number[] {
  // 1st-order high-pass filter
  // Removes frequencies below cutoff (default 20 Hz)
  
  const RC = 1 / (2 * Math.PI * cutoffFreq);
  const dt = 1 / samplingRate;
  const alpha = RC / (RC + dt);
  
  const filtered: number[] = [];
  let prevFiltered = 0;
  let prevInput = 0;
  
  for (let i = 0; i < signal.length; i++) {
    const output = alpha * (prevFiltered + signal[i] - prevInput);
    filtered.push(output);
    prevFiltered = output;
    prevInput = signal[i];
  }
  
  return filtered;
}
```

#### Median Filter (Remove impulse noise)
```typescript
export function medianFilter(
  signal: number[],
  windowSize: number = 5
): number[] {
  const filtered: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length, i + halfWindow + 1);
    
    const window = signal.slice(start, end).sort((a, b) => a - b);
    const medianIdx = Math.floor(window.length / 2);
    
    filtered.push(window[medianIdx]);
  }
  
  return filtered;
}
```

#### Comprehensive Filtering Pipeline
```typescript
export function comprehensiveFiltering(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  restingBaseline?: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  },
  samplingRate: number = 500
): { ch1: number[]; ch2: number[]; ch3: number[] } {
  // Step 1: High-pass filter each channel (remove DC offset)
  let filtered1 = highPassFilter(ch1, 20, samplingRate);
  let filtered2 = highPassFilter(ch2, 20, samplingRate);
  let filtered3 = highPassFilter(ch3, 20, samplingRate);
  
  // Step 2: Median filter each channel (remove impulse noise)
  filtered1 = medianFilter(filtered1, 5);
  filtered2 = medianFilter(filtered2, 5);
  filtered3 = medianFilter(filtered3, 5);
  
  // Step 3: Optional adaptive filtering using resting baseline
  if (restingBaseline && restingBaseline.ch1.length > 0) {
    filtered1 = adaptiveNoiseFiltering(filtered1, restingBaseline.ch1);
    filtered2 = adaptiveNoiseFiltering(filtered2, restingBaseline.ch2);
    filtered3 = adaptiveNoiseFiltering(filtered3, restingBaseline.ch3);
  }
  
  return {
    ch1: filtered1,
    ch2: filtered2,
    ch3: filtered3,
  };
}
```

### 2.3 Step 2: Adaptive Cropping

**File**: `client/src/lib/adaptive-cropping-algorithm.ts`

The adaptive cropping algorithm solves the problem of **uneven resting segments** at the beginning and end of recordings.

#### Problem
- Users may wait before thinking the command (long leading silence)
- Users may stop immediately after thinking (short trailing silence)
- Fixed 8% resting baseline assumption doesn't work

#### Solution: Energy-Based Onset/Offset Detection

```typescript
export function computeEnergyEnvelope(
  signal: number[],
  windowSize: number = 50
): number[] {
  // Compute local energy using sliding window
  const envelope: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length, i + halfWindow);
    
    let energy = 0;
    for (let j = start; j < end; j++) {
      energy += signal[j] * signal[j];
    }
    
    envelope.push(Math.sqrt(energy / (end - start)));
  }
  
  return envelope;
}

export function detectOnsetPoint(
  envelope: number[],
  options: {
    noisePercentile?: number;  // 25th percentile = noise level
    thresholdMultiplier?: number;  // 2.0x noise level = threshold
    minOnsetLength?: number;  // Minimum 100 samples
  } = {}
): number {
  const {
    noisePercentile = 25,
    thresholdMultiplier = 2.0,
    minOnsetLength = 100,
  } = options;
  
  // Use first 20% as noise reference
  const noiseRefLength = Math.max(50, Math.floor(envelope.length * 0.2));
  const noiseRef = envelope.slice(0, noiseRefLength);
  const noiseLevel = computePercentile(noiseRef, noisePercentile);
  const threshold = noiseLevel * thresholdMultiplier;
  
  // Scan left-to-right for first point exceeding threshold
  let onsetIdx = 0;
  for (let i = 0; i < envelope.length; i++) {
    if (envelope[i] > threshold) {
      onsetIdx = i;
      break;
    }
  }
  
  // Ensure sufficient valid data
  if (onsetIdx + minOnsetLength > envelope.length) {
    onsetIdx = Math.max(0, envelope.length - minOnsetLength);
  }
  
  return onsetIdx;
}

export function detectOffsetPoint(
  envelope: number[],
  options: {
    noisePercentile?: number;
    thresholdMultiplier?: number;
    minOffsetLength?: number;
  } = {}
): number {
  // Same logic but scan right-to-left
  // Use last 20% as noise reference
  // Find last point exceeding threshold
  // ... (similar to detectOnsetPoint but reversed)
}
```

#### Multi-Channel Adaptive Cropping
```typescript
export function adaptiveCropMultiChannel(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  options: {
    windowSize?: number;
    noisePercentile?: number;
    thresholdMultiplier?: number;
    minSegmentLength?: number;
    preserveMargin?: number;
  } = {}
): {
  croppedCh1: number[];
  croppedCh2: number[];
  croppedCh3: number[];
  startIdx: number;
  endIdx: number;
  confidence: number;
} {
  // Compute energy envelope for each channel
  const env1 = computeEnergyEnvelope(ch1, options.windowSize);
  const env2 = computeEnergyEnvelope(ch2, options.windowSize);
  const env3 = computeEnergyEnvelope(ch3, options.windowSize);
  
  // Detect onset/offset for each channel
  const onset1 = detectOnsetPoint(env1, options);
  const onset2 = detectOnsetPoint(env2, options);
  const onset3 = detectOnsetPoint(env3, options);
  
  const offset1 = detectOffsetPoint(env1, options);
  const offset2 = detectOffsetPoint(env2, options);
  const offset3 = detectOffsetPoint(env3, options);
  
  // Union: use minimum onset and maximum offset
  let startIdx = Math.min(onset1, onset2, onset3);
  let endIdx = Math.max(offset1, offset2, offset3);
  
  // Apply margin preservation
  const margin = options.preserveMargin || 20;
  startIdx = Math.max(0, startIdx - margin);
  endIdx = Math.min(Math.max(ch1.length, ch2.length, ch3.length) - 1, endIdx + margin);
  
  // Crop all channels to the same range
  const croppedCh1 = ch1.slice(startIdx, endIdx + 1);
  const croppedCh2 = ch2.slice(startIdx, endIdx + 1);
  const croppedCh3 = ch3.slice(startIdx, endIdx + 1);
  
  // Calculate confidence (0-100)
  const confidence = calculateCropConfidence(env1, env2, env3, startIdx, endIdx);
  
  return {
    croppedCh1,
    croppedCh2,
    croppedCh3,
    startIdx,
    endIdx,
    confidence,
  };
}
```

### 2.4 Step 3: Scaling to Fixed Length

**File**: `client/src/lib/unified-waveform-pipeline.ts`

```typescript
export function improvedScaling(
  signal: number[],
  targetAmplitude?: number,
  options?: {
    targetAmplitude?: number;
    preserveRange?: boolean;
  }
): {
  scaled: number[];
  scaleFactor: number;
} {
  const target = options?.targetAmplitude || 2000;
  
  // Find peak amplitude
  const maxAbs = Math.max(...signal.map(Math.abs));
  
  if (maxAbs === 0) {
    return {
      scaled: signal,
      scaleFactor: 1.0,
    };
  }
  
  // Calculate scale factor
  const scaleFactor = target / maxAbs;
  
  // Apply scaling
  const scaled = signal.map(x => x * scaleFactor);
  
  return {
    scaled,
    scaleFactor,
  };
}

export function resampleSignal(
  signal: number[],
  targetLength: number
): number[] {
  if (signal.length === 0) return [];
  if (signal.length === targetLength) return signal;
  
  const resampled: number[] = [];
  
  for (let i = 0; i < targetLength; i++) {
    // Linear interpolation
    const sourceIdx = (i / targetLength) * (signal.length - 1);
    const lowerIdx = Math.floor(sourceIdx);
    const upperIdx = Math.ceil(sourceIdx);
    const fraction = sourceIdx - lowerIdx;
    
    if (lowerIdx === upperIdx) {
      resampled.push(signal[lowerIdx]);
    } else {
      const interpolated = 
        signal[lowerIdx] * (1 - fraction) + 
        signal[upperIdx] * fraction;
      resampled.push(interpolated);
    }
  }
  
  return resampled;
}
```

---

## 3. Feature Extraction

**File**: `client/src/lib/dsp-processor.ts`

### 3.1 Time-Domain Features (60 features per channel)

```typescript
export function extractTimeDomainFeatures(signal: number[]): number[] {
  const features: number[] = [];
  
  // 1. Statistical features
  const mean = ss.mean(signal);
  const std = ss.standardDeviation(signal);
  const min = Math.min(...signal);
  const max = Math.max(...signal);
  const range = max - min;
  
  features.push(mean, std, min, max, range);
  
  // 2. RMS (Root Mean Square)
  const rms = Math.sqrt(ss.mean(signal.map(x => x * x)));
  features.push(rms);
  
  // 3. Zero Crossing Rate
  let zcr = 0;
  for (let i = 1; i < signal.length; i++) {
    if ((signal[i] >= 0 && signal[i-1] < 0) || 
        (signal[i] < 0 && signal[i-1] >= 0)) {
      zcr++;
    }
  }
  features.push(zcr / signal.length);
  
  // 4. Waveform Length
  let wl = 0;
  for (let i = 1; i < signal.length; i++) {
    wl += Math.abs(signal[i] - signal[i-1]);
  }
  features.push(wl);
  
  // 5. Integrated EMG
  const iemg = signal.reduce((sum, x) => sum + Math.abs(x), 0);
  features.push(iemg);
  
  // 6. Slope Sign Changes
  let ssc = 0;
  for (let i = 1; i < signal.length - 1; i++) {
    const slope1 = signal[i] - signal[i-1];
    const slope2 = signal[i+1] - signal[i];
    if ((slope1 > 0 && slope2 < 0) || (slope1 < 0 && slope2 > 0)) {
      ssc++;
    }
  }
  features.push(ssc);
  
  // 7. Quantiles (25th, 50th, 75th percentiles)
  const sorted = [...signal].sort((a, b) => a - b);
  features.push(
    sorted[Math.floor(signal.length * 0.25)],
    sorted[Math.floor(signal.length * 0.5)],
    sorted[Math.floor(signal.length * 0.75)]
  );
  
  // ... more features (kurtosis, skewness, etc.)
  
  return features;
}
```

### 3.2 Frequency-Domain Features (30 features per channel)

```typescript
export function extractFrequencyDomainFeatures(signal: number[]): number[] {
  const features: number[] = [];
  
  // Compute FFT
  const fft = new FFT(signal.length);
  const spectrum = fft.createComplexArray();
  
  for (let i = 0; i < signal.length; i++) {
    spectrum[i * 2] = signal[i];
    spectrum[i * 2 + 1] = 0;
  }
  
  fft.forward(spectrum);
  
  // Compute magnitude spectrum
  const magnitude: number[] = [];
  for (let i = 0; i < signal.length / 2; i++) {
    const real = spectrum[i * 2];
    const imag = spectrum[i * 2 + 1];
    magnitude.push(Math.sqrt(real * real + imag * imag));
  }
  
  // 1. Power Spectral Density
  const psd = magnitude.map(m => m * m);
  features.push(ss.mean(psd));
  features.push(ss.standardDeviation(psd));
  
  // 2. Spectral Centroid
  let numerator = 0, denominator = 0;
  for (let i = 0; i < magnitude.length; i++) {
    numerator += i * magnitude[i];
    denominator += magnitude[i];
  }
  features.push(denominator > 0 ? numerator / denominator : 0);
  
  // 3. Spectral Spread
  const centroid = features[features.length - 1];
  let spread = 0;
  for (let i = 0; i < magnitude.length; i++) {
    spread += magnitude[i] * Math.pow(i - centroid, 2);
  }
  features.push(Math.sqrt(spread / denominator));
  
  // ... more frequency features
  
  return features;
}
```

### 3.3 MFCC Features (39 features per channel)

```typescript
export function extractMFCCFeatures(signal: number[], samplingRate: number = 500): number[] {
  // Mel-Frequency Cepstral Coefficients
  // 1. Pre-emphasis
  const emphasized = preEmphasis(signal);
  
  // 2. Framing and windowing
  const frames = frameSignal(emphasized, 512, 160);
  
  // 3. FFT and power spectrum
  const powerSpectrum = computePowerSpectrum(frames);
  
  // 4. Mel-scale filterbank
  const melFilterbank = createMelFilterbank(40, samplingRate);
  const melSpectrum = applyFilterbank(powerSpectrum, melFilterbank);
  
  // 5. DCT (Discrete Cosine Transform)
  const mfcc = computeDCT(melSpectrum, 13);
  
  // Flatten to 1D array
  return mfcc.flat();
}
```

### 3.4 Multi-Channel Feature Fusion

```typescript
export function extractAndFuseFeatures(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  samplingRate: number = 500
): number[] {
  // Extract features from each channel
  const ch1_time = extractTimeDomainFeatures(waveform.ch1);  // 60 features
  const ch1_freq = extractFrequencyDomainFeatures(waveform.ch1);  // 30 features
  const ch1_mfcc = extractMFCCFeatures(waveform.ch1, samplingRate);  // 39 features
  
  const ch2_time = extractTimeDomainFeatures(waveform.ch2);
  const ch2_freq = extractFrequencyDomainFeatures(waveform.ch2);
  const ch2_mfcc = extractMFCCFeatures(waveform.ch2, samplingRate);
  
  const ch3_time = extractTimeDomainFeatures(waveform.ch3);
  const ch3_freq = extractFrequencyDomainFeatures(waveform.ch3);
  const ch3_mfcc = extractMFCCFeatures(waveform.ch3, samplingRate);
  
  // Calculate channel weights based on SNR
  const weights = calculateChannelWeights(waveform);
  
  // Fuse features with weights
  const fusedFeatures: number[] = [];
  
  // Time-domain features (60 × 3 = 180)
  for (let i = 0; i < ch1_time.length; i++) {
    fusedFeatures.push(
      ch1_time[i] * weights.ch1 +
      ch2_time[i] * weights.ch2 +
      ch3_time[i] * weights.ch3
    );
  }
  
  // Frequency-domain features (30 × 3 = 90)
  for (let i = 0; i < ch1_freq.length; i++) {
    fusedFeatures.push(
      ch1_freq[i] * weights.ch1 +
      ch2_freq[i] * weights.ch2 +
      ch3_freq[i] * weights.ch3
    );
  }
  
  // MFCC features (39 × 3 = 117)
  for (let i = 0; i < ch1_mfcc.length; i++) {
    fusedFeatures.push(
      ch1_mfcc[i] * weights.ch1 +
      ch2_mfcc[i] * weights.ch2 +
      ch3_mfcc[i] * weights.ch3
    );
  }
  
  // Total: 180 + 90 + 117 = 387 features (but reduced to ~180 after optimization)
  return fusedFeatures;
}

export function calculateChannelWeights(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] }
): { ch1: number; ch2: number; ch3: number } {
  // Calculate SNR for each channel
  const snr1 = calculateSNR(waveform.ch1);
  const snr2 = calculateSNR(waveform.ch2);
  const snr3 = calculateSNR(waveform.ch3);
  
  // Normalize to sum to 1
  const total = snr1 + snr2 + snr3;
  
  return {
    ch1: total > 0 ? snr1 / total : 1/3,
    ch2: total > 0 ? snr2 / total : 1/3,
    ch3: total > 0 ? snr3 / total : 1/3,
  };
}

function calculateSNR(signal: number[]): number {
  // Signal-to-Noise Ratio
  // Assume first 10% is noise
  const noiseLength = Math.floor(signal.length * 0.1);
  const noise = signal.slice(0, noiseLength);
  const signalPart = signal.slice(noiseLength);
  
  const noisePower = ss.mean(noise.map(x => x * x));
  const signalPower = ss.mean(signalPart.map(x => x * x));
  
  return noisePower > 0 ? signalPower / noisePower : 1;
}
```

---

## 4. Recognition & Similarity Scoring

### 4.1 Recognition Flow

**File**: `client/src/pages/RecognitionMode.tsx`

```typescript
async function performRecognition() {
  // Step 1: Capture real-time waveform
  const testWaveform = await captureWaveform();
  
  // Step 2: Process waveform (same pipeline as collection)
  const processedTest = processWaveformUnified(testWaveform, {
    targetLength: 1000,
    samplingRate: 500,
  });
  
  // Step 3: Extract features
  const testFeatures = extractAndFuseFeatures(processedTest.processed);
  
  // Step 4: Load all reference commands
  const commands = await emgDatabase.getAllCommands();
  
  // Step 5: Compare against all reference commands
  const results: RecognitionResult[] = [];
  
  for (const command of commands) {
    for (const collection of command.collections) {
      // Get reference waveform (already processed at collection time)
      const refWaveform = collection.waveform;
      
      // Extract reference features
      const refFeatures = extractAndFuseFeatures(refWaveform);
      
      // Calculate similarity
      const similarity = calculateHybridSimilarity(testFeatures, refFeatures);
      
      results.push({
        command: command.name,
        collectionId: collection.id,
        similarity,
        confidence: similarity * 100,
      });
    }
  }
  
  // Step 6: Aggregate by command (average similarity)
  const commandResults = aggregateByCommand(results);
  
  // Step 7: Sort and return top matches
  return commandResults.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}
```

### 4.2 Similarity Scoring

**File**: `client/src/lib/improved-recognition-similarity.ts`

#### DTW (Dynamic Time Warping) Distance to Similarity
```typescript
export function dtwDistanceToSimilarity(distance: number, featureLength: number): number {
  // Convert DTW distance to similarity percentage
  // Exponential decay: closer distance = higher similarity
  
  const maxDistance = Math.sqrt(featureLength) * 100;
  const normalizedDistance = Math.min(distance / maxDistance, 1.0);
  
  // Exponential decay function
  const similarity = Math.exp(-normalizedDistance * 2);
  
  return Math.max(0, Math.min(1, similarity));
}

export function calculateDTWSimilarity(
  testFeatures: number[],
  refFeatures: number[]
): number {
  // Calculate DTW distance
  const distance = computeDTWDistance(testFeatures, refFeatures);
  
  // Convert to similarity
  return dtwDistanceToSimilarity(distance, testFeatures.length);
}

function computeDTWDistance(seq1: number[], seq2: number[]): number {
  // Dynamic Time Warping algorithm
  // Allows temporal warping to handle timing variations
  
  const n = seq1.length;
  const m = seq2.length;
  
  // Initialize DTW matrix
  const dtw: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(Infinity));
  dtw[0][0] = 0;
  
  // Fill DTW matrix
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(seq1[i - 1] - seq2[j - 1]);
      dtw[i][j] = cost + Math.min(
        dtw[i - 1][j],      // insertion
        dtw[i][j - 1],      // deletion
        dtw[i - 1][j - 1]   // match
      );
    }
  }
  
  return dtw[n][m];
}
```

#### Hybrid Similarity (DTW + Euclidean)
```typescript
export function calculateHybridSimilarity(
  testFeatures: number[],
  refFeatures: number[]
): number {
  // Combine DTW and Euclidean distance for robust matching
  
  // 1. DTW similarity
  const dtwSim = calculateDTWSimilarity(testFeatures, refFeatures);
  
  // 2. Euclidean similarity
  const euclideanDist = Math.sqrt(
    testFeatures.reduce((sum, x, i) => sum + Math.pow(x - refFeatures[i], 2), 0)
  );
  const euclideanSim = Math.exp(-euclideanDist / 1000);
  
  // 3. Weighted combination
  const dtwWeight = 0.6;
  const euclideanWeight = 0.4;
  
  const hybridSim = dtwWeight * dtwSim + euclideanWeight * euclideanSim;
  
  return Math.max(0, Math.min(1, hybridSim));
}
```

---

## 5. Data Storage & Deletion

### 5.1 IndexedDB Schema

**File**: `client/src/lib/db.ts`

```typescript
const DB_CONFIG = {
  NAME: 'emg-database',
  VERSION: 1,
  STORES: {
    COMMANDS: 'commands',
  },
};

export interface CollectionData {
  id: string;  // Unique ID for this collection
  timestamp: number;  // Timestamp when collected
  waveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
  userName: string;
  userId: string;
  metadata: {
    processingQuality: number;  // 0-100
    cropConfidence: number;  // 0-100
    scaleFactor: number;
  };
}

export interface CommandData {
  name: string;  // Command name (e.g., "snap")
  collections: CollectionData[];  // Array of waveforms
  createdAt: number;
  updatedAt: number;
}
```

### 5.2 Permanent Deletion - Command Level

**File**: `client/src/lib/db.ts` (lines 137-204)

```typescript
async deleteCommand(commandName: string): Promise<void> {
  if (!this.db) {
    throw new Error('数据库未初始化');
  }

  return new Promise((resolve, reject) => {
    const transaction = this.db!.transaction(
      [DB_CONFIG.STORES.COMMANDS],
      'readwrite'
    );
    const store = transaction.objectStore(DB_CONFIG.STORES.COMMANDS);

    // Step 1: Check if command exists
    const getRequest = store.get(commandName);

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      
      if (!existing) {
        console.warn(`[删除警告] 指令 "${commandName}" 不存在！`);
        // Abort transaction if command doesn't exist
        transaction.abort();
        reject(new Error(`指令 "${commandName}" 不存在`));
        return;
      }
      
      // Step 2: Delete the command from IndexedDB
      const deleteRequest = store.delete(commandName);
      
      deleteRequest.onerror = () => {
        transaction.abort();
        const error = deleteRequest.error;
        console.error(`[指令删除失败] ${commandName}:`, error);
        reject(new Error(`指令删除失败: ${error?.message || '未知错误'}`));
      };
    };
    
    getRequest.onerror = () => {
      transaction.abort();
      const error = getRequest.error;
      console.error(`[指令查询失败] ${commandName}:`, error);
      reject(new Error(`指令查询失败: ${error?.message || '未知错误'}`));
    };

    // Step 3: Wait for transaction to complete
    transaction.oncomplete = () => {
      console.log(`[事务完成] 指令删除事务已提交: ${commandName}`);
      
      // Step 4: Also delete from localStorage cache
      try {
        const stored = localStorage.getItem('emg-commands');
        if (stored) {
          const commands = JSON.parse(stored);
          const filtered = commands.filter((cmd: any) => cmd.name !== commandName);
          localStorage.setItem('emg-commands', JSON.stringify(filtered));
          console.log(`[localStorage清除] 已删除: ${commandName}`);
        }
      } catch (error) {
        console.warn(`[localStorage清除失败]`, error);
      }
      
      resolve();
    };

    transaction.onerror = () => {
      console.error('[事务失败]', transaction.error);
      reject(new Error(`事务失败: ${transaction.error?.message || '未知错误'}`));
    };
  });
}
```

### 5.3 Permanent Deletion - Waveform Level

**File**: `client/src/lib/db.ts` (lines 210-309)

```typescript
async deleteCollection(commandName: string, collectionId: string): Promise<void> {
  if (!this.db) {
    throw new Error('数据库未初始化');
  }

  return new Promise((resolve, reject) => {
    let operationError: Error | null = null;
    
    const transaction = this.db!.transaction(
      [DB_CONFIG.STORES.COMMANDS],
      'readwrite'
    );
    const store = transaction.objectStore(DB_CONFIG.STORES.COMMANDS);

    // Step 1: Get the command
    const getRequest = store.get(commandName);

    getRequest.onsuccess = () => {
      const command = getRequest.result;
      
      if (!command) {
        console.warn(`[删除波形警告] 指令 "${commandName}" 不存在`);
        operationError = new Error(`指令 "${commandName}" 不存在`);
        return;
      }

      // Step 2: Find the collection to delete
      const idx = command.collections.findIndex((col) => col.id === collectionId);
      if (idx < 0) {
        console.warn(`[删除波形警告] 采集ID ${collectionId} 不存在`);
        operationError = new Error(`采集ID ${collectionId} 不存在`);
        return;
      }

      // Step 3: Remove the waveform from collections array
      command.collections.splice(idx, 1);
      console.log(`[删除波形] 指令 "${commandName}" 的采集 ${collectionId} 已删除, 剩余 ${command.collections.length} 条`);

      // Step 4: If no waveforms left, delete the entire command
      if (command.collections.length === 0) {
        console.log(`[删除指令] 指令 "${commandName}" 波形为空，删除整个指令`);
        const deleteRequest = store.delete(commandName);
        
        deleteRequest.onerror = () => {
          operationError = new Error(`删除指令失败: ${deleteRequest.error?.message || '未知错误'}`);
        };
      } else {
        // Step 5: Save the modified command back to IndexedDB
        const updateRequest = store.put(command);
        
        updateRequest.onerror = () => {
          operationError = new Error(`保存修改失败: ${updateRequest.error?.message || '未知错误'}`);
        };
      }
    };

    getRequest.onerror = () => {
      operationError = new Error(`查询指令失败: ${getRequest.error?.message || '未知错误'}`);
    };

    // Step 6: Wait for transaction to complete
    transaction.oncomplete = () => {
      console.log(`[事务完成] 波形删除事务已提交: ${commandName}`);
      
      if (operationError) {
        reject(operationError);
        return;
      }
      
      // Step 7: Also delete from localStorage cache
      try {
        const stored = localStorage.getItem('emg-commands');
        if (stored) {
          const commands = JSON.parse(stored);
          const filtered = commands.map((cmd: any) => {
            if (cmd.name === commandName) {
              return {
                ...cmd,
                collections: cmd.collections.filter((col: any) => col.id !== collectionId)
              };
            }
            return cmd;
          }).filter((cmd: any) => cmd.collections.length > 0);
          localStorage.setItem('emg-commands', JSON.stringify(filtered));
          console.log(`[localStorage清除] 已删除: ${commandName}/${collectionId}`);
        }
      } catch (error) {
        console.warn(`[localStorage清除失败]`, error);
      }
      
      resolve();
    };

    transaction.onerror = () => {
      reject(new Error(`事务失败: ${transaction.error?.message || '未知错误'}`));
    };
  });
}
```

### 5.4 Data Management UI - Deletion Trigger

**File**: `client/src/pages/DataManagement.tsx`

```typescript
const handleDeleteCommand = async (commandName: string) => {
  if (!window.confirm(`确定要删除指令 "${commandName}" 及其所有采集数据吗？此操作不可撤销。`)) {
    return;
  }

  try {
    // Call permanent deletion
    await emgDatabase.deleteCommand(commandName);
    
    // Refresh UI
    await loadData();
    
    // Show success message
    toast.success(`指令 "${commandName}" 已永久删除`);
  } catch (error) {
    console.error('删除失败:', error);
    toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};

const handleDeleteCollection = async (commandName: string, collectionId: string) => {
  if (!window.confirm('确定要删除这条采集数据吗？此操作不可撤销。')) {
    return;
  }

  try {
    // Call permanent deletion
    await emgDatabase.deleteCollection(commandName, collectionId);
    
    // Refresh UI
    await loadData();
    
    // Show success message
    toast.success('采集数据已永久删除');
  } catch (error) {
    console.error('删除失败:', error);
    toast.error(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};
```

---

## 6. Why Recognition Accuracy is Low (41%)

### 6.1 Root Causes

#### 1. **Extremely Poor Collection Consistency** (Most Critical)
- **Problem**: Same command from same user has very different waveforms
- **Evidence**: 
  - Similarity between same-command waveforms: 0.02 - 0.18 (should be >0.7)
  - Muscle contraction strength varies wildly
  - Contraction duration varies (0.5s to 2.5s)
  - Timing of onset varies significantly

**Example**: User says "snap" 5 times:
- Collection 1: Strong, fast contraction (0.8s)
- Collection 2: Weak, slow contraction (2.0s)
- Collection 3: Medium, stuttering contraction (1.2s)
- Similarity between 1-2: 0.05 (very different!)

#### 2. **Channel Imbalance**
- **Problem**: Ch3 often has almost no signal
- **Evidence**:
  - Ch1 SNR: 5-10
  - Ch2 SNR: 2-5
  - Ch3 SNR: 0.1-0.5 (nearly noise)
- **Impact**: Weighted fusion gives Ch3 almost zero weight, losing potential information

#### 3. **Cropping Quality Variation**
- **Problem**: Adaptive cropping confidence varies 39.6% - 97.2%
- **Impact**: Low-confidence crops lose important signal boundaries

#### 4. **User Behavior Inconsistency**
- **Problem**: Users don't follow consistent contraction patterns
- **Evidence**:
  - Some users wait before thinking (long leading silence)
  - Some users stop immediately (short trailing silence)
  - Contraction intensity varies based on fatigue, attention, emotion
  - No standardized "thinking" technique

#### 5. **Feature Extraction Sensitivity**
- **Problem**: Small waveform variations cause large feature variations
- **Impact**: 
  - 10% amplitude change → 20% feature change
  - 5% timing shift → 15% feature change
  - Cumulative effect: different collections of same command → completely different features

### 6.2 Current Improvements Applied

1. ✅ **Adaptive Cropping** - Handles uneven resting segments
2. ✅ **Multi-Channel Weighting** - Accounts for channel SNR differences
3. ✅ **Hybrid Similarity** - Combines DTW + Euclidean for robustness
4. ✅ **Collection Quality Scoring** - Identifies low-quality collections
5. ✅ **Unified Pipeline** - Ensures collection and recognition use same processing

### 6.3 Remaining Issues

1. **No Collection Filtering** - Low-quality collections still used for recognition
2. **No Clustering** - All collections treated equally, even if they're outliers
3. **No User Training** - Users don't know how to collect consistently
4. **No Personalization** - Same thresholds for all users
5. **Limited Temporal Modeling** - DTW helps but doesn't fully capture timing variations

---

## 7. Recommended Diagnostic Steps for External AI

### 7.1 Data Analysis
1. **Examine collection consistency**:
   ```
   For each command:
     For each user:
       Calculate pairwise similarity between all collections
       If median similarity < 0.5: Flag as "inconsistent collection"
   ```

2. **Analyze channel distribution**:
   ```
   For each collection:
     Calculate SNR for each channel
     If Ch3 SNR < 0.5: Flag as "weak channel"
     If any channel SNR < 1: Flag as "poor quality"
   ```

3. **Check cropping quality**:
   ```
   For each collection:
     If crop confidence < 60%: Flag as "uncertain crop"
     If crop removed >50% of signal: Flag as "aggressive crop"
   ```

### 7.2 Code Review Focus Areas
1. **Feature Extraction** - Are features normalized consistently?
2. **DTW Implementation** - Is DTW distance calculated correctly?
3. **Similarity Thresholds** - Are thresholds too strict or too loose?
4. **Collection Quality Scoring** - Is quality score predictive of recognition accuracy?

### 7.3 Debugging Approach
1. **Single Command Test**: Collect 10 "snap" commands, check similarity matrix
2. **Cross-User Test**: Compare same command from different users
3. **Feature Visualization**: Plot features in 2D/3D space to see clustering
4. **Threshold Tuning**: Adjust similarity thresholds and measure accuracy change

---

## 8. Key Files Reference

| File | Purpose | Key Functions |
|------|---------|---|
| `unified-waveform-pipeline.ts` | Main processing pipeline | `processWaveformUnified()` |
| `adaptive-waveform-filtering.ts` | Filtering & resampling | `comprehensiveFiltering()`, `resampleSignal()` |
| `adaptive-cropping-algorithm.ts` | Adaptive cropping | `adaptiveCropMultiChannel()` |
| `dsp-processor.ts` | Feature extraction | `extractTimeDomainFeatures()`, `extractFrequencyDomainFeatures()` |
| `improved-recognition-similarity.ts` | Similarity scoring | `calculateHybridSimilarity()` |
| `db.ts` | IndexedDB operations | `deleteCommand()`, `deleteCollection()` |
| `RecognitionMode.tsx` | Recognition UI | `performRecognition()` |
| `DataManagement.tsx` | Data management UI | `handleDeleteCommand()` |

---

## 9. Test Data Statistics

- **Total Commands**: 3
- **Total Collections**: 10
- **Average Collections per Command**: 3.3
- **Cropping Confidence Range**: 39.6% - 97.2%
- **Current Recognition Accuracy**: ~41%
- **Target Recognition Accuracy**: >90%


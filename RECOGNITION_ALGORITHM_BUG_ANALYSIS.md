# 识别算法系统性偏差诊断报告

**生成时间：** 2026-05-27  
**问题现象：** 所有默念测试结果被识别成错误的指令，准确率仅41.3%  
**根本原因：** 特征提取和融合的多个致命缺陷  

---

## 1. 问题现象

### 识别结果完全混乱
- 采集3个指令(one, two, snap)
- 识别出9个不同的指令（包括未采集的666、888、fix等）
- 准确率仅41.3% (50/121)
- 所有识别结果的置信度都在90-100%（虚假高置信度）

### 采集数据能量分布

| 指令 | Ch1能量范围 | Ch1占比 | 总能量CV |
|------|-----------|--------|---------|
| one | 250K-319K | 85-92% | 0.111 |
| two | 291K-422K | 77-88% | 0.153 |
| snap | 274K-357K | 91-94% | 0.087 |

**关键发现：三个指令的能量范围严重重叠！**

---

## 2. 根本原因分析

### 原因1：特征归一化破坏了指令差异信息（最严重）

**问题代码：** `dsp-processor.ts` 第547-554行

```typescript
export function normalizeFeatures(features: number[]): number[] {
  const mean = ss.mean(features);
  const std = ss.standardDeviation(features);
  if (std === 0) return features;
  return features.map((f) => (f - mean) / std);  // ❌ 致命缺陷
}
```

**问题描述：**
- 对**整个150维特征向量**进行全局标准化
- 计算所有特征的全局均值和标准差
- 将所有特征映射到相同的分布（均值0，标差1）

**为什么这是错误的：**
1. **指令差异被抹除** - 不同指令的特征被强制映射到相同分布
2. **能量信息丢失** - 原有的能量差异被标准化消除
3. **特征间相关性破坏** - 特征之间的相对关系被改变

**影响：**
- one、two、snap的特征在标准化后看起来都很相似
- 识别算法无法区分指令
- 只能基于随机噪声进行分类

### 原因2：多通道权重计算错误

**问题代码：** `multi-channel-fusion.ts` 第38-50行

```typescript
export function calculateChannelSNR(signal: number[]): number {
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length;
  const std = Math.sqrt(variance);
  
  const signalPower = std;
  const noisePower = Math.abs(mean) || 0.001;  // ❌ 错误！
  
  return signalPower / noisePower;
}
```

**问题描述：**
- 使用`mean`（直流分量）作为噪声功率
- SNR = 标准差 / |直流分量|

**为什么这是错误的：**
1. **直流分量不是噪声** - 直流分量是信号的一部分，不是噪声
2. **权重计算不准确** - 导致多通道融合权重错误
3. **Ch3权重过大** - Ch3几乎无信号，但权重可能很大

**标准的SNR定义：**
- SNR = 信号功率 / 噪声功率
- 信号功率 = 方差（去掉直流分量后）
- 噪声功率 = 残差方差或其他估计

### 原因3：特征维度太高

**问题：**
- 采集数据长度：512个样本
- 特征维度：150维
- 比例：512/150 ≈ 3.4

**为什么这是问题：**
1. **样本数不足** - 采集次数（7-8次）远小于特征维度（150）
2. **过度拟合** - 模型会拟合采集数据中的噪声
3. **特征空间稀疏** - 高维空间中样本稀疏，距离度量失效

**建议：** 特征维度应该 < 采集次数 × 10，即 <70-80维

### 原因4：特征融合策略不当

**问题：**
```typescript
// recognition-processing.ts 第101-127行
export function extractAndFuseFeatures(
  processedWaveform: ProcessedWaveform,
  weights?: { ch1: number; ch2: number; ch3: number }
) {
  const features = extractFullFeatures(...);
  const channelWeights = weights || calculateChannelWeights(...);
  const fusedFeatures = fuseChannelFeatures(
    features.timeDomain.ch1,
    features.timeDomain.ch2,
    features.timeDomain.ch3,
    channelWeights
  );
  return normalizeFeatures(fusedFeatures);  // ❌ 再次全局归一化！
}
```

**问题：**
1. 特征被融合后，再次进行全局归一化
2. 融合后的特征再次被映射到相同分布
3. 多通道融合的效果被完全抹除

---

## 3. 为什么识别置信度都很高

**虚假高置信度的原因：**

```typescript
// recognition-processing.ts 第136-162行
export function calculateFeatureSimilarity(
  features1: number[],
  features2: number[],
  method: 'dtw' | 'hybrid' | 'euclidean' = 'hybrid'
): number {
  // ... 计算相似度
  const similarity = 1 / (1 + distance);
  return similarity * 100;  // 转换为百分比
}
```

**问题：**
1. 所有特征都被归一化到相同分布
2. 任何两个特征的距离都很小
3. 相似度计算公式 `1 / (1 + distance)` 将小距离映射到高相似度
4. 结果：所有识别的置信度都在90-100%

**例如：**
- 如果距离 = 0.1，相似度 = 1/(1+0.1) = 0.909 = 90.9%
- 如果距离 = 0.05，相似度 = 1/(1+0.05) = 0.952 = 95.2%
- 所有距离都很小，所以所有相似度都很高

---

## 4. 修复方案

### 修复1：修正特征归一化（最重要）

**问题代码：**
```typescript
// ❌ 错误：全局归一化
export function normalizeFeatures(features: number[]): number[] {
  const mean = ss.mean(features);
  const std = ss.standardDeviation(features);
  if (std === 0) return features;
  return features.map((f) => (f - mean) / std);
}
```

**修复方案：**
```typescript
// ✅ 正确：通道级归一化
export function normalizeFeatures(features: number[]): number[] {
  // 不进行全局归一化，保留原始特征的相对差异
  // 或者使用通道级归一化
  return features;  // 保留原始特征
}

// 新增：通道级归一化
export function normalizeChannelFeatures(
  ch1Features: number[],
  ch2Features: number[],
  ch3Features: number[]
): { ch1: number[], ch2: number[], ch3: number[] } {
  const normalize = (features: number[]) => {
    const mean = ss.mean(features);
    const std = ss.standardDeviation(features);
    if (std === 0) return features;
    return features.map((f) => (f - mean) / std);
  };
  
  return {
    ch1: normalize(ch1Features),
    ch2: normalize(ch2Features),
    ch3: normalize(ch3Features),
  };
}
```

### 修复2：修正SNR计算

**问题代码：**
```typescript
// ❌ 错误
export function calculateChannelSNR(signal: number[]): number {
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length;
  const std = Math.sqrt(variance);
  const signalPower = std;
  const noisePower = Math.abs(mean) || 0.001;  // ❌ 错误
  return signalPower / noisePower;
}
```

**修复方案：**
```typescript
// ✅ 正确
export function calculateChannelSNR(signal: number[]): number {
  if (signal.length === 0) return 0;
  
  // 计算信号功率（方差）
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
  const variance = signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length;
  const signalPower = Math.sqrt(variance);
  
  // 计算噪声功率（使用高频分量估计）
  // 简单方法：使用相邻样本的差异
  let diffSum = 0;
  for (let i = 1; i < signal.length; i++) {
    diffSum += (signal[i] - signal[i-1]) ** 2;
  }
  const noisePower = Math.sqrt(diffSum / (signal.length - 1)) || 0.001;
  
  return signalPower / noisePower;
}
```

### 修复3：降低特征维度

**当前：** 150维特征，采集7-8次  
**问题：** 特征维度 > 采集次数 × 20，严重过度拟合

**修复方案：**

```typescript
// 只使用时域特征（30维）+ 频域特征（18维）= 48维
// 或者使用主成分分析（PCA）降维到30-40维

export function extractFullFeatures(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 500,
  enablePreprocessing: boolean = true
): EMGFeatures {
  // 信号预处理
  let processedCh1 = ch1, processedCh2 = ch2, processedCh3 = ch3;
  if (enablePreprocessing) {
    const preprocessed = preprocessSignal(ch1, ch2, ch3, samplingRate, true);
    processedCh1 = preprocessed.ch1;
    processedCh2 = preprocessed.ch2;
    processedCh3 = preprocessed.ch3;
  }

  // 时域特征：每个通道 10 维，共 30 维
  const timeDomainCh1 = extractTimeDomainFeatures(processedCh1, true);
  const timeDomainCh2 = extractTimeDomainFeatures(processedCh2, true);
  const timeDomainCh3 = extractTimeDomainFeatures(processedCh3, true);

  // 频域特征：每个通道 6 维（简化版本），共 18 维
  const frequencyDomainCh1 = extractFrequencyDomainFeaturesSimplified(processedCh1, samplingRate);
  const frequencyDomainCh2 = extractFrequencyDomainFeaturesSimplified(processedCh2, samplingRate);
  const frequencyDomainCh3 = extractFrequencyDomainFeaturesSimplified(processedCh3, samplingRate);

  // 组合特征向量（48维）
  const fullFeature = [
    ...timeDomainCh1,
    ...timeDomainCh2,
    ...timeDomainCh3,
    ...frequencyDomainCh1,
    ...frequencyDomainCh2,
    ...frequencyDomainCh3,
  ];

  return {
    timeDomain: { ch1: timeDomainCh1, ch2: timeDomainCh2, ch3: timeDomainCh3 },
    frequencyDomain: { ch1: frequencyDomainCh1, ch2: frequencyDomainCh2, ch3: frequencyDomainCh3 },
    fullFeature,
  };
}
```

### 修复4：修正特征融合流程

**问题代码：**
```typescript
// ❌ 错误：融合后再次全局归一化
export function extractAndFuseFeatures(
  processedWaveform: ProcessedWaveform,
  weights?: { ch1: number; ch2: number; ch3: number }
) {
  const features = extractFullFeatures(...);
  const channelWeights = weights || calculateChannelWeights(...);
  const fusedFeatures = fuseChannelFeatures(...);
  return normalizeFeatures(fusedFeatures);  // ❌ 错误！
}
```

**修复方案：**
```typescript
// ✅ 正确：只进行通道级归一化，不进行全局归一化
export function extractAndFuseFeatures(
  processedWaveform: ProcessedWaveform,
  weights?: { ch1: number; ch2: number; ch3: number }
) {
  const features = extractFullFeatures(...);
  
  // 通道级归一化（保留指令差异）
  const normalized = normalizeChannelFeatures(
    features.timeDomain.ch1,
    features.timeDomain.ch2,
    features.timeDomain.ch3
  );
  
  const channelWeights = weights || calculateChannelWeights(...);
  
  // 融合三通道特征
  const fusedFeatures = fuseChannelFeatures(
    normalized.ch1,
    normalized.ch2,
    normalized.ch3,
    channelWeights
  );
  
  // ✅ 不再进行全局归一化
  return fusedFeatures;
}
```

---

## 5. 实施步骤

### 立即实施（今天）

1. **修复特征归一化**
   - 移除全局归一化
   - 实现通道级归一化
   - 测试：特征应该保留指令差异

2. **修复SNR计算**
   - 使用正确的SNR定义
   - 测试：权重应该合理分配

3. **降低特征维度**
   - 从150维降到48维
   - 移除MFCC和梅尔谱图特征
   - 测试：模型不应该过度拟合

### 验证方法

```typescript
// 验证修复效果
const cmd1Features = extractAndFuseFeatures(processedOne);
const cmd2Features = extractAndFuseFeatures(processedTwo);
const cmd3Features = extractAndFuseFeatures(processedSnap);

// 计算特征距离
const dist12 = euclideanDistance(cmd1Features, cmd2Features);
const dist13 = euclideanDistance(cmd1Features, cmd3Features);
const dist23 = euclideanDistance(cmd2Features, cmd3Features);

console.log(`距离 one-two: ${dist12}`);
console.log(`距离 one-snap: ${dist13}`);
console.log(`距离 two-snap: ${dist23}`);

// 期望：不同指令的距离应该 > 同指令采集间的距离
// 同指令采集间距离应该 < 0.5
// 不同指令距离应该 > 1.0
```

---

## 6. 预期效果

| 修复项 | 预期准确率提升 | 实施时间 |
|--------|------------|--------|
| 修复特征归一化 | +20-30% | 30分钟 |
| 修复SNR计算 | +5-10% | 30分钟 |
| 降低特征维度 | +10-15% | 1小时 |
| **总计** | **+35-55%** | **2小时** |

**预期最终准确率：** 75-95%（从当前41.3%）

---

## 7. 关键要点

1. **特征归一化是致命缺陷** - 必须立即修复
2. **保留指令差异信息** - 不能进行全局归一化
3. **降低特征维度** - 防止过度拟合
4. **正确计算权重** - 多通道融合才能有效


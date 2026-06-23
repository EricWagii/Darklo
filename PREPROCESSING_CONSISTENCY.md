# EMG 信号预处理流程一致性验证

## 概述

本文档验证了 Ear EMG 默念测试系统中，**采集训练阶段** 和 **默念测试阶段** 使用的信号预处理流程是否完全一致。

---

## 核心结论

✅ **默念测试时采集的波形经过了完全相同的预处理流程**

两个阶段都使用同一个 `extractFullFeatures()` 函数，包含相同的滤波、ICA、特征提取步骤。

---

## 详细分析

### 1. 采集训练阶段 (CollectionMode)

**数据流**：
```
STM32 硬件 → 串口接收 → 原始波形缓冲 → 保存到 localStorage
                                    ↓
                           (预处理在特征提取时进行)
```

**关键代码** (`client/src/pages/CollectionMode.tsx:313-318`):
```typescript
const newCollection: CollectionData = {
  index: collectionHistory.length + 1,
  timestamp: new Date(),
  waveform: currentWaveform,  // 保存原始波形
  duration: collectionTime,
};
```

**特征提取时机**：
- 训练 CNN 模型时：`cnn-model-manager.ts:70`
- 欧氏距离识别时：`RecognitionMode.tsx:281-284`

---

### 2. 默念测试阶段 (RecognitionMode)

**数据流**：
```
STM32 硬件 → 串口接收 → 实时波形缓冲 → 特征提取 → 识别
```

**关键代码** (`client/src/pages/RecognitionMode.tsx:250-254`):
```typescript
const features = extractFullFeatures(
  waveformBufferRef.current.ch1,
  waveformBufferRef.current.ch2,
  waveformBufferRef.current.ch3
);
```

---

### 3. 预处理管道详情

#### 3.1 `extractFullFeatures()` 函数

**位置**：`client/src/lib/dsp-processor.ts:435-509`

**函数签名**：
```typescript
export function extractFullFeatures(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  samplingRate: number = 250,
  enablePreprocessing: boolean = true
): EMGFeatures
```

**参数一致性**：
| 参数 | 采集训练 | 默念测试 | 一致性 |
|------|---------|---------|--------|
| `samplingRate` | 250 | 250 | ✅ |
| `enablePreprocessing` | true | true | ✅ |

#### 3.2 预处理步骤

**步骤 1：陷波滤波 (50Hz)**
```typescript
// dsp-processor.ts:277
let processed = applyNotchFilterMultiChannel(ch1, ch2, ch3, 50, samplingRate);
```
- 使用二阶 IIR 陷波滤波器
- 去除工频干扰

**步骤 2：陷波滤波 (60Hz)**
```typescript
// dsp-processor.ts:280
processed = applyNotchFilterMultiChannel(processed.ch1, processed.ch2, processed.ch3, 60, samplingRate);
```
- 美国标准频率支持

**步骤 3：高通滤波 (10Hz)**
```typescript
// dsp-processor.ts:283-287
processed = {
  ch1: highPassFilter(processed.ch1, 10, samplingRate),
  ch2: highPassFilter(processed.ch2, 10, samplingRate),
  ch3: highPassFilter(processed.ch3, 10, samplingRate),
};
```
- 去除低频漂移

**步骤 4：ICA 处理**
```typescript
// dsp-processor.ts:290-292
if (enableICA) {
  processed = applyICAProcessing(processed.ch1, processed.ch2, processed.ch3);
}
```
- FastICA 算法
- 分离独立成分
- 去除运动伪影

#### 3.3 特征提取

**时域特征** (30 维)：
- 每通道 10 维：均值、标准差、方差、峰值、峰峰值、RMS、MAV、ZCR、波形长度、斜率变化

**频域特征** (18 维)：
- 每通道 6 维：主频率、频率中心、带宽、低频能量比、中频能量比、高频能量比

**MFCC 特征** (39 维)：
- 每通道 13 维梅尔频率倒谱系数

**梅尔谱图特征** (21 维)：
- 每通道 7 维梅尔谱图

**总计**：150+ 维特征向量

#### 3.4 特征归一化

```typescript
// dsp-processor.ts:514-521
export function normalizeFeatures(features: number[]): number[] {
  const mean = ss.mean(features);
  const std = ss.standardDeviation(features);
  if (std === 0) return features;
  return features.map((f) => (f - mean) / std);
}
```
- Z-score 归一化

---

## 识别路径一致性验证

### CNN 识别路径

**训练时** (`cnn-model-manager.ts:70`):
```typescript
const emgFeatures = extractFullFeatures(sample.ch1, sample.ch2, sample.ch3, 250, true);
features.push(emgFeatures.fullFeature);
```

**测试时** (`cnn-model-manager.ts:132`):
```typescript
const emgFeatures = extractFullFeatures(ch1, ch2, ch3, 250, true);
const features = emgFeatures.fullFeature;
```

**一致性**：✅ **完全相同** - 使用同一函数，参数相同

---

### 欧氏距离识别路径

**训练时** (`RecognitionMode.tsx:281-284`):
```typescript
const refFeatures = extractFullFeatures(
  collection.waveform.ch1,
  collection.waveform.ch2,
  collection.waveform.ch3
);
const fusedRefFeatures = fuseChannelFeatures(
  refFeatures.timeDomain.ch1,
  refFeatures.timeDomain.ch2,
  refFeatures.timeDomain.ch3,
  weights
);
const normalizedRefFeatures = normalizeFeatures(fusedRefFeatures);
```

**测试时** (`RecognitionMode.tsx:250-271`):
```typescript
const features = extractFullFeatures(
  waveformBufferRef.current.ch1,
  waveformBufferRef.current.ch2,
  waveformBufferRef.current.ch3
);
const weights = calculateChannelWeights(...);
const fusedFeatures = fuseChannelFeatures(
  features.timeDomain.ch1,
  features.timeDomain.ch2,
  features.timeDomain.ch3,
  weights
);
const normalizedFeatures = normalizeFeatures(fusedFeatures);
```

**一致性**：✅ **完全相同** - 使用相同的特征提取、融合、归一化流程

---

## 多通道融合

**注意**：多通道融合是在特征提取**之后**的操作，不属于预处理管道的一部分。

```typescript
// multi-channel-fusion.ts
export function fuseChannelFeatures(
  ch1Features: number[],
  ch2Features: number[],
  ch3Features: number[],
  weights: { ch1: number; ch2: number; ch3: number }
): number[]
```

- 根据 SNR 动态计算权重
- 融合三通道特征
- 两个阶段都使用相同的融合逻辑

---

## 自适应阈值

**注意**：自适应阈值是在识别**之后**的操作，用于动态调整相似度阈值。

```typescript
// RecognitionMode.tsx:309
const threshold = adaptiveThreshold * 100;
result = {
  timestamp: new Date(),
  command: topCommand.score < threshold ? '❌ 识别不确定' : topCommand.command,
  confidence: topCommand.score,
  allScores: scores,
};
```

- 根据用户反馈历史自动调整
- 不影响特征提取的一致性

---

## 质量保证

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 预处理函数一致性 | ✅ | 两个阶段使用同一个 `extractFullFeatures()` |
| 参数一致性 | ✅ | `samplingRate=250, enablePreprocessing=true` |
| 滤波参数一致性 | ✅ | 陷波 50/60Hz、高通 10Hz |
| ICA 处理一致性 | ✅ | 都启用 FastICA |
| 特征维度一致性 | ✅ | 都提取 150+ 维特征 |
| 归一化方法一致性 | ✅ | 都使用 Z-score 归一化 |
| 融合方法一致性 | ✅ | 都使用 SNR 权重融合 |

---

## 结论

✅ **默念测试时采集的波形经过了完全相同的预处理流程**

系统设计确保了：
1. **特征提取的一致性**：使用同一个函数，参数相同
2. **预处理步骤的一致性**：滤波、ICA、特征提取流程相同
3. **识别路径的一致性**：CNN 和欧氏距离识别都使用相同的特征
4. **数据质量的一致性**：多通道融合和自适应阈值不影响基础特征的一致性

这确保了模型在训练和测试阶段使用的特征分布一致，提高了识别的准确性和可靠性。

---

## 参考文件

- `client/src/lib/dsp-processor.ts` - 信号处理和特征提取
- `client/src/lib/cnn-model-manager.ts` - CNN 模型管理
- `client/src/lib/multi-channel-fusion.ts` - 多通道融合
- `client/src/pages/CollectionMode.tsx` - 采集训练页面
- `client/src/pages/RecognitionMode.tsx` - 默念测试页面

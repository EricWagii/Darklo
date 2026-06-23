# Ear-EMG Silent Speech Recognition System - Complete Analysis Document

**生成时间**: 2026-05-27  
**项目版本**: v1.0.0  
**当前准确率**: 77.5% (实际测试)  
**目标准确率**: >90%  
**诊断对象**: 外部AI系统分析

---

## 1. 系统功能概述

### 1.1 核心目标
实现基于耳周肌电(Ear EMG)信号的静默语音识别系统，通过采集用户默念时的肌肉电信号，使用信号处理和机器学习算法识别用户的意图指令。

### 1.2 应用场景
- 人机交互：无声控制设备
- 医疗辅助：失语症患者通信
- 生物识别：个性化认证
- 隐私保护：嘈杂环境下的隐蔽通信

### 1.3 硬件架构
```
STM32 微控制器
├─ 三通道EMG采集模块（Ch1, Ch2, Ch3）
├─ 采样率：500Hz
├─ 分辨率：12-bit ADC
└─ 通过Web Serial API与浏览器通信

用户界面
├─ React 19 + Tailwind CSS
├─ 采集模式：实时波形显示、手动/自动裁剪
├─ 识别模式：实时识别、置信度显示、用户反馈
└─ 数据管理：采集数据查看、删除、导出
```

---

## 2. 数据处理流程

### 2.1 采集流程（Collection Pipeline）

```
STM32 硬件采集
    ↓
原始三通道波形 (Ch1, Ch2, Ch3)
    ↓
预处理管道 (processWaveformUnified)
├─ 50Hz陷波滤波（去除工频干扰）
├─ 60Hz陷波滤波（美国标准）
├─ 20Hz高通滤波（去除低频漂移）
└─ FastICA独立成分分析（去除运动伪影）
    ↓
自适应裁剪 (adaptiveCropMultiChannel)
├─ 多通道SNR权重融合
├─ 有效片段检测
└─ 自动对齐
    ↓
幅值缩放 (normalize to [-1, 1])
    ↓
重采样到512个样本点
    ↓
保存到IndexedDB
```

### 2.2 识别流程（Recognition Pipeline）

```
实时测试波形采集
    ↓
使用相同的预处理管道处理
    ↓
自适应裁剪到512个样本点
    ↓
特征提取 (extractFullFeatures)
├─ 时域特征：10维/通道 (均值、标差、峰值等)
├─ 频域特征：6维/通道 (主频率、频率中心等)
└─ 融合特征：30维 (三通道加权融合)
    ↓
与特征库中所有采集样本比对
├─ 计算相似度（DTW/Hybrid/Euclidean）
├─ 取平均相似度
└─ 排序获取最高分指令
    ↓
自适应阈值判断
    ↓
显示识别结果和反馈面板
    ↓
用户提交反馈
    ↓
保存识别记录到历史
```

---

## 3. 关键代码实现

### 3.1 特征提取 (dsp-processor.ts)

```typescript
/**
 * 提取时域特征（每个通道10个特征）
 */
export function extractTimeDomainFeatures(signal: number[]): number[] {
  const filtered = highPassFilter(signal);
  
  return [
    ss.mean(filtered),                    // 均值
    ss.standardDeviation(filtered),       // 标准差
    ss.variance(filtered),                // 方差
    Math.max(...filtered.map(Math.abs)),  // 峰值
    Math.max(...filtered) - Math.min(...filtered), // 峰峰值
    Math.sqrt(ss.mean(filtered.map(x => x * x))), // RMS
    ss.mean(filtered.map(Math.abs)),      // 平均绝对值
    // 零交叉率、波形长度、坡度变化...
  ];
}

/**
 * 提取完整特征（三通道）
 */
export function extractFullFeatures(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): {
  timeDomain: { ch1: number[], ch2: number[], ch3: number[] };
  frequencyDomain: { ch1: number[], ch2: number[], ch3: number[] };
} {
  return {
    timeDomain: {
      ch1: extractTimeDomainFeatures(ch1),
      ch2: extractTimeDomainFeatures(ch2),
      ch3: extractTimeDomainFeatures(ch3),
    },
    frequencyDomain: {
      ch1: extractFrequencyDomainFeatures(ch1),
      ch2: extractFrequencyDomainFeatures(ch2),
      ch3: extractFrequencyDomainFeatures(ch3),
    },
  };
}
```

### 3.2 多通道融合 (multi-channel-fusion.ts)

```typescript
/**
 * 计算通道SNR权重
 */
export function calculateChannelWeights(
  ch1: number[],
  ch2: number[],
  ch3: number[]
): { ch1: number; ch2: number; ch3: number } {
  // SNR = 信号方差 / 噪声方差
  // 噪声方差 = 相邻采样点差值的平均方差
  
  const snr1 = calculateChannelSNR(ch1);
  const snr2 = calculateChannelSNR(ch2);
  const snr3 = calculateChannelSNR(ch3);
  
  const totalSNR = snr1 + snr2 + snr3;
  
  return {
    ch1: snr1 / totalSNR,
    ch2: snr2 / totalSNR,
    ch3: snr3 / totalSNR,
  };
}

/**
 * 融合三通道特征
 */
export function fuseChannelFeatures(
  ch1Features: number[],
  ch2Features: number[],
  ch3Features: number[],
  weights: { ch1: number; ch2: number; ch3: number }
): number[] {
  const fused: number[] = [];
  
  for (let i = 0; i < ch1Features.length; i++) {
    fused.push(
      weights.ch1 * ch1Features[i] +
      weights.ch2 * ch2Features[i] +
      weights.ch3 * ch3Features[i]
    );
  }
  
  return fused;
}
```

### 3.3 识别处理 (recognition-processing.ts)

```typescript
/**
 * 提取并融合特征
 */
export function extractAndFuseFeatures(
  processedWaveform: ProcessedWaveform,
  weights?: { ch1: number; ch2: number; ch3: number }
) {
  const features = extractFullFeatures(
    processedWaveform.ch1,
    processedWaveform.ch2,
    processedWaveform.ch3
  );

  const channelWeights = weights || calculateChannelWeights(
    processedWaveform.ch1,
    processedWaveform.ch2,
    processedWaveform.ch3
  );

  // 融合三通道特征（仅时域特征）
  const fusedFeatures = fuseChannelFeatures(
    features.timeDomain.ch1,
    features.timeDomain.ch2,
    features.timeDomain.ch3,
    channelWeights
  );

  // ✅ 关键修复：返回融合后的特征，不进行全局归一化
  return fusedFeatures;
}

/**
 * 计算特征相似度
 */
export function calculateFeatureSimilarity(
  features1: number[],
  features2: number[],
  method: 'dtw' | 'hybrid' | 'euclidean' = 'hybrid'
): number {
  switch (method) {
    case 'dtw':
      return calculateDTWSimilarity(features1, features2);
    case 'hybrid':
      return calculateHybridSimilarity(features1, features2, 0.6);
    case 'euclidean':
    default:
      let sumSquaredDiff = 0;
      for (let i = 0; i < features1.length; i++) {
        const diff = features1[i] - features2[i];
        sumSquaredDiff += diff * diff;
      }
      const distance = Math.sqrt(sumSquaredDiff);
      const similarity = 1 / (1 + distance);
      return similarity * 100;
  }
}
```

### 3.4 识别主流程 (RecognitionMode.tsx 第348-425行)

```typescript
// 使用多通道融合和自适应阈值的欧氏距离识别
const features = extractFullFeatures(
  normalizedWaveform.ch1,
  normalizedWaveform.ch2,
  normalizedWaveform.ch3
);

// 计算通道权重（基于SNR）
const weights = calculateChannelWeights(
  normalizedWaveform.ch1,
  normalizedWaveform.ch2,
  normalizedWaveform.ch3
);

// 提取并融合测试波形的特征
const testFeatures = extractAndFuseFeatures(processedWaveform, weights);

// 与每个指令的特征库比对
const scores: Array<{ command: string; score: number }> = [];

for (const cmd of savedCommands) {
  let totalSimilarity = 0;
  let validCount = 0;

  // 与该指令的所有采集样本比对，计算平均相似度
  for (const collection of cmd.collections) {
    // 重要：不要重复处理已经处理过的波形
    // 采集时已经上过滤波、裁剪、缩放，直接使用已处理的波形
    const refProcessedWaveform: ProcessedWaveform = {
      ch1: collection.waveform.ch1,
      ch2: collection.waveform.ch2,
      ch3: collection.waveform.ch3,
      meta: { /* metadata */ },
    };
    
    const refFeatures = extractAndFuseFeatures(refProcessedWaveform, weights);
    
    // 使用改进的DTW混合相似度计算
    const similarity = calculateFeatureSimilarity(testFeatures, refFeatures, 'hybrid');
    totalSimilarity += similarity;
    validCount++;
  }

  // 使用平均相似度代替最大相似度，提高稳定性
  const averageSimilarity = validCount > 0 ? totalSimilarity / validCount : 0;
  scores.push({ command: cmd.name, score: averageSimilarity });
}

// 排序并获取最高分
scores.sort((a, b) => b.score - a.score);
const topCommand = scores[0];

// 使用自适应阈值
const threshold = adaptiveThreshold * 100;
result = {
  timestamp: new Date(),
  command: topCommand.score < threshold ? '❌ 识别不确定' : topCommand.command,
  confidence: topCommand.score,
  allScores: scores,
};
```

---

## 4. 当前准确率低的原因分析

### 4.1 诊断数据（2026-05-26）

| 指令 | 采集次数 | 平均相似度 | 相似度范围 | 能量变异系数 |
|------|--------|----------|----------|-----------|
| snap | 9 | 0.181 | [0.068, 0.329] | 0.509 |
| fix | 12 | 0.021 | [-0.591, 0.796] | 0.153 |
| twice | 10 | 0.090 | [0.013, 0.954] | 0.055 |
| rock | 8 | 0.093 | [0.025, 0.266] | 0.033 |

### 4.2 根本原因

#### 问题1：采集一致性极差（最严重）

**现象**：
- 同一指令的不同采集相似度仅0.02-0.18
- 标准参考：同一指令应该>0.7的相似度
- 这意味着采集之间的差异比不同指令的差异还大

**具体表现**：
- **snap指令**：采集间相似度只有18%，能量变异系数50.9%
  - 采集1 vs 采集2: 0.068（差异极大）
  - 采集3 vs 采集4: 0.329（仍然很低）
  - 能量范围：71K-375K（相差5倍）

- **fix指令**：相似度甚至出现负值（-0.591）
  - 说明某些采集的波形方向完全相反
  - 这通常表示肌肉收缩方向或强度差异极大

**根本原因**：
- 每次默念时的肌肉收缩强度不一致
- 肌肉收缩的时间长度差异大
- 电极位置或压力可能有变化
- 用户的放松状态不一致

#### 问题2：三通道不均衡

从采集数据统计：
- **Ch1**：标差 23-37（主要信号）
- **Ch2**：标差 3-12（弱信号）
- **Ch3**：标差 0.1-0.2（几乎无信号）

Ch3通道几乎无用，系统实际上只用两个通道工作。

#### 问题3：自适应裁剪置信度波动大

从日志分析：
- 裁剪置信度范围：39.6%-97.2%
- 许多采集的裁剪质量为"poor"（39.4-49.1/100）
- 这表示采集的有效信号段位置和长度差异很大

#### 问题4：特征提取基准不一致（已修复）

**之前的问题**：
- 采集时保存的是处理后的波形
- 测试时对参考波形进行了重复处理（processReferenceWaveform）
- 这导致参考波形被处理两次，而测试波形只被处理一次

**修复方案**：
- 移除RecognitionMode.tsx中的processReferenceWaveform调用
- 直接使用采集时已处理的波形
- 确保采集和测试使用完全相同的特征提取基准

---

## 5. 系统改进历史

### 已完成的改进

1. **✅ 自适应裁剪算法改进**
   - 实现多通道SNR权重动态融合
   - 改进有效片段检测算法
   - 添加裁剪质量评分

2. **✅ 识别算法改进**
   - 移除全局归一化（导致信息丢失）
   - 修复SNR计算（使用相邻采样点差值作为噪声估计）
   - 降低特征维度（从150维到30维）
   - 实现DTW混合相似度计算

3. **✅ 数据删除管理**
   - 集成database-cleanup工具
   - 自动清理垃圾指令
   - 修复IndexedDB事务处理

4. **✅ 采集质量评分系统**
   - 实现一致性评分（采集间相似度）
   - 实现能量稳定性评分
   - 实现信号质量评分
   - 支持质量加权相似度计算

5. **✅ 特征提取一致性修正**
   - 统一采集和测试的特征提取流程
   - 移除参考波形重复处理
   - 确保采集和测试使用相同的处理参数

6. **✅ 识别历史重复问题修复**
   - 识别完成时不保存到历史
   - 仅在用户反馈后保存一次

7. **✅ 版本管理机制**
   - 创建版本管理模块
   - 版本发布时清空数据（而不是每次启动）

### 待改进的方向

1. **采集质量控制**
   - 采集后自动筛选低质量采集
   - 提示用户重新采集
   - 实现采集质量反馈

2. **聚类训练数据**
   - 使用K-means聚类采集数据
   - 选择最稳定的采集子集进行模型训练
   - 可能进一步提升到95%+

3. **多模型融合**
   - 结合CNN、DTW、特征相似度、模板匹配
   - 实现更鲁棒的识别

4. **用户反馈系统**
   - 基于识别错误自动调整阈值和权重
   - 实现在线学习和个性化优化

---

## 6. 建议的诊断重点

### 6.1 外部AI应该关注的问题

1. **采集一致性问题是否真的无法解决？**
   - 当前的采集质量评分系统是否足够？
   - 是否需要更激进的采集筛选策略？
   - 采集质量阈值应该设多高？

2. **特征提取是否最优？**
   - 当前仅使用时域特征（10维/通道）
   - 是否应该加入频域特征？
   - 特征维度是否过低？

3. **相似度计算方法是否合适？**
   - 当前使用DTW混合相似度（DTW权重0.6）
   - 权重是否应该动态调整？
   - 是否应该使用其他距离度量（如Mahalanobis距离）？

4. **自适应阈值机制是否有效？**
   - 当前阈值范围：0.7-1.0
   - 是否应该基于采集质量动态调整？
   - 是否应该针对不同指令使用不同阈值？

5. **多通道融合权重计算是否准确？**
   - 当前基于SNR计算权重
   - Ch3通道权重几乎为0，是否应该完全忽略？
   - 是否应该使用其他权重计算方法？

### 6.2 建议的调试步骤

1. **采集数据分析**
   - 导出采集数据，分析波形特性
   - 检查是否存在系统性偏差
   - 验证预处理流程是否正确

2. **特征空间分析**
   - 计算不同指令的特征距离矩阵
   - 检查指令之间的可分性
   - 分析特征分布是否存在重叠

3. **相似度分布分析**
   - 分析同指令采集的相似度分布
   - 分析不同指令采集的相似度分布
   - 检查是否存在明显的分离

4. **识别错误分析**
   - 分析识别错误的模式
   - 检查是否存在特定指令对的混淆
   - 分析错误是否与采集质量相关

---

## 7. 关键文件位置

| 功能 | 文件路径 | 关键函数 |
|------|--------|--------|
| 特征提取 | `client/src/lib/dsp-processor.ts` | `extractFullFeatures`, `extractTimeDomainFeatures` |
| 多通道融合 | `client/src/lib/multi-channel-fusion.ts` | `calculateChannelWeights`, `fuseChannelFeatures` |
| 识别处理 | `client/src/lib/recognition-processing.ts` | `extractAndFuseFeatures`, `calculateFeatureSimilarity` |
| 相似度计算 | `client/src/lib/improved-recognition-similarity.ts` | `calculateDTWSimilarity`, `calculateHybridSimilarity` |
| 采集质量评分 | `client/src/lib/collection-quality-scoring.ts` | `calculateCollectionQuality` |
| 识别主流程 | `client/src/pages/RecognitionMode.tsx` | 第348-425行 |
| 数据库 | `client/src/lib/db.ts` | `saveCommand`, `getAllCommands`, `deleteCommand` |

---

## 8. 测试数据

### 8.1 当前测试结果

- **总测试次数**：111次
- **正确识别**：86次
- **准确率**：77.5%
- **目标准确率**：>90%

### 8.2 采集数据统计

**snap指令**（9次采集）：
- 采集1-2相似度：0.068
- 采集3-4相似度：0.329
- 采集5-6相似度：0.181
- 平均相似度：0.181
- 能量范围：71K-375K

**fix指令**（12次采集）：
- 最低相似度：-0.591
- 最高相似度：0.796
- 平均相似度：0.021
- 能量变异系数：0.153

---

## 9. 总结

当前系统的准确率低主要是由于**采集一致性极差**，而不是算法问题。同一指令的不同采集相似度仅0.02-0.18，这使得模型无法学习到稳定的指令特征。

已实现的采集质量评分系统和特征提取一致性修正应该能将准确率提升到75-95%。进一步的改进需要：

1. **采集质量筛选**：自动过滤低质量采集
2. **聚类训练**：使用最稳定的采集子集进行模型训练
3. **多模型融合**：结合多种识别方法提高鲁棒性
4. **用户反馈系统**：基于反馈自动调整模型参数

建议外部AI重点关注采集一致性问题的根本原因，以及是否存在其他未发现的系统性偏差。

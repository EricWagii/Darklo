# Ear EMG 系统完整诊断报告

## 问题概述

采集7条数据后，全部被标记为异常波形，无法保存。用户删除异常后仍无法保存。

## 核心问题

### 问题1：异常检测误判所有采集为异常

**现象**：
- 采集7条数据，7条全部被标记为异常
- 对话框显示"检测到 7 个异常波形"
- 即使删除异常后也无法保存

**根本原因链**：

1. **裁剪算法返回无效范围**
   - 文件：`client/src/lib/simple-front-rear-cropping.ts`
   - 函数：`performSimpleCropping()`
   - 问题：`frontIdx` 和 `rearIdx` 计算出现反序（frontIdx > rearIdx）
   - 结果：返回 `(0, length)` 作为防护措施

2. **异常检测错误解释防护返回值**
   - 文件：`client/src/lib/cropping-logger-and-quality.ts`
   - 函数：`detectAnomalies()`
   - 问题：当返回 `(0, length)` 时，认为没有真正的裁剪，导致 `consistencyScore < 40`
   - 结果：所有采集被标记为异常

3. **阈值计算可能过高**
   - 文件：`client/src/lib/simple-front-rear-cropping.ts`
   - 函数：`calculateDynamicThreshold()`
   - 问题：使用 `mean - stdDev * 0.5` 可能导致没有任何点超过阈值
   - 结果：`frontIdx = -1, rearIdx = -1`，触发防护逻辑

### 问题2：删除异常后无法保存

**现象**：
- 用户删除异常波形后，点击"保留所有波形，继续保存"
- 系统卡住，没有任何反应

**根本原因**：
- 文件：`client/src/pages/CollectionMode.tsx`
- 函数：`handleAnomalyDialogConfirm()`
- 问题：删除异常后调用 `performSaveWithoutAnomalyDetection()`，但这个函数有两个问题：
  1. 函数定义在组件外部（虽然已修复，但可能还有其他问题）
  2. 保存逻辑可能有异常

## 关键代码分析

### 1. 裁剪算法 - simple-front-rear-cropping.ts

```typescript
function performSimpleCropping(waveform: Waveform, windowSize: number = 20): SimpleCroppingResult {
  // ... 能量计算 ...
  
  // 计算动态阈值
  const threshold = calculateDynamicThreshold(energyStats);
  
  // 从前往后找到第一个超过阈值的点
  let frontIdx = -1;
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > threshold) {
      frontIdx = i;
      break;
    }
  }
  
  // 从后往前找到最后一个超过阈值的点
  let rearIdx = -1;
  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > threshold) {
      rearIdx = i + 1;
      break;
    }
  }
  
  // ❌ 问题：如果没有找到有效信号，返回 (0, length)
  if (frontIdx === -1 || rearIdx === -1) {
    return {
      startIdx: 0,
      endIdx: length,
      length: length,
      confidence: 0.5,
      isQualityAcceptable: false,  // ← 标记为质量不可接受
      qualityReason: '未找到有效信号，返回整个波形',
      peakCount: 0,
      detectionStrategy: 'single',
      snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
    };
  }
  
  // ... 继续处理 ...
}
```

**问题**：
- 当没有找到有效信号时，返回整个波形但标记为 `isQualityAcceptable: false`
- 异常检测看到这个标记，认为波形质量不可接受，标记为异常

### 2. 异常检测 - cropping-logger-and-quality.ts

```typescript
detectAnomalies(scores: QualityScore[]): QualityScore[] {
  const anomalies: QualityScore[] = [];
  
  for (const score of scores) {
    const reasons: string[] = [];
    const recommendations: string[] = [];
    
    // ❌ 问题：检查 consistencyScore < 40
    if (score.consistencyScore < 40) {
      reasons.push('波形不一致');
      recommendations.push('保持稳定的肌肉收缩');
    }
    
    if (reasons.length > 0) {
      score.isAnomalous = true;
      score.anomalyReasons = reasons;
      score.recommendations = recommendations;
      anomalies.push(score);
    }
  }
  
  return anomalies;
}
```

**问题**：
- 当裁剪返回 `(0, length)` 时，`consistencyScore` 很低（因为没有真正的裁剪）
- 导致所有采集都被标记为异常

### 3. 保存流程 - CollectionMode.tsx

```typescript
const handleAnomalyDialogConfirm = (indicesToDelete: number[]) => {
  // 删除异常波形
  const finalCollections = pendingCollections.filter(
    (_, idx) => !indicesToDelete.includes(idx)
  );
  
  setShowAnomalyDialog(false);
  setPendingCollections([]);
  
  // ❌ 问题：这里应该调用保存函数，但可能没有正确处理
  performSaveWithoutAnomalyDetection(finalCollections);
};
```

**问题**：
- 删除异常后，`performSaveWithoutAnomalyDetection()` 可能因为异常而卡住
- 没有错误处理和重试机制

## 现存问题列表

| 问题 | 严重程度 | 位置 | 原因 |
|------|--------|------|------|
| 裁剪算法返回无效范围 | 🔴 严重 | simple-front-rear-cropping.ts | 阈值过高或能量计算错误 |
| 异常检测误判 | 🔴 严重 | cropping-logger-and-quality.ts | 检查逻辑不合理 |
| 删除后无法保存 | 🔴 严重 | CollectionMode.tsx | 保存函数异常处理不足 |
| 阈值计算不稳定 | 🟡 中等 | simple-front-rear-cropping.ts | 公式可能不适合实际数据 |
| 缺少调试信息 | 🟡 中等 | 整个系统 | 用户无法了解发生了什么 |

## 建议修复方案

### 方案A：简化裁剪算法
1. 不使用动态阈值，使用固定百分比（如能量范围的20%）
2. 如果没有找到有效信号，返回错误而不是整个波形
3. 添加详细的日志记录每一步

### 方案B：改进异常检测
1. 不依赖 `isQualityAcceptable` 标记
2. 使用多个指标的组合判断（能量、一致性、信噪比）
3. 设置合理的阈值（基于实际数据分布）

### 方案C：增强保存流程
1. 添加详细的错误处理
2. 提供用户反馈（进度条、错误信息）
3. 实现重试机制

## 日志示例

从用户的日志中看到：
```
多峰值裁切完成: startIdx=2160, endIdx=1170, 峰值数=1, 策略=single
长度=-990样本 (-1980ms)
无法识别有效波形
```

这说明 `startIdx > endIdx`，导致长度为负数。

## 文件清单

需要修改的文件：
1. `client/src/lib/simple-front-rear-cropping.ts` - 裁剪算法
2. `client/src/lib/cropping-logger-and-quality.ts` - 异常检测
3. `client/src/pages/CollectionMode.tsx` - 保存流程
4. `client/src/components/AnomalyPromptDialog.tsx` - 异常对话框

## 总结

系统的问题不是单一的，而是一个链式反应：
1. 裁剪算法在某些情况下返回无效范围
2. 异常检测错误地解释这个返回值
3. 用户看到所有采集都是异常
4. 删除异常后的保存流程也有问题

建议其他AI从以下入手：
1. 首先修复裁剪算法，确保总是返回有效范围
2. 其次改进异常检测的逻辑
3. 最后完善保存流程的错误处理


---

## 完整代码清单

### 文件1：simple-front-rear-cropping.ts - 裁剪算法

**关键函数：performSimpleCropping()**

```typescript
// 第167-183行：寻找有效信号边界
let frontIdx = -1;
for (let i = 0; i < energy.length; i++) {
  if (energy[i] > threshold) {
    frontIdx = i;
    break;
  }
}

let rearIdx = -1;
for (let i = energy.length - 1; i >= 0; i--) {
  if (energy[i] > threshold) {
    rearIdx = i + 1;
    break;
  }
}

// 第186-200行：防护逻辑
if (frontIdx === -1 || rearIdx === -1) {
  return {
    startIdx: 0,
    endIdx: length,
    length: length,
    confidence: 0.5,
    isQualityAcceptable: false,  // ❌ 这个标记导致异常检测误判
    qualityReason: '未找到有效信号，返回整个波形',
    peakCount: 0,
    detectionStrategy: 'single',
    snrWeights: { ch1: 0.33, ch2: 0.33, ch3: 0.34 },
  };
}

// 第203-206行：交换逻辑
if (frontIdx > rearIdx) {
  [frontIdx, rearIdx] = [rearIdx, frontIdx];
}

// 第209-210行：转换为样本索引
const startIdx = Math.max(0, frontIdx * windowSize);
const endIdx = Math.min(length, rearIdx * windowSize);
```

**问题分析**：
- 当 `frontIdx === -1` 或 `rearIdx === -1` 时，返回 `(0, length)` 但标记 `isQualityAcceptable: false`
- 这个标记被异常检测系统解释为"波形质量不可接受"
- 导致所有采集都被标记为异常

### 文件2：cropping-logger-and-quality.ts - 异常检测

**关键函数：detectAnomalies()**

```typescript
// 第406-449行
const anomalies: WaveformQualityScore[] = [];
for (const score of scores) {
  const reasons: string[] = [];
  const recommendations: string[] = [];

  // 第413-420行：相对评分检测（这个是对的）
  if (stdDev > 0) {
    const deviation = Math.abs(score.overallScore - avgScore) / stdDev;
    if (deviation > anomalyThreshold) {
      reasons.push(`评分与平均值偏差过大 (${deviation.toFixed(1)}σ)`);
      recommendations.push('检查采集质量');
    }
  }

  // ❌ 第423-438行：绝对阈值检测（这个导致误判）
  if (score.energyScore < 30) {
    reasons.push('能量不足');
    recommendations.push('增加肌肉收缩强度');
  }

  if (score.consistencyScore < 40) {  // ❌ 这里是问题！
    reasons.push('波形不一致');
    recommendations.push('保持稳定的肌肉收缩');
  }

  if (score.signalToNoiseScore < 20) {
    reasons.push('信噪比过低');
    recommendations.push('检查电极接触和环境噪声');
  }

  if (reasons.length > 0) {
    score.isAnomalous = true;
    score.anomalyReasons = reasons;
    score.recommendations = recommendations;
    anomalies.push(score);
  }
}
```

**问题分析**：
- 第429行检查 `consistencyScore < 40`
- 当裁剪返回 `(0, length)` 时，`consistencyScore` 计算出来很低
- 导致所有采集都满足这个条件，被标记为异常

### 文件3：CollectionMode.tsx - 保存流程

**关键函数：handleCompleteCollection()**

```typescript
// 第545-555行：调用裁剪算法
alignment = batchSimpleCroppingCompat(
  collectionHistory.map((col) => col.waveform),
  (current, total) => {
    logger.debug(`裁切进度: ${current}/${total}`);
  },
  'auto'
);

console.log(`多峰值裁切完成: startIdx=${alignment.startIdx}, endIdx=${alignment.endIdx}, 峰值数=${alignment.peakCount}, 策略=${alignment.detectionStrategy}`);

// 第560+行：继续处理...
// 这里会调用异常检测，导致所有采集都被标记为异常
```

**关键函数：handleAnomalyDialogConfirm()**

```typescript
// 第433-460行
const handleAnomalyDialogConfirm = (indicesToDelete: number[]) => {
  logger.log(`用户选择删除 ${indicesToDelete.length} 个异常波形`);
  
  const remainingCount = pendingCollections.length - indicesToDelete.length;
  if (remainingCount < 1) {
    toast.error('至少需要保留 1 个波形');
    return;
  }
  
  let finalCollections = pendingCollections;
  if (indicesToDelete.length > 0) {
    finalCollections = pendingCollections.filter(
      (_, idx) => !indicesToDelete.includes(idx)
    );
  }
  
  setShowAnomalyDialog(false);
  setAnomalies([]);
  setPendingCollections([]);
  
  // ❌ 这里调用保存函数
  performSaveWithoutAnomalyDetection(finalCollections);
};
```

**问题分析**：
- 删除异常后调用 `performSaveWithoutAnomalyDetection()`
- 这个函数可能有异常或者没有正确处理
- 导致用户删除异常后仍无法保存

## 问题链式反应图

```
1. 阈值计算过高或能量计算有误
   ↓
2. frontIdx 和 rearIdx 无法找到有效信号
   ↓
3. 返回 (0, length) 但标记 isQualityAcceptable: false
   ↓
4. 异常检测看到这个标记，计算出低的 consistencyScore
   ↓
5. consistencyScore < 40，标记为异常
   ↓
6. 所有采集都被标记为异常
   ↓
7. 用户删除异常后，调用 performSaveWithoutAnomalyDetection()
   ↓
8. 保存函数可能有异常，导致卡住
```

## 日志证据

从用户的日志中：
```
多峰值裁切完成: startIdx=2160, endIdx=1170, 峰值数=1, 策略=single
长度=-990样本 (-1980ms)
无法识别有效波形
```

这说明 `startIdx > endIdx`，导致长度为负数。

## 建议修复优先级

1. **🔴 最高优先级**：修复裁剪算法，确保总是返回有效范围
   - 不能返回 `isQualityAcceptable: false` 的 `(0, length)`
   - 应该返回错误或者使用更激进的阈值

2. **🔴 高优先级**：改进异常检测逻辑
   - 不能依赖 `isQualityAcceptable` 标记
   - 应该只使用相对评分（3σ）

3. **🔴 高优先级**：完善保存流程
   - 添加详细的错误处理
   - 提供用户反馈

4. **🟡 中优先级**：添加调试信息
   - 让用户了解发生了什么
   - 便于问题诊断

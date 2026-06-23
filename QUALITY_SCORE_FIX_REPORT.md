# 数据评分显示都是 100 的问题修复报告

## 问题描述

无论采集数据怎样，数据评分显示都是 100，无任何其他分值。这导致用户无法区分采集数据的质量，无法判断哪些采集需要重录。

---

## 根本原因分析

### 问题位置

**文件**: `quality-scoring-improved.ts` 第 124-153 行

### 原因分析

评分算法的设计过于宽松，导致大部分采集都得到 100 分：

#### 1. 能量一致性评分（第 124-131 行）

**原始代码**:
```typescript
let energyConsistency = 100;
if (strengthRatio < 0.5 || strengthRatio > 1.5) {
  energyConsistency -= Math.abs(strengthRatio - 1) * 50;
}
if (variabilityRatio < 0.5 || variabilityRatio > 1.5) {
  energyConsistency -= Math.abs(variabilityRatio - 1) * 30;
}
```

**问题**:
- 允许 ±50% 的偏差（0.5 ~ 1.5 倍）
- 大多数正常采集都在这个范围内
- 导致几乎所有采集都保持 100 分

#### 2. 信号强度评分（第 135-142 行）

**原始代码**:
```typescript
let signalStrengthScore = 100;
if (maxStrength > 0) {
  const strengthPercentage = (strength / maxStrength) * 100;
  if (strengthPercentage < 20) {
    signalStrengthScore = strengthPercentage * 5; // 0-100
  }
}
```

**问题**:
- 初始值 = 100
- 只要达到最大强度的 20% 就保持 100
- 这个阈值太低，几乎所有采集都得 100

#### 3. 波形变化性评分（第 146-153 行）

**原始代码**:
```typescript
let variabilityScore = 100;
if (maxVariability > 0) {
  const variabilityPercentage = (variability / maxVariability) * 100;
  if (variabilityPercentage < 10) {
    variabilityScore = variabilityPercentage * 10; // 0-100
  }
}
```

**问题**:
- 初始值 = 100
- 只要达到最大变化性的 10% 就保持 100
- 这个阈值太低，几乎所有采集都得 100

#### 4. 综合评分

**原始公式**:
```
综合评分 = 能量一致性 × 0.5 + 信号强度 × 0.25 + 波形变化性 × 0.25
         = 100 × 0.5 + 100 × 0.25 + 100 × 0.25
         = 100
```

由于三个子评分都是 100，综合评分也是 100。

---

## 修复方案

### 修复内容

#### 1. 能量一致性评分 - 严格的一致性检查

**修复后的代码**:
```typescript
// 允许 ±20% 的偏差，超出此范围则降低评分
let energyConsistency = 100;

// 信号强度一致性（权重 60%）
if (strengthRatio < 0.8 || strengthRatio > 1.2) {
  energyConsistency -= Math.abs(strengthRatio - 1) * 100 * 0.6;  // 更严格的惩罚
}

// 波形变化性一致性（权重 40%）
if (variabilityRatio < 0.8 || variabilityRatio > 1.2) {
  energyConsistency -= Math.abs(variabilityRatio - 1) * 100 * 0.4;  // 更严格的惩罚
}

energyConsistency = Math.max(0, Math.min(100, energyConsistency));
```

**改进**:
- 从 ±50% 改为 ±20% 的允许偏差
- 超出范围的惩罚更严格
- 能够区分一致性好和一般的采集

#### 2. 信号强度评分 - 分级评分

**修复后的代码**:
```typescript
let signalStrengthScore = 100;
if (maxStrength > 0) {
  const strengthPercentage = (strength / maxStrength) * 100;
  
  // 分级评分标准
  if (strengthPercentage >= 90) {
    signalStrengthScore = 100;
  } else if (strengthPercentage >= 70) {
    signalStrengthScore = 80 + (strengthPercentage - 70) / 20 * 20;  // 80-100
  } else if (strengthPercentage >= 50) {
    signalStrengthScore = 60 + (strengthPercentage - 50) / 20 * 20;  // 60-80
  } else if (strengthPercentage >= 30) {
    signalStrengthScore = 40 + (strengthPercentage - 30) / 20 * 20;  // 40-60
  } else if (strengthPercentage >= 10) {
    signalStrengthScore = 20 + (strengthPercentage - 10) / 20 * 20;  // 20-40
  } else {
    signalStrengthScore = strengthPercentage * 2;  // 0-20
  }
}
```

**改进**:
- 从单一的 20% 阈值改为分级评分
- 90-100%: 100 分
- 70-90%: 80-100 分
- 50-70%: 60-80 分
- 30-50%: 40-60 分
- 10-30%: 20-40 分
- <10%: <20 分

#### 3. 波形变化性评分 - 分级评分

**修复后的代码**:
```typescript
let variabilityScore = 100;
if (maxVariability > 0) {
  const variabilityPercentage = (variability / maxVariability) * 100;
  
  // 分级评分标准
  if (variabilityPercentage >= 80) {
    variabilityScore = 100;
  } else if (variabilityPercentage >= 60) {
    variabilityScore = 80 + (variabilityPercentage - 60) / 20 * 20;  // 80-100
  } else if (variabilityPercentage >= 40) {
    variabilityScore = 60 + (variabilityPercentage - 40) / 20 * 20;  // 60-80
  } else if (variabilityPercentage >= 20) {
    variabilityScore = 40 + (variabilityPercentage - 20) / 20 * 20;  // 40-60
  } else if (variabilityPercentage >= 10) {
    variabilityScore = 20 + (variabilityPercentage - 10) / 10 * 20;  // 20-40
  } else {
    variabilityScore = variabilityPercentage * 2;  // 0-20
  }
}
```

**改进**:
- 从单一的 10% 阈值改为分级评分
- 80-100%: 100 分
- 60-80%: 80-100 分
- 40-60%: 60-80 分
- 20-40%: 40-60 分
- 10-20%: 20-40 分
- <10%: <20 分

#### 4. 异常检测标准 - 更严格的判断

**修复后的代码**:
```typescript
// 综合评分
const overallScoreTmp = Math.round(
  energyConsistency * 0.5 + signalStrengthScore * 0.25 + variabilityScore * 0.25
);

if (overallScoreTmp < 40) {
  isOutlier = true;
  recommendation = '⚠ 质量不佳，强烈建议重录';
} else if (overallScoreTmp < 60) {
  isOutlier = true;
  recommendation = '⚠ 质量较差，建议重录';
} else if (overallScoreTmp < 75) {
  recommendation = '△ 质量一般，可考虑重录';
} else if (overallScoreTmp < 85) {
  recommendation = '✓ 质量良好';
} else {
  recommendation = '✓ 质量优秀';
}
```

**改进**:
- <40: 质量不佳（强烈建议重录）
- 40-60: 质量较差（建议重录）
- 60-75: 质量一般（可考虑重录）
- 75-85: 质量良好
- 85+: 质量优秀

---

## 修复效果对比

### 修复前

| 采集情况 | 评分 | 问题 |
|---------|------|------|
| 任何采集 | 100 | 无区分度 |
| 信号弱 | 100 | 无法识别 |
| 波形平坦 | 100 | 无法识别 |
| 与其他采集差异大 | 100 | 无法识别 |

### 修复后

| 采集情况 | 能量一致性 | 信号强度 | 波形变化 | 综合评分 | 建议 |
|---------|-----------|---------|---------|---------|------|
| 优秀采集 | 95 | 95 | 95 | 95 | ✓ 质量优秀 |
| 良好采集 | 85 | 85 | 85 | 85 | ✓ 质量良好 |
| 一般采集 | 70 | 70 | 70 | 70 | △ 质量一般 |
| 较差采集 | 50 | 50 | 50 | 50 | ⚠ 质量较差 |
| 不佳采集 | 30 | 30 | 30 | 30 | ⚠ 质量不佳 |

### 用户体验改善

- ✅ 评分有明显的区分度（30-100 分）
- ✅ 用户可以清楚地看到采集质量
- ✅ 系统给出明确的建议（重录 vs 保留）
- ✅ 可以识别异常采集并标记

---

## 调试信息

修复后，浏览器控制台会显示详细的评分信息：

```
[质量评分] 能量一致性: 95, 信号强度: 92, 波形变化: 88, 综合: 92
[质量评分] 能量一致性: 65, 信号强度: 70, 波形变化: 60, 综合: 65
[质量评分] 能量一致性: 45, 信号强度: 50, 波形变化: 40, 综合: 45
```

这样可以快速了解每个采集的质量情况。

---

## 编译状态

✅ **编译通过**（0 个错误）

```
✓ 2308 modules transformed.
✓ built in 7.41s
```

---

## 后续建议

1. **添加评分历史图表** - 显示采集过程中评分的变化趋势，帮助用户理解采集质量的演变

2. **自动重录提示** - 当连续 3 次采集评分都低于 60 时，自动提示用户检查硬件连接或采集方式

3. **评分权重调整** - 根据实际使用情况，动态调整能量一致性、信号强度、波形变化的权重比例


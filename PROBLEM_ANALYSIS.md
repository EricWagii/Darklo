# Ear EMG 系统问题分析与修复方案

## 问题根源

### 问题1：两个不同的评分系统导致矛盾
**现象：**
- 采集过程中显示的评分：100分、95分、93分（相对评分）
- 保存时的评分：45.4分、45.6分（绝对评分）

**根本原因：**
- 采集过程中使用的是 `quality-scoring-improved.ts` 中的相对评分
- 保存时使用的是 `WaveformQualityScorer.calculateOverallScore()` 中的绝对评分
- 这两个评分系统使用完全不同的算法和阈值

### 问题2：异常检测的阈值完全错误
**现象：**
- 所有9条采集都被标记为"整体评分过低"
- 日志显示"整体评分过低 (45.4/100)"

**根本原因：**
- `WaveformQualityScorer.detectAnomalies()` 中的 `overallThreshold = 50`
- 保存时的绝对评分都在45-46分，低于50分的阈值
- 导致所有采集都被判定为异常

**关键代码位置：**
```typescript
// cropping-logger-and-quality.ts, line 412
if (score.overallScore < overallThreshold) {  // overallThreshold = 50
  reasons.push(`整体评分过低 (${score.overallScore.toFixed(1)}/100)`);
}
```

### 问题3：多峰值裁剪破坏波形完整性
**现象：**
- 使用 `batchCropCollectionsMultiPeak()` 进行裁剪
- 可能删除中间的低能量区域，破坏波形连续性

**根本原因：**
- 用户明确指示：只应该从前往后找第一个有效信号，从后往前找最后一个有效信号
- 保留 `[startIdx, endIdx]` 之间的所有数据，不删除任何中间部分
- 当前实现违反了这个要求

## 修复方案

### 修复1：替换裁剪算法
**目标：** 使用用户指定的前后空白裁剪方法
- 从前往后扫描，找到第一个有效信号（超过阈值），记为 `startIdx`
- 从后往前扫描，找到最后一个有效信号（超过阈值），记为 `endIdx`
- 保留 `[startIdx, endIdx]` 之间的所有数据

**实现位置：**
- 替换 `CollectionMode.tsx` 中的 `batchCropCollectionsMultiPeak()` 调用
- 替换 `integrated-cropping-system.ts` 中的裁剪逻辑
- 使用 `improved-dynamic-cropping.ts` 中的 `performDynamicCropping()` 或创建新的实现

### 修复2：统一评分标准
**目标：** 采集过程和保存时使用相同的评分算法
- 采集过程中显示的评分应该是"相对评分"（与同指令多次采集比较）
- 保存时的异常检测也应该使用"相对评分"

**实现方案：**
- 采集过程中：使用 `quality-scoring-improved.ts` 中的相对评分
- 保存时：也使用相对评分，而不是绝对评分
- 修改 `WaveformQualityScorer.detectAnomalies()` 使用相对评分

### 修复3：修复异常检测阈值
**目标：** 使用相对评分（与平均值比较）而不是绝对评分
- 计算所有采集的平均评分
- 计算标准差
- 标记偏差超过3σ的采集为异常
- 不使用绝对评分阈值

**实现方案：**
```typescript
// 修改后的异常检测逻辑
const avgScore = scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;
const variance = scores.reduce((sum, s) => sum + Math.pow(s.overallScore - avgScore, 2), 0) / scores.length;
const stdDev = Math.sqrt(variance);

// 只使用相对评分检测异常，不使用绝对阈值
if (stdDev > 0 && Math.abs(score.overallScore - avgScore) > 3 * stdDev) {
  // 标记为异常
}
```

### 修复4：修复对话框保存流程
**目标：** 用户删除异常数据后能够成功保存
- 用户选择要删除的异常波形
- 点击"保存剩余数据"按钮
- 系统继续保存流程，不再进行异常检测

**实现方案：**
- 修改 `handleAnomalyDialogConfirm()` 确保删除后继续保存
- 添加 `skipAnomalyDetection` 标记，跳过用户已处理过的异常检测

## 关键文件修改清单

1. `client/src/pages/CollectionMode.tsx` - 替换裁剪算法，修复保存流程
2. `client/src/lib/cropping-logger-and-quality.ts` - 修复异常检测阈值
3. `client/src/lib/integrated-cropping-system.ts` - 替换裁剪算法
4. `client/src/components/AnomalyPromptDialog.tsx` - 修复对话框流程（可能需要）

## 验证方案

1. **采集测试：** 采集5次同一指令，验证评分一致
2. **异常检测测试：** 故意采集1条质量较差的数据，验证是否被标记为异常
3. **保存测试：** 删除异常数据后，验证剩余数据能否成功保存
4. **数据一致性测试：** 验证保存的数据能否在测试阶段正确识别

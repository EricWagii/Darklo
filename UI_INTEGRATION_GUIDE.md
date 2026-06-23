# Darklo肌电静默输入系统 - UI集成指南

## 概述

本指南说明如何在CollectionMode和RecognitionMode中集成处理状态显示功能。所有核心数据处理模块已完成，这份指南帮助您在UI层面展示这些数据。

---

## 核心模块

### 1. collection-status-display.ts
**位置：** `client/src/lib/collection-status-display.ts`

**主要函数：**

```typescript
// 为单个采集项生成显示信息
generateCollectionDisplayInfo(waveform, index, isAnomaly)
  → CollectionDisplayInfo

// 批量生成显示信息
generateCollectionDisplayInfoBatch(waveforms, anomalyIndices)
  → CollectionDisplayInfo[]

// 生成HTML徽章
generateCollectionBadgeHTML(info)
  → string (HTML)

// 生成详情卡片
generateCollectionDetailCard(info)
  → string (HTML)

// 生成采集统计摘要
generateCollectionSummary(displayInfos, anomalyCount)
  → CollectionSummary

// 格式化摘要为文本
formatCollectionSummary(summary)
  → string
```

---

## CollectionMode.tsx 集成

### 步骤1：导入模块

```typescript
import {
  generateCollectionDisplayInfo,
  generateCollectionBadgeHTML,
  generateCollectionDetailCard,
  generateCollectionSummary,
  formatCollectionSummary,
  CollectionDisplayInfo
} from '@/lib/collection-status-display';
```

### 步骤2：在采集列表中显示状态徽章

**位置：** CollectionMode.tsx 第838-851行（采集历史列表）

**原代码：**
```typescript
{collectionHistory.map((col, idx) => (
  <div key={idx} style={{
    backgroundColor: '#0a0a0a',
    border: '1px solid #333',
    borderRadius: '4px',
    padding: '12px',
  }}>
    <div style={{ marginBottom: '8px', fontSize: '12px', color: '#d4af37', fontWeight: 'bold' }}>
      采集 #{col.index} - {col.duration}s
    </div>
    <div style={{ height: '120px', backgroundColor: '#1a1a1a', borderRadius: '4px', padding: '8px' }}>
      <ThumbnailWaveform ch1={col.waveform.ch1} ch2={col.waveform.ch2} ch3={col.waveform.ch3} index={col.index} />
    </div>
  </div>
))}
```

**新代码：**
```typescript
{collectionHistory.map((col, idx) => {
  // 显示处理状态
  const statusIcon = col.croppingMeta?.stage === 'primary' ? '✅' : '⚠️';
  const statusLabel = col.croppingMeta?.stage === 'primary' ? '已裁剪/已缩放' : '已裁剪/已缩放(降级)';
  const statusColor = col.croppingMeta?.stage === 'primary' ? '#10b981' : '#f59e0b';
  const confidencePercent = col.croppingMeta ? (col.croppingMeta.confidence * 100).toFixed(0) : 'N/A';
  
  return (
    <div key={idx} style={{
      backgroundColor: '#0a0a0a',
      border: '1px solid #333',
      borderRadius: '4px',
      padding: '12px',
    }}>
      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold' }}>
          采集 #{col.index} - {col.duration}s
        </div>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          backgroundColor: statusColor + '20',
          border: '1px solid ' + statusColor,
          borderRadius: '3px',
          fontSize: '11px'
        }}>
          <span>{statusIcon}</span>
          <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusLabel}</span>
          <span style={{ color: '#999', marginLeft: '4px' }}>置信度: {confidencePercent}%</span>
        </div>
      </div>
      <div style={{ height: '120px', backgroundColor: '#1a1a1a', borderRadius: '4px', padding: '8px' }}>
        <ThumbnailWaveform ch1={col.waveform.ch1} ch2={col.waveform.ch2} ch3={col.waveform.ch3} index={col.index} />
      </div>
    </div>
  );
})}
```

**效果：**
- ✅ 精确裁剪 - 绿色徽章，显示置信度
- ⚠️ 降级裁剪 - 黄色徽章，显示置信度
- 用户可以一眼看出每条采集的处理质量

### 步骤3：显示采集统计摘要

**位置：** CollectionMode.tsx 采集完成后的统计部分

**代码示例：**
```typescript
// 在handleCompleteCollection或显示统计时
if (collectionHistory.length > 0) {
  const displayInfos = collectionHistory.map((col, idx) => 
    generateCollectionDisplayInfo(col.waveform, idx, false)
  );
  const summary = generateCollectionSummary(displayInfos, anomalyCount);
  const summaryText = formatCollectionSummary(summary);
  
  // 显示摘要
  console.log(summaryText);
  // 或者在UI中显示
  // <div>{summaryText}</div>
}
```

---

## RecognitionMode.tsx 集成

### 步骤1：导入模块

```typescript
import {
  generateCollectionDisplayInfo,
  CollectionDisplayInfo
} from '@/lib/collection-status-display';
```

### 步骤2：显示测试结果的处理状态

**位置：** RecognitionMode.tsx 测试结果显示部分

**代码示例：**
```typescript
// 在显示测试结果时
const testResult = /* 测试结果 */;
const displayInfo = generateCollectionDisplayInfo(testResult.waveform, 0, false);

// 显示处理状态
<div style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  backgroundColor: displayInfo.statusInfo.backgroundColor,
  border: `1px solid ${displayInfo.statusInfo.color}`,
  borderRadius: '4px'
}}>
  <span>{displayInfo.statusInfo.icon}</span>
  <span style={{ color: displayInfo.statusInfo.color, fontWeight: 'bold' }}>
    {displayInfo.statusInfo.label}
  </span>
  <span style={{ color: '#999', marginLeft: '4px' }}>
    评分: {displayInfo.qualityScore.toFixed(0)}分
  </span>
</div>
```

### 步骤3：显示裁剪和缩放参数

**代码示例：**
```typescript
// 显示详细参数
<div style={{ fontSize: '12px', color: '#ccc', marginTop: '8px' }}>
  <div>裁剪阶段: {displayInfo.croppingStage}</div>
  <div>置信度: {(displayInfo.croppingConfidence * 100).toFixed(0)}%</div>
  <div>缩放: {displayInfo.originalLength} → {displayInfo.normalizationLength}样本</div>
</div>
```

---

## 数据流程

### 采集流程
```
CollectionMode
  ↓
handleCompleteCollection()
  ↓
collection-handler-v2.processCollections()
  ↓
processWaveform() [裁剪 + 缩放]
  ↓
ProcessedWaveform {
  ch1, ch2, ch3: Float32Array[512],
  meta: {
    croppingMeta: { stage, confidence, method, ... },
    normalizationMeta: { targetLength: 512, originalLength: ... }
  }
}
  ↓
保存到 collectionHistory
  ↓
UI显示: generateCollectionDisplayInfo()
```

### 异常检测流程
```
collection-integration.processCollections()
  ↓
detectAnomaliesUsingMahalanobis(processedWaveforms)
  ↓
返回异常索引集合
  ↓
UI显示: 标记为 ❌ 未裁剪/未缩放
```

---

## 状态定义

| 状态 | 图标 | 标签 | 颜色 | 含义 |
|------|------|------|------|------|
| normal | ✅ | 已裁剪/已缩放 | 绿色 (#10b981) | 精确裁剪+成功缩放 |
| degraded | ⚠️ | 已裁剪/已缩放(降级) | 黄色 (#f59e0b) | 降级裁剪+成功缩放 |
| anomaly | ❌ | 未裁剪/未缩放 | 红色 (#ef4444) | 异常波形，建议删除 |

---

## 质量评分计算

```typescript
// 质量评分 = 基础分 + 置信度加分 + 异常减分
// 基础分: 80分
// 置信度加分: confidence * 20 (最多20分)
// 异常减分: 如果是异常，减50分

// 示例
normal: 80 + (0.8 * 20) = 96分
degraded: 80 + (0.5 * 20) = 90分
final-fallback: 80 + (0.25 * 20) = 85分
anomaly: 80 - 50 = 30分
```

---

## 完整示例

### CollectionMode中的完整集成

```typescript
import { generateCollectionDisplayInfo } from '@/lib/collection-status-display';

export default function CollectionMode() {
  const [collectionHistory, setCollectionHistory] = useState<CollectionData[]>([]);
  
  return (
    <div>
      {/* 采集列表 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ marginBottom: '12px' }}>
          <span style={{ color: '#888', fontSize: '12px' }}>采集历史</span>
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxHeight: '500px',
          overflowY: 'auto',
        }}>
          {collectionHistory.map((col, idx) => {
            const statusIcon = col.croppingMeta?.stage === 'primary' ? '✅' : '⚠️';
            const statusLabel = col.croppingMeta?.stage === 'primary' ? '已裁剪/已缩放' : '已裁剪/已缩放(降级)';
            const statusColor = col.croppingMeta?.stage === 'primary' ? '#10b981' : '#f59e0b';
            const confidencePercent = col.croppingMeta ? (col.croppingMeta.confidence * 100).toFixed(0) : 'N/A';
            
            return (
              <div key={idx} style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '12px',
              }}>
                <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold' }}>
                    采集 #{col.index} - {col.duration}s
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    backgroundColor: statusColor + '20',
                    border: '1px solid ' + statusColor,
                    borderRadius: '3px',
                    fontSize: '11px'
                  }}>
                    <span>{statusIcon}</span>
                    <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusLabel}</span>
                    <span style={{ color: '#999', marginLeft: '4px' }}>置信度: {confidencePercent}%</span>
                  </div>
                </div>
                <div style={{ height: '120px', backgroundColor: '#1a1a1a', borderRadius: '4px', padding: '8px' }}>
                  <ThumbnailWaveform ch1={col.waveform.ch1} ch2={col.waveform.ch2} ch3={col.waveform.ch3} index={col.index} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

---

## 常见问题

### Q1: 如何判断一个采集是否是异常？
**A:** 使用 `anomaly-detection-integration.ts` 中的 `detectAnomaliesUsingMahalanobis()` 函数。它返回异常索引的Set，您可以用这个Set来标记异常采集。

### Q2: 置信度是什么？
**A:** 置信度表示裁剪算法对结果的信心程度：
- 0.6-1.0: 精确裁剪（primary）
- 0.3-0.6: 降级裁剪（fallback）
- 0.25: 最终降级（final-fallback）

### Q3: 缩放后的长度是多少？
**A:** 所有波形都缩放到512样本。这在 `independent-cropping.ts` 中定义。

### Q4: 如何修改状态徽章的颜色？
**A:** 修改 `processing-status-visualization.ts` 中的 `visualizations` 对象中的 `color` 和 `backgroundColor` 字段。

---

## 下一步

1. **集成到CollectionMode.tsx** - 按照上面的步骤修改采集列表显示
2. **集成到RecognitionMode.tsx** - 显示测试结果的处理状态
3. **手动测试** - 验证采集、异常检测、删除等功能
4. **性能优化** - 如果需要，可以优化大量采集时的渲染性能

---

## 支持

如有问题，请参考：
- `collection-status-display.ts` - 完整的API文档
- `processing-status-visualization.ts` - 状态定义和可视化逻辑
- `collection-integration.ts` - 采集处理流程
- `anomaly-detection-integration.ts` - 异常检测流程

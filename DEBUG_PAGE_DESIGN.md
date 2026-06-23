# DEBUG调试页面设计文档

## 1. 页面架构

### 1.1 主要模块

```
DebugPage
├── Header (页面标题 + 快速操作)
├── DataLoader (数据加载面板)
│   ├── 选择要分析的指令
│   ├── 选择要查看的采集序号
│   └── 加载按钮
├── WaveformViewer (波形可视化)
│   ├── 原始波形图表
│   ├── 能量分布图表
│   └── 裁切参数标记
├── CroppingAnalysis (裁切参数分析)
│   ├── 裁切参数表格
│   ├── 多峰值检测结果
│   └── 质量评分
├── TimingStatistics (时长统计)
│   ├── 原始波形时长
│   ├── 裁切后时长
│   └── 归一化后时长
└── ComparisonPanel (对比分析)
    ├── 参考采集 vs 实时波形
    └── 特征对比
```

### 1.2 数据流

```
IndexedDB (读取采集数据)
    ↓
DataLoader (选择指令和采集)
    ↓
WaveformViewer (绘制波形和能量)
    ↓
CroppingAnalysis (显示裁切参数)
    ↓
TimingStatistics (计算时长统计)
```

## 2. 数据结构

### 2.1 DebugData 接口

```typescript
interface DebugData {
  commandName: string;
  collectionIndex: number;
  
  // 原始波形
  rawWaveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
    duration: number; // 毫秒
  };
  
  // 能量检测结果
  energyAnalysis: {
    energyValues: number[];
    threshold: number;
    validSegmentStart: number;
    validSegmentEnd: number;
    confidence: number;
    peakCount: number;
  };
  
  // 裁切参数
  croppingParams: {
    startIdx: number;
    endIdx: number;
    strategy: 'single-peak' | 'multi-peak';
    peakCount: number;
    mergedPeaks: Array<{ start: number; end: number; energy: number }>;
  };
  
  // 时长统计
  timingStats: {
    rawDurationMs: number;
    croppedDurationMs: number;
    normalizedDurationMs: number;
    samplingRate: number;
  };
  
  // 质量评分
  qualityScore: {
    isAcceptable: boolean;
    score: number; // 0-100
    reason: string;
  };
}
```

### 2.2 ComparisonData 接口

```typescript
interface ComparisonData {
  reference: DebugData;
  realtime: DebugData;
  
  // 对比结果
  comparison: {
    timingDifference: number; // 毫秒
    energyCorrelation: number; // 0-1
    peakCountMatch: boolean;
    alignmentScore: number; // 0-100
  };
}
```

## 3. 功能模块详细设计

### 3.1 DataLoader (数据加载)

**功能：**
- 从 IndexedDB 读取所有指令
- 显示指令列表和采集数量
- 选择要分析的指令和采集序号
- 加载数据并触发分析

**UI 元素：**
- 指令下拉菜单
- 采集序号选择器（滑块或输入框）
- 加载按钮
- 数据状态提示

### 3.2 WaveformViewer (波形可视化)

**功能：**
- 绘制原始波形（三个通道）
- 绘制能量分布曲线
- 标记有效段（validSegmentStart/End）
- 标记裁切区间（startIdx/endIdx）
- 标记多峰值位置

**图表库：** Chart.js 或 Plotly

**图表类型：**
1. 原始波形：线性图表（三条线，不同颜色）
2. 能量分布：面积图表（填充颜色）
3. 综合图表：波形 + 能量 + 标记

### 3.3 CroppingAnalysis (裁切分析)

**功能：**
- 显示裁切参数（startIdx、endIdx、长度）
- 显示多峰值检测结果
- 显示每个峰值的位置和能量
- 显示选择的策略和原因

**表格内容：**
| 参数 | 值 |
|------|-----|
| 原始长度 | X 样本 |
| 裁切起点 | X 样本 |
| 裁切终点 | X 样本 |
| 裁切长度 | X 样本 |
| 峰值数 | X |
| 检测策略 | single-peak / multi-peak |
| 质量评分 | X/100 |

### 3.4 TimingStatistics (时长统计)

**功能：**
- 显示原始波形时长
- 显示裁切后时长
- 显示归一化后时长
- 显示时长变化百分比

**统计表格：**
| 阶段 | 长度(样本) | 时长(ms) | 百分比 |
|------|-----------|---------|--------|
| 原始波形 | X | Y | 100% |
| 裁切后 | X | Y | Z% |
| 归一化 | 512 | 1024 | - |

### 3.5 ComparisonPanel (对比分析)

**功能：**
- 加载参考采集和实时波形
- 对比时长、能量、峰值数
- 计算对齐得分
- 显示对比结果

**对比内容：**
- 波形对比（并排显示）
- 能量对比（并排显示）
- 参数对比表格
- 对齐得分

## 4. 实现步骤

### Phase 1: 设计（当前）
- ✅ 定义页面架构
- ✅ 定义数据结构
- ✅ 定义功能模块

### Phase 2: 创建React组件
- 创建 DebugPage.tsx 主组件
- 创建 DataLoader 子组件
- 创建 WaveformViewer 子组件
- 创建 CroppingAnalysis 子组件
- 创建 TimingStatistics 子组件
- 创建 ComparisonPanel 子组件

### Phase 3: 实现可视化
- 集成 Chart.js 或 Plotly
- 实现波形绘制函数
- 实现能量分布绘制
- 实现标记绘制

### Phase 4: 集成数据加载
- 从 IndexedDB 读取数据
- 计算能量分布
- 计算裁切参数
- 计算时长统计

### Phase 5: 测试和验证
- 测试数据加载
- 测试波形绘制
- 测试参数计算
- 验证诊断准确性

### Phase 6: 交付
- 添加到导航菜单
- 编写使用说明
- 创建检查清单

## 5. 技术选型

| 功能 | 技术方案 |
|------|---------|
| 图表库 | Chart.js (已有) |
| 数据存储 | IndexedDB (已有) |
| 状态管理 | React useState/useEffect |
| 样式 | Tailwind CSS |
| 波形处理 | 现有的 multi-peak-detection.ts |

## 6. 关键计算函数

### 6.1 能量分布计算

```typescript
function calculateEnergyDistribution(waveform: number[]): number[] {
  // 使用滑动窗口计算能量
  // 返回每个样本的能量值
}
```

### 6.2 时长计算

```typescript
function calculateDuration(sampleCount: number, samplingRate: number = 500): number {
  return (sampleCount / samplingRate) * 1000; // 毫秒
}
```

### 6.3 对齐得分计算

```typescript
function calculateAlignmentScore(ref: DebugData, realtime: DebugData): number {
  // 基于时长、能量、峰值数的综合评分
  // 返回 0-100 的分数
}
```

## 7. 用户使用流程

1. **打开DEBUG页面** → 看到指令列表
2. **选择指令** → 看到该指令的采集列表
3. **选择采集序号** → 点击"加载"
4. **查看波形** → 在 WaveformViewer 中看到波形和能量
5. **查看参数** → 在 CroppingAnalysis 中看到裁切参数
6. **查看时长** → 在 TimingStatistics 中看到时长统计
7. **对比分析** → 在 ComparisonPanel 中对比参考和实时波形（可选）

## 8. 预期输出

用户通过DEBUG页面可以：
- ✅ 确认实际发音时长是否超过 1 秒
- ✅ 查看波形是否被正确裁切
- ✅ 验证多峰值检测是否工作正常
- ✅ 对比参考采集和实时波形的差异
- ✅ 诊断识别失败的原因

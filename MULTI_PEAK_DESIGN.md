# 多峰值信号处理设计文档

## 问题分析

### 当前单峰值算法的限制
1. **假设**：信号中只有一个连续的活跃区域
2. **实现**：从第一个活跃点到最后一个活跃点的范围
3. **问题**：对于"yeah"等复杂指令，能量分布分散，导致：
   - 识别的活跃区域包含太多噪声
   - 起始和结束点不准确
   - 识别准确率低

### "yeah"指令的特性
从波形图观察：
- 多个分散的峰值（绿色波形 CH1）
- 能量分布不集中
- 与单音节指令（666、888、10、444）的模式完全不同

## 解决方案：多峰值支持

### 核心思想
1. **识别所有活跃峰值**：而不仅仅是首尾边界
2. **智能合并相邻峰值**：将靠近的峰值视为同一个活跃区域
3. **保留所有有效能量**：不丢弃任何有效的肌电信号

### 算法设计

#### 步骤 1：能量检测（保持不变）
- 计算局部能量（RMS）
- 使用中位数 + 标准差计算自适应阈值

#### 步骤 2：峰值识别（新增）
```
输入：能量数组 energy[], 阈值 threshold
输出：峰值列表 peaks[]

1. 标记活跃点：isActive[i] = energy[i] > threshold
2. 识别连续活跃段（峰值）
   - 当 isActive[i] 从 false 变为 true 时，开始新峰值
   - 当 isActive[i] 从 true 变为 false 时，结束当前峰值
3. 记录每个峰值的 [startIdx, endIdx, peakEnergy]
```

#### 步骤 3：峰值合并（新增）
```
输入：峰值列表 peaks[]
输出：合并后的峰值列表 mergedPeaks[]

1. 计算峰值间隔（相邻峰值的间距）
2. 如果间隔 < MIN_GAP（如 50 样本），则合并
3. 合并后的峰值 = [min(startIdx), max(endIdx)]
```

#### 步骤 4：有效区间选择（新增）
```
输入：合并后的峰值列表 mergedPeaks[]
输出：最终的 [startIdx, endIdx]

策略 1（保守）：选择能量最强的单个峰值
- 适用于：单音节指令
- 优点：最少噪声
- 缺点：可能丢失有效信号

策略 2（激进）：选择所有峰值的并集
- 适用于：多音节指令（如"yeah"）
- 优点：保留所有有效信号
- 缺点：可能包含噪声

策略 3（智能）：基于指令特性选择
- 检测峰值数量
- 如果 peakCount == 1：使用策略 1（单峰值）
- 如果 peakCount > 1：使用策略 2（多峰值）
```

## 实现细节

### 新增接口
```typescript
interface PeakInfo {
  startIdx: number;      // 峰值起始索引
  endIdx: number;        // 峰值结束索引
  peakEnergy: number;    // 峰值的最大能量
  peakIdx: number;       // 最大能量的位置
  duration: number;      // 峰值持续时间（样本数）
}

interface MultiPeakCroppingResult extends FastCroppingResult {
  peaks: PeakInfo[];                    // 所有识别到的峰值
  peakCount: number;                    // 峰值数量
  detectionStrategy: 'single' | 'multi'; // 使用的检测策略
  mergedGaps: number[];                 // 被合并的间隔
}
```

### 新增函数
```typescript
// 1. 识别所有峰值
function detectPeaks(energy: number[], threshold: number): PeakInfo[]

// 2. 合并相邻峰值
function mergePeaks(peaks: PeakInfo[], minGap: number): PeakInfo[]

// 3. 选择最终区间
function selectFinalInterval(
  peaks: PeakInfo[],
  strategy: 'single' | 'multi' | 'auto'
): { startIdx: number; endIdx: number }

// 4. 增强的能量检测（支持多峰值）
function detectValidSegmentMultiPeak(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): MultiPeakCroppingResult
```

## 参数配置

### 峰值合并参数
- `MIN_GAP`：最小间隔（样本数）
  - 默认值：50（相当于 100ms，在 512Hz 采样率下）
  - 含义：间隔小于此值的两个峰值视为同一个活跃区域

### 质量检查参数
- `MIN_PEAK_ENERGY`：最小峰值能量（保持不变）
- `MIN_CONFIDENCE`：最小置信度（保持不变）
- `MIN_VALID_LENGTH`：最小有效长度（保持不变）

### 检测策略选择
- 如果 `peakCount == 1`：使用单峰值策略
- 如果 `peakCount > 1`：使用多峰值策略

## 向后兼容性

### 现有接口保持不变
- `FastCroppingResult` 接口保持不变
- `batchCropCollectionsFast()` 函数签名不变
- 采集和识别流程无需修改

### 新增功能通过扩展
- 创建新的 `detectValidSegmentMultiPeak()` 函数
- 创建新的 `batchCropCollectionsMultiPeak()` 函数
- 可选地使用新功能，或继续使用旧功能

## 测试计划

### 单元测试
1. 测试 `detectPeaks()` 函数
   - 单峰值信号
   - 多峰值信号
   - 无峰值信号（全噪声）

2. 测试 `mergePeaks()` 函数
   - 无合并需要
   - 部分合并
   - 全部合并

3. 测试 `selectFinalInterval()` 函数
   - 单峰值选择
   - 多峰值选择
   - 自动选择

### 集成测试
1. 采集"yeah"指令，验证多峰值检测
2. 采集单音节指令，验证单峰值检测
3. 识别"yeah"指令，验证准确率提升

### 性能测试
1. 确保多峰值检测不显著增加计算时间
2. 批量处理性能保持在 <2s（50 条数据）

## 实施步骤

1. **Phase 2**：实现多峰值检测模块（新文件）
2. **Phase 3**：在采集流程中集成多峰值检测
3. **Phase 4**：在识别流程中集成多峰值检测
4. **Phase 5**：测试验证和参数调优
5. **Phase 6**：保存检查点

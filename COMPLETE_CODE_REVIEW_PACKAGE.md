# Ear EMG 无声语音识别系统 - 完整代码审查包

## 第一部分：系统概述

### 1.1 项目目的

**Darklo Ear EMG Silent Speech Recognition System** 是一个基于耳周肌电信号（EMG）的无声语音识别系统。通过采集耳后乳突区的肌电信号，使用深度学习算法进行特征提取和识别，实现无声默念指令的实时识别。

### 1.2 核心功能

| 功能模块 | 说明 | 页面 |
|---------|------|------|
| **采集训练** | 用户进行肌电信号采集，系统自动进行裁剪和特征提取 | CollectionMode.tsx |
| **默念测试** | 用户进行默念测试，系统识别用户的意图 | RecognitionMode.tsx |
| **数据管理** | 查看、编辑、删除已采集的数据 | DataManagement.tsx |
| **数据分析** | 分析采集数据的质量、特征等 | 集成在各页面 |
| **管理员后台** | 系统管理、用户管理、数据统计 | AdminDashboard.tsx |

### 1.3 技术栈

- **前端框架**：React 19 + TypeScript
- **UI库**：shadcn/ui + Tailwind CSS 4
- **后端**：Express 4 + tRPC 11
- **数据库**：MySQL/TiDB
- **本地存储**：IndexedDB
- **信号处理**：自定义DSP算法
- **机器学习**：CNN + DTW

### 1.4 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端应用 (React)                         │
├─────────────────────────────────────────────────────────────┤
│  页面层                                                      │
│  ├─ CollectionMode (采集)                                   │
│  ├─ RecognitionMode (测试)                                  │
│  ├─ DataManagement (数据管理)                               │
│  └─ AdminDashboard (管理)                                   │
├─────────────────────────────────────────────────────────────┤
│  业务逻辑层                                                  │
│  ├─ 信号处理 (DSP)                                          │
│  ├─ 特征提取 (Feature Extraction)                           │
│  ├─ 裁剪系统 (Cropping System)                              │
│  ├─ 异常检测 (Anomaly Detection)                            │
│  └─ 识别引擎 (Recognition Engine)                           │
├─────────────────────────────────────────────────────────────┤
│  数据层                                                      │
│  ├─ IndexedDB (本地存储)                                    │
│  ├─ MySQL/TiDB (服务器存储)                                 │
│  └─ 串口通信 (硬件)                                         │
└─────────────────────────────────────────────────────────────┘
```

## 第二部分：采集流程详解

### 2.1 采集流程概述

采集流程是系统的核心功能，包括以下步骤：

```
1. 用户输入指令名称
   ↓
2. 初始化串口连接
   ↓
3. 用户进行肌肉收缩（默念指令）
   ↓
4. 系统实时采集三通道EMG信号
   ↓
5. 采集完成后，自动进行裁剪和缩放
   ↓
6. 计算质量评分
   ↓
7. 异常检测
   ↓
8. 如果有异常，显示对话框让用户选择
   ↓
9. 保存到IndexedDB
   ↓
10. 显示成功提示
```

### 2.2 采集数据结构

```typescript
interface CollectionData {
  index: number;                    // 采集序号
  timestamp: Date;                  // 采集时间
  waveform: {
    ch1: number[];                  // 通道1原始数据
    ch2: number[];                  // 通道2原始数据
    ch3: number[];                  // 通道3原始数据
  };
  duration: number;                 // 采集时长（毫秒）
  quality?: number;                 // 质量评分 (0-100)
  croppingResult?: {
    startIdx: number;               // 裁剪起始索引
    endIdx: number;                 // 裁剪结束索引
    confidence: number;             // 置信度 (0-1)
  };
}
```

### 2.3 采集阶段的关键处理

#### 阶段1：信号采集
- 采样率：可配置（通常1000Hz）
- 通道数：3（CH1, CH2, CH3）
- 采集时长：用户按住按钮期间

#### 阶段2：自动裁剪
- 使用前后空白裁剪算法
- 从前往后找第一个有效信号
- 从后往前找最后一个有效信号
- 保留两者之间的所有数据

#### 阶段3：固定长度缩放
- 目标长度：根据指令类型定义（通常1000-1250样本）
- 缩放方法：线性插值或重采样
- 目的：确保所有采集长度一致

#### 阶段4：质量评分
- 能量评分：信号强度
- 一致性评分：波形稳定性
- 信噪比：信号与噪声比例
- 综合评分：0-100分

#### 阶段5：异常检测
- 相对评分：与平均值的偏差（3σ标准）
- 绝对阈值：能量、一致性、信噪比
- 如果检测到异常，显示对话框

### 2.4 采集流程关键代码位置

| 步骤 | 文件 | 函数 | 行号 |
|------|------|------|------|
| 采集初始化 | CollectionMode.tsx | handleStartCollection | ~300 |
| 实时采集 | CollectionMode.tsx | handleDataReceived | ~350 |
| 采集完成 | CollectionMode.tsx | handleCompleteCollection | ~463 |
| 自动裁剪 | simple-front-rear-cropping.ts | batchSimpleCroppingCompat | ~417 |
| 固定缩放 | waveform-normalizer.ts | normalizeWaveformLengthMultiChannel | - |
| 质量评分 | cropping-logger-and-quality.ts | WaveformQualityScorer | ~294 |
| 异常检测 | cropping-logger-and-quality.ts | detectAnomalies | ~406 |
| 保存数据 | CollectionMode.tsx | performSaveWithoutAnomalyDetection | ~1269 |

## 第三部分：测试流程详解

### 3.1 测试流程概述

测试流程是系统的识别功能，包括以下步骤：

```
1. 用户选择要测试的指令
   ↓
2. 初始化识别引擎
   ↓
3. 用户进行肌肉收缩（默念指令）
   ↓
4. 系统实时采集测试信号
   ↓
5. 采集完成后，自动进行裁剪和缩放
   ↓
6. 使用CNN或DTW进行识别
   ↓
7. 计算识别置信度
   ↓
8. 显示识别结果
   ↓
9. 记录测试日志
```

### 3.2 测试数据结构

```typescript
interface RecognitionResult {
  commandName: string;              // 识别的指令名称
  confidence: number;               // 置信度 (0-1)
  topMatches: Array<{
    name: string;
    score: number;
  }>;
  method: 'CNN' | 'DTW';            // 识别方法
  processingTime: number;           // 处理时间（毫秒）
  waveform: {
    ch1: number[];
    ch2: number[];
    ch3: number[];
  };
}
```

### 3.3 测试阶段的关键处理

#### 阶段1：信号采集
- 与采集阶段相同
- 采样率、通道数、采集时长

#### 阶段2：自动裁剪
- 使用与采集相同的裁剪参数
- 确保测试信号与训练数据的裁剪一致

#### 阶段3：固定长度缩放
- 使用与采集相同的目标长度
- 确保测试信号与训练数据的长度一致

#### 阶段4：特征提取
- 提取180维多模态特征
- 包括时域、频域、MFCC、梅尔谱图特征

#### 阶段5：识别
- 方法1：CNN模型识别
- 方法2：DTW动态时间规整
- 选择置信度最高的结果

#### 阶段6：结果输出
- 显示识别结果
- 显示置信度
- 显示处理时间

### 3.4 测试流程关键代码位置

| 步骤 | 文件 | 函数 | 行号 |
|------|------|------|------|
| 测试初始化 | RecognitionMode.tsx | handleStartRecognition | ~150 |
| 实时采集 | RecognitionMode.tsx | handleDataReceived | ~180 |
| 采集完成 | RecognitionMode.tsx | handleStopRecognition | ~237 |
| 自动裁剪 | integrated-cropping-system.ts | performTestCropping | ~230 |
| 固定缩放 | waveform-normalizer.ts | normalizeWaveformLengthMultiChannel | - |
| 特征提取 | advanced-feature-extraction.ts | extractMultimodalFeatures | - |
| CNN识别 | cnn-model.ts | predict | - |
| DTW识别 | dtw-algorithm.ts | compare | - |
| 结果显示 | RecognitionMode.tsx | 渲染逻辑 | ~350+ |

## 第四部分：关键算法详解

### 4.1 前后空白裁剪算法

**目的**：去除信号前后的无效部分，保留有效的肌电信号

**算法流程**：
1. 计算三通道能量（RMS）
2. 计算能量统计（min, max, mean, stdDev, median）
3. 计算动态阈值
4. 从前往后找第一个超过阈值的点
5. 从后往前找最后一个超过阈值的点
6. 保留两者之间的所有数据

**关键参数**：
- 窗口大小：20个样本
- 阈值计算：基于能量范围和标准差

**问题**：
- 当没有找到有效信号时，返回整个波形但标记为质量不可接受
- 这导致异常检测误判

### 4.2 固定长度缩放算法

**目的**：确保所有采集的长度一致，便于后续处理

**算法流程**：
1. 获取裁剪后的波形长度
2. 获取目标长度（根据指令类型）
3. 如果长度小于目标，进行插值
4. 如果长度大于目标，进行下采样

**关键参数**：
- 目标长度：通常1000-1250样本
- 插值方法：线性插值

### 4.3 特征提取算法

**目的**：从原始EMG信号中提取有意义的特征

**特征类型**：
- 时域特征（60维）：RMS、均值、方差、峰值等
- 频域特征（30维）：FFT系数
- MFCC特征（39维）：梅尔频率倒谱系数
- 梅尔谱图特征（21维）：梅尔谱图的统计特征

**总计**：180维多模态特征

### 4.4 异常检测算法

**目的**：识别质量不达标的采集

**检测方法**：
1. 相对评分：与平均值的偏差（3σ标准）
2. 绝对阈值：
   - 能量评分 < 30
   - 一致性评分 < 40
   - 信噪比 < 20

**问题**：
- 绝对阈值过于严格
- 导致所有采集都被标记为异常

### 4.5 识别算法

**方法1：CNN模型**
- 输入：180维特征向量
- 隐藏层：多层卷积和全连接层
- 输出：各指令的概率分布

**方法2：DTW（动态时间规整）**
- 计算测试信号与每个训练样本的距离
- 选择距离最小的样本所属的指令
- 计算置信度

## 第五部分：数据流向

### 5.1 采集数据流向

```
硬件（STM32）
    ↓ 串口通信
实时采集缓冲区
    ↓ 采集完成
原始波形 (ch1, ch2, ch3)
    ↓ 自动裁剪
裁剪后的波形
    ↓ 固定长度缩放
标准化波形
    ↓ 质量评分
评分结果
    ↓ 异常检测
异常标记
    ↓ 用户确认
最终数据
    ↓ 保存
IndexedDB + 服务器数据库
```

### 5.2 测试数据流向

```
硬件（STM32）
    ↓ 串口通信
实时采集缓冲区
    ↓ 采集完成
原始波形
    ↓ 自动裁剪（使用采集参数）
裁剪后的波形
    ↓ 固定长度缩放
标准化波形
    ↓ 特征提取
180维特征向量
    ↓ CNN/DTW识别
识别结果
    ↓ 显示
用户界面
```

## 第六部分：存在的问题

### 问题1：采集全部异常

**现象**：采集7条数据，7条全部被标记为异常

**原因链**：
1. 裁剪算法返回 `(0, length)` 但标记为质量不可接受
2. 异常检测看到这个标记，计算出低的 consistencyScore
3. consistencyScore < 40，标记为异常

**影响**：用户无法保存采集数据

### 问题2：删除异常后无法保存

**现象**：用户删除异常波形后，点击"保留所有波形，继续保存"，系统卡住

**原因**：保存函数可能有异常或没有正确处理

**影响**：用户无法完成采集流程

### 问题3：缺少用户反馈

**现象**：采集和测试时，用户不知道是否完成了裁剪和缩放

**原因**：没有显示裁剪和缩放的完成提示

**影响**：用户体验不佳

## 第七部分：文件清单

### 核心页面文件
- `client/src/pages/CollectionMode.tsx` - 采集页面（~1360行）
- `client/src/pages/RecognitionMode.tsx` - 测试页面（~500行）
- `client/src/pages/DataManagement.tsx` - 数据管理页面
- `client/src/pages/AdminDashboard.tsx` - 管理员后台
- `client/src/pages/Home.tsx` - 首页

### 核心库文件
- `client/src/lib/simple-front-rear-cropping.ts` - 前后空白裁剪算法
- `client/src/lib/cropping-logger-and-quality.ts` - 质量评分和异常检测
- `client/src/lib/integrated-cropping-system.ts` - 集成裁剪系统
- `client/src/lib/waveform-normalizer.ts` - 固定长度缩放
- `client/src/lib/recognition-engine.ts` - 识别引擎
- `client/src/lib/db.ts` - 数据库操作
- `client/src/lib/serial-port.ts` - 串口通信
- `client/src/lib/dsp-processor.ts` - 信号处理
- `client/src/lib/advanced-feature-extraction.ts` - 特征提取
- `client/src/lib/cnn-model.ts` - CNN模型
- `client/src/lib/dtw-algorithm.ts` - DTW算法

### 组件文件
- `client/src/components/AnomalyPromptDialog.tsx` - 异常检测对话框
- `client/src/components/WaveformVisualization.tsx` - 波形可视化
- `client/src/components/EnhancedWaveformVisualization.tsx` - 增强波形可视化
- `client/src/components/ImprovedQualityScoreDisplay.tsx` - 质量评分显示

---

**下一部分将包含所有核心代码的完整实现**


---

## 第八部分：核心代码实现

### 8.1 前后空白裁剪算法 (simple-front-rear-cropping.ts)

```typescript
/**
 * 简单的前后空白裁剪算法
 * 
 * 用户指定的裁剪方法：
 * 1. 从前往后扫描，找到第一个有效信号（超过阈值），记为 startIdx
 * 2. 从后往前扫描，找到最后一个有效信号（超过阈值），记为 endIdx
 * 3. 保留 [startIdx, endIdx] 之间的所有数据，不删除任何中间部分
 * 
 * 这个方法保证了波形的完整性和特征的连续性
 */

export interface SimpleCroppingResult {
  startIdx: number;           // 裁剪后的起始索引
  endIdx: number;             // 裁剪后的结束索引
  length: number;             // 裁剪后的长度
  confidence: number;         // 置信度 (0-1)
  isQualityAcceptable: boolean; // 质量是否可接受
  qualityReason?: string;     // 质量不可接受的原因
  
  // 多峰值兼容字段（用于与旧代码兼容）
  peakCount?: number;
  detectionStrategy?: 'single' | 'multi';
  snrWeights?: { ch1: number; ch2: number; ch3: number };
}

/**
 * 关键函数1：计算三通道的能量
 */
function calculateEnergy(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): number[] {
  const length = Math.min(ch1.length, ch2.length, ch3.length);
  const energy: number[] = [];

  for (let i = 0; i <= length - windowSize; i++) {
    const window1 = ch1.slice(i, i + windowSize);
    const window2 = ch2.slice(i, i + windowSize);
    const window3 = ch3.slice(i, i + windowSize);

    const rms1 = Math.sqrt(window1.reduce((sum, x) => sum + x * x, 0) / windowSize);
    const rms2 = Math.sqrt(window2.reduce((sum, x) => sum + x * x, 0) / windowSize);
    const rms3 = Math.sqrt(window3.reduce((sum, x) => sum + x * x, 0) / windowSize);

    // 三通道加权平均
    const avgRMS = (rms1 + rms2 + rms3) / 3;
    energy.push(avgRMS);
  }

  return energy;
}

/**
 * 关键函数2：计算能量统计
 */
function calculateEnergyStats(energy: number[]): {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  median: number;
} {
  if (energy.length === 0) {
    return { min: 0, max: 0, mean: 0, stdDev: 0, median: 0 };
  }

  const sorted = [...energy].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = energy.reduce((a, b) => a + b, 0) / energy.length;
  const variance = energy.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / energy.length;
  const stdDev = Math.sqrt(variance);
  const median = sorted[Math.floor(sorted.length / 2)];

  return { min, max, mean, stdDev, median };
}

/**
 * 关键函数3：计算动态阈值
 * 
 * 这是算法的关键！阈值决定了是否能找到有效信号
 */
function calculateDynamicThreshold(stats: {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  median: number;
}): number {
  const { min, max, mean, stdDev } = stats;
  const energyRange = max - min;

  // 如果能量范围太小，说明信号很弱
  if (energyRange < 0.01) {
    return min + energyRange * 0.3;
  }

  // 计算变异系数（标准差 / 均值）
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

  if (coefficientOfVariation > 0.3) {
    // 能量分布明显，使用基于stdDev的阈值
    const threshold = mean - stdDev * 0.5;
    return Math.max(threshold, min + energyRange * 0.1);
  } else {
    // 能量分布不明显，使用基于能量范围的阈值
    return min + energyRange * 0.2;
  }
}

/**
 * 关键函数4：执行简单的前后空白裁剪
 * 
 * 这是核心的裁剪逻辑
 */
export function performSimpleCropping(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  windowSize: number = 20
): SimpleCroppingResult {
  const length = Math.min(ch1.length, ch2.length, ch3.length);

  if (length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: false,
      qualityReason: '输入信号为空',
    };
  }

  // 1. 计算三通道的能量
  const energy = calculateEnergy(ch1, ch2, ch3, windowSize);

  if (energy.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: false,
      qualityReason: '能量计算失败',
    };
  }

  // 2. 计算能量统计
  const energyStats = calculateEnergyStats(energy);

  // 3. 计算动态阈值
  const threshold = calculateDynamicThreshold(energyStats);

  // 4. 从前往后找到第一个超过阈值的点
  let frontIdx = -1;
  for (let i = 0; i < energy.length; i++) {
    if (energy[i] > threshold) {
      frontIdx = i;
      break;
    }
  }

  // 5. 从后往前找到最后一个超过阈值的点
  let rearIdx = -1;
  for (let i = energy.length - 1; i >= 0; i--) {
    if (energy[i] > threshold) {
      rearIdx = i + 1;
      break;
    }
  }

  // ❌ 问题所在：如果没有找到有效信号
  if (frontIdx === -1 || rearIdx === -1) {
    // 返回整个信号但标记为质量不可接受
    return {
      startIdx: 0,
      endIdx: length,
      length: length,
      confidence: 0.5,
      isQualityAcceptable: false,  // ❌ 这个标记导致异常检测误判
      qualityReason: '未找到有效信号，返回整个波形',
    };
  }

  // 如果frontIdx > rearIdx，交换它们
  if (frontIdx > rearIdx) {
    [frontIdx, rearIdx] = [rearIdx, frontIdx];
  }

  // 6. 转换为样本索引
  const startIdx = Math.max(0, frontIdx * windowSize);
  const endIdx = Math.min(length, rearIdx * windowSize);

  // ✅ 防护检查：确保 startIdx < endIdx
  if (startIdx >= endIdx) {
    return {
      startIdx: 0,
      endIdx: length,
      length: length,
      confidence: 0.5,
      isQualityAcceptable: false,
      qualityReason: '裁剪范围无效，返回整个波形',
    };
  }

  // 7. 计算置信度（有效段占比）
  const validSegmentLength = endIdx - startIdx;
  const confidence = length > 0 ? validSegmentLength / length : 0;

  // 8. 质量检查
  const MIN_VALID_LENGTH = 100;
  const MIN_CONFIDENCE = 0.2;
  const isQualityAcceptable = validSegmentLength >= MIN_VALID_LENGTH && confidence >= MIN_CONFIDENCE;

  return {
    startIdx,
    endIdx,
    length: validSegmentLength,
    confidence,
    isQualityAcceptable,
    qualityReason: !isQualityAcceptable ? '裁剪质量不达标' : undefined,
    peakCount: 1,
    detectionStrategy: 'single',
  };
}

/**
 * 关键函数5：批量裁剪多个波形集合
 * 
 * 对每个采集分别进行裁剪，然后使用中位数作为共同的裁剪参数
 */
export function batchSimpleCropping(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>[],
  onProgress?: (current: number, total: number) => void
): SimpleCroppingResult {
  if (collections.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: false,
      qualityReason: '没有采集数据',
    };
  }

  // 对每个采集进行裁剪
  const croppingResults: SimpleCroppingResult[] = [];

  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    if (collection.length === 0) continue;

    // 合并该采集中的所有波形
    const allCh1 = collection.map(w => w.ch1).flat();
    const allCh2 = collection.map(w => w.ch2).flat();
    const allCh3 = collection.map(w => w.ch3).flat();

    const result = performSimpleCropping(allCh1, allCh2, allCh3);
    croppingResults.push(result);

    if (onProgress) {
      onProgress(i + 1, collections.length);
    }
  }

  if (croppingResults.length === 0) {
    return {
      startIdx: 0,
      endIdx: 0,
      length: 0,
      confidence: 0,
      isQualityAcceptable: false,
      qualityReason: '所有采集都失败了',
    };
  }

  // 使用中位数作为共同的裁剪参数
  const startIndices = croppingResults.map(r => r.startIdx).sort((a, b) => a - b);
  const endIndices = croppingResults.map(r => r.endIdx).sort((a, b) => a - b);

  const medianStartIdx = startIndices[Math.floor(startIndices.length / 2)];
  const medianEndIdx = endIndices[Math.floor(endIndices.length / 2)];

  // ✅ 关键修复：确保 startIdx < endIdx
  const finalStartIdx = Math.min(medianStartIdx, medianEndIdx);
  const finalEndIdx = Math.max(medianStartIdx, medianEndIdx);

  const avgConfidence = croppingResults.reduce((sum, r) => sum + r.confidence, 0) / croppingResults.length;

  const validSegmentLength = finalEndIdx - finalStartIdx;
  const isQualityAcceptable = validSegmentLength >= 100 && avgConfidence >= 0.2;

  return {
    startIdx: finalStartIdx,
    endIdx: finalEndIdx,
    length: validSegmentLength,
    confidence: avgConfidence,
    isQualityAcceptable,
    qualityReason: !isQualityAcceptable ? '批量裁剪质量不达标' : undefined,
    peakCount: 1,
    detectionStrategy: 'single',
  };
}
```

**代码分析**：

1. **calculateEnergy()** - 计算三通道的RMS能量，使用20个样本的滑动窗口
2. **calculateEnergyStats()** - 计算能量的统计特性（min, max, mean, stdDev, median）
3. **calculateDynamicThreshold()** - 计算动态阈值，这是关键！
   - 如果能量范围太小，返回较低的阈值
   - 根据变异系数选择不同的阈值计算方法
4. **performSimpleCropping()** - 执行裁剪
   - 从前往后找第一个超过阈值的点
   - 从后往前找最后一个超过阈值的点
   - **❌ 问题**：如果没找到，返回 `(0, length)` 但标记为 `isQualityAcceptable: false`
5. **batchSimpleCropping()** - 批量裁剪
   - 对每个采集单独裁剪
   - 使用中位数作为共同参数
   - **✅ 修复**：确保 `finalStartIdx < finalEndIdx`

**问题**：
- 阈值计算可能太高，导致找不到有效信号
- 当找不到时，返回整个波形但标记为质量不可接受
- 这个标记被异常检测系统误解，导致所有采集都被标记为异常


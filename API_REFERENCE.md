# Darklo 肌电静默输入系统 - API 参考文档

**文档版本**：1.0  
**生成时间**：2026-05-22

---

## 目录

1. [信号处理 API](#信号处理-api)
2. [识别引擎 API](#识别引擎-api)
3. [数据管理 API](#数据管理-api)
4. [UI 组件 API](#ui-组件-api)
5. [错误处理](#错误处理)
6. [使用示例](#使用示例)

---

## 信号处理 API

### 模块：`advanced-feature-extraction.ts`

#### `extractAdvancedFeatures(waveform, samplingRate?)`

**功能**：从三通道波形提取 180 维高级特征

**签名**：
```typescript
function extractAdvancedFeatures(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] },
  samplingRate: number = 500
): number[]
```

**参数**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `waveform` | `object` | - | 三通道波形数据 |
| `waveform.ch1` | `number[]` | - | 通道 1 波形 |
| `waveform.ch2` | `number[]` | - | 通道 2 波形 |
| `waveform.ch3` | `number[]` | - | 通道 3 波形 |
| `samplingRate` | `number` | 500 | 采样率（Hz） |

**返回值**：
- `number[]` - 180 维特征向量
  - 0-59：时域特征（6 维 × 3 通道）
  - 60-149：频域特征（30 维 × 3 通道）
  - 150-179：MFCC 特征（10 维 × 3 通道）

**异常**：
- 如果波形为空，返回全 0 向量
- 如果波形长度 < 32，返回全 0 向量

**示例**：
```typescript
const waveform = {
  ch1: [1.2, 2.3, 3.4, ...],
  ch2: [2.1, 3.2, 4.3, ...],
  ch3: [1.5, 2.6, 3.7, ...],
};

const features = extractAdvancedFeatures(waveform, 500);
console.log(features.length); // 180
console.log(features[0]); // 时域特征（MAV）
```

#### `extractTimeDomainFeatures(signal)`

**功能**：提取 6 维时域特征

**签名**：
```typescript
function extractTimeDomainFeatures(signal: number[]): TimeDomainFeatures

interface TimeDomainFeatures {
  mav: number;   // 均值绝对值
  rms: number;   // 均方根值
  var: number;   // 方差
  wl: number;    // 波形长度
  zcr: number;   // 零交叉率
  mal: number;   // 肌肉激活水平
}
```

**示例**：
```typescript
const signal = [1.2, 2.3, 3.4, ...];
const tdFeatures = extractTimeDomainFeatures(signal);
console.log(tdFeatures.mav); // 2.5
console.log(tdFeatures.rms); // 3.1
```

#### `extractFrequencyDomainFeaturesV2(signal, samplingRate?)`

**功能**：提取 30 维频域特征（使用 FFT）

**签名**：
```typescript
function extractFrequencyDomainFeaturesV2(
  signal: number[],
  samplingRate: number = 500
): number[]
```

**返回值**：
- `number[]` - 30 维特征向量
  - 0-25：频带功率（26 个频带，0-250 Hz，10 Hz 间隔）
  - 26-29：统计特征（低频、中频、高频能量比和频谱熵）

**性能**：
- 时间复杂度：O(n log n)
- 处理速度：~10-15ms（1000 样本）

**示例**：
```typescript
const signal = [1.2, 2.3, 3.4, ...];
const fdFeatures = extractFrequencyDomainFeaturesV2(signal, 500);
console.log(fdFeatures.length); // 30
console.log(fdFeatures[0]); // 0-10 Hz 频带功率
```

### 模块：`integrated-cropping-system.ts`

#### `IntegratedCroppingSystem.performCollectionCropping(collections, onProgress?)`

**功能**：执行采集模式的两阶段裁剪

**签名**：
```typescript
async performCollectionCropping(
  collections: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>,
  onProgress?: (current: number, total: number) => void
): Promise<IntegratedCroppingResult>

interface IntegratedCroppingResult {
  stage1Result: MultiPeakCroppingResult;
  stage1Crops: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>;
  stage2Result: { targetLength: number; success: boolean };
  stage2Crops: Array<{ ch1: number[]; ch2: number[]; ch3: number[] }>;
  qualityScores: WaveformQualityScore[];
  anomalousIndices: number[];
  totalCollections: number;
  successfulCollections: number;
  successRate: number;
}
```

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `collections` | `array` | 采集数据数组 |
| `onProgress` | `function` | 进度回调（可选） |

**返回值**：
- 包含两个阶段的裁剪结果、质量评分和异常检测结果

**异常处理**：
- 如果采集数据为空，返回空结果
- 如果裁剪失败，返回原始数据

**示例**：
```typescript
const collections = [
  { ch1: [...], ch2: [...], ch3: [...] },
  { ch1: [...], ch2: [...], ch3: [...] },
];

const result = await integratedCroppingSystem.performCollectionCropping(
  collections,
  (current, total) => console.log(`处理进度：${current}/${total}`)
);

console.log(`成功率：${result.successRate}`);
console.log(`异常波形：${result.anomalousIndices}`);
```

#### `IntegratedCroppingSystem.performTestCropping(waveform)`

**功能**：执行测试模式的两阶段裁剪

**签名**：
```typescript
async performTestCropping(
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] }
): Promise<TestCroppingResult>

interface TestCroppingResult {
  stage1Crop: { ch1: number[]; ch2: number[]; ch3: number[] };
  stage1Result: MultiPeakCroppingResult;
  stage2Crop: { ch1: number[]; ch2: number[]; ch3: number[] };
  stage2Result: { targetLength: number; success: boolean };
  qualityScore: WaveformQualityScore;
  isAnomaly: boolean;
}
```

**示例**：
```typescript
const waveform = { ch1: [...], ch2: [...], ch3: [...] };
const result = await integratedCroppingSystem.performTestCropping(waveform);

console.log(`质量评分：${result.qualityScore.overallScore}`);
console.log(`是否异常：${result.isAnomaly}`);
```

---

## 识别引擎 API

### 模块：`recognition-engine.ts`

#### `RecognitionEngine.recognize(features)`

**功能**：执行识别

**签名**：
```typescript
recognize(features: number[]): RecognitionPrediction[]

interface RecognitionPrediction {
  commandId: string;
  commandName: string;
  confidence: number;        // 0-1
  distance: number;
  details: {
    euclidean: number;
    cosine: number;
    mahalanobis: number;
  };
}
```

**参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `features` | `number[]` | 180 维特征向量 |

**返回值**：
- `RecognitionPrediction[]` - 按置信度降序排列的识别结果

**示例**：
```typescript
const features = extractAdvancedFeatures(waveform);
const predictions = recognitionEngine.recognize(features);

console.log(`最可能的指令：${predictions[0].commandName}`);
console.log(`置信度：${(predictions[0].confidence * 100).toFixed(1)}%`);

// 显示所有预测
predictions.forEach((pred, idx) => {
  console.log(`${idx + 1}. ${pred.commandName}: ${pred.confidence.toFixed(3)}`);
});
```

#### `computeConfidence(testFeature, libraryEntry, weights?)`

**功能**：计算单个指令的置信度

**签名**：
```typescript
function computeConfidence(
  testFeature: number[],
  libraryEntry: FeatureLibraryEntry,
  weights?: { euclidean: number; cosine: number; mahalanobis: number }
): RecognitionPrediction

interface FeatureLibraryEntry {
  commandId: string;
  commandName: string;
  featureMean: number[];     // 180 维
  featureStd: number[];      // 180 维
  sourceCount: number;
  generatedAt: number;
}
```

**参数**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `testFeature` | `number[]` | - | 测试特征向量 |
| `libraryEntry` | `object` | - | 特征库条目 |
| `weights` | `object` | `{euclidean: 0.4, cosine: 0.3, mahalanobis: 0.3}` | 距离度量权重 |

**返回值**：
- `RecognitionPrediction` - 单个识别预测

**示例**：
```typescript
const libraryEntry: FeatureLibraryEntry = {
  commandId: 'cmd1',
  commandName: 'command1',
  featureMean: [...],
  featureStd: [...],
  sourceCount: 5,
  generatedAt: Date.now(),
};

const prediction = computeConfidence(features, libraryEntry);
console.log(`置信度：${prediction.confidence}`);
console.log(`欧几里得距离：${prediction.details.euclidean}`);
```

#### `euclideanDistance(v1, v2)`

**功能**：计算欧几里得距离

**签名**：
```typescript
function euclideanDistance(v1: number[], v2: number[]): number
```

**公式**：
```
d = sqrt(Σ(v1[i] - v2[i])²)
```

#### `cosineSimilarity(v1, v2)`

**功能**：计算余弦相似度

**签名**：
```typescript
function cosineSimilarity(v1: number[], v2: number[]): number
```

**返回值**：
- `number` - 相似度值，范围 [-1, 1]

#### `mahalanobisDistance(v1, v2, std)`

**功能**：计算马氏距离

**签名**：
```typescript
function mahalanobisDistance(
  v1: number[],
  v2: number[],
  std: number[]
): number
```

---

## 数据管理 API

### 模块：`db.ts`

#### `emgDatabase.saveCommand(name, collection)`

**功能**：保存采集数据

**签名**：
```typescript
async saveCommand(
  name: string,
  collection: CollectionData
): Promise<void>

interface CollectionData {
  index: number;
  timestamp: number;
  waveform: { ch1: number[]; ch2: number[]; ch3: number[] };
  duration: number;
  userId: string;
  userName: string;
  croppingMeta: {
    stage: 'primary' | 'fallback' | 'full_segment';
    confidence: number;
    originalLength: number;
    croppedLength: number;
    normalizedLength: number;
  };
  recognitionResults: RecognitionResult[];
}
```

**示例**：
```typescript
await emgDatabase.saveCommand('command1', {
  index: 1,
  timestamp: Date.now(),
  waveform: { ch1: [...], ch2: [...], ch3: [...] },
  duration: 2000,
  userId: 'user1',
  userName: 'Alice',
  croppingMeta: {
    stage: 'primary',
    confidence: 0.95,
    originalLength: 1000,
    croppedLength: 800,
    normalizedLength: 512,
  },
  recognitionResults: [],
});
```

#### `emgDatabase.getAllCommands()`

**功能**：获取所有采集的指令

**签名**：
```typescript
async getAllCommands(): Promise<CommandData[]>

interface CommandData {
  name: string;
  collections: CollectionData[];
  accuracy: number;
  createdAt: string;
}
```

**示例**：
```typescript
const commands = await emgDatabase.getAllCommands();
commands.forEach(cmd => {
  console.log(`指令：${cmd.name}，采集数：${cmd.collections.length}`);
});
```

#### `emgDatabase.deleteCollection(commandName, collectionIndex)`

**功能**：删除单条采集数据

**签名**：
```typescript
async deleteCollection(
  commandName: string,
  collectionIndex: number
): Promise<void>
```

**示例**：
```typescript
await emgDatabase.deleteCollection('command1', 0);
```

#### `emgDatabase.deleteCommand(commandName)`

**功能**：删除整个指令及其所有采集数据

**签名**：
```typescript
async deleteCommand(commandName: string): Promise<void>
```

### 模块：`data-export.ts`

#### `exportToCSV(commandsData)`

**功能**：导出采集数据为 CSV 格式

**签名**：
```typescript
function exportToCSV(commandsData: CommandData[]): string
```

**CSV 格式**：
```
指令名称,采集索引,通道1长度,通道2长度,通道3长度,裁剪置信度,处理阶段,采集时间
command1,1,800,800,800,0.95,primary,2026-05-22T10:00:00Z
command1,2,750,750,750,0.88,fallback,2026-05-22T10:01:00Z
```

**示例**：
```typescript
const csv = exportToCSV(commandsData);
const blob = new Blob([csv], { type: 'text/csv' });
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = 'collections.csv';
link.click();
```

#### `exportToJSON(commandsData)`

**功能**：导出采集数据为 JSON 格式

**签名**：
```typescript
function exportToJSON(commandsData: CommandData[]): string
```

**JSON 格式**：
```json
{
  "exportTime": "2026-05-22T10:00:00Z",
  "commands": [
    {
      "name": "command1",
      "collections": [
        {
          "index": 1,
          "timestamp": 1716360000000,
          "waveform": { "ch1": [...], "ch2": [...], "ch3": [...] },
          "croppingMeta": { ... }
        }
      ]
    }
  ]
}
```

#### `exportRecognitionResultsToCSV(recognitionResults)`

**功能**：导出识别结果为 CSV 格式

**签名**：
```typescript
function exportRecognitionResultsToCSV(
  recognitionResults: RecognitionResult[]
): string
```

#### `exportRecognitionResultsToJSON(recognitionResults)`

**功能**：导出识别结果为 JSON 格式

**签名**：
```typescript
function exportRecognitionResultsToJSON(
  recognitionResults: RecognitionResult[]
): string
```

---

## UI 组件 API

### 组件：`CollectionMode.tsx`

**功能**：采集训练界面

**Props**：无（使用全局状态）

**事件**：
- `onCollectionSaved` - 采集数据保存时触发
- `onAnomalyDetected` - 检测到异常波形时触发

**示例**：
```typescript
import CollectionMode from '@/pages/CollectionMode';

export default function App() {
  return <CollectionMode />;
}
```

### 组件：`RecognitionMode.tsx`

**功能**：识别测试界面

**Props**：无（使用全局状态）

**事件**：
- `onRecognitionComplete` - 识别完成时触发
- `onRecognitionError` - 识别失败时触发

### 组件：`DataManagement.tsx`

**功能**：数据管理界面

**Props**：无（使用全局状态）

**功能**：
- 显示采集数据和识别结果
- 数据导出（CSV/JSON）
- 数据删除
- 审计日志查看

---

## 错误处理

### 常见错误

#### 1. 波形数据无效

**错误消息**：`Invalid waveform data: channels must have same length`

**原因**：三通道波形长度不一致

**解决方案**：
```typescript
// 确保三通道长度一致
const maxLength = Math.max(ch1.length, ch2.length, ch3.length);
const waveform = {
  ch1: padArray(ch1, maxLength),
  ch2: padArray(ch2, maxLength),
  ch3: padArray(ch3, maxLength),
};
```

#### 2. 特征库为空

**错误消息**：`No feature library available for recognition`

**原因**：未进行任何采集训练

**解决方案**：
```typescript
// 先进行采集训练
const commands = await emgDatabase.getAllCommands();
if (commands.length === 0) {
  console.warn('请先进行采集训练');
  return;
}
```

#### 3. IndexedDB 操作失败

**错误消息**：`IndexedDB operation failed: ...`

**原因**：
- 浏览器不支持 IndexedDB
- 存储配额已满
- 事务冲突

**解决方案**：
```typescript
try {
  await emgDatabase.saveCommand(name, collection);
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    console.error('存储空间已满，请删除旧数据');
  } else {
    console.error('保存失败：', error);
  }
}
```

---

## 使用示例

### 完整采集流程

```typescript
import { integratedCroppingSystem } from '@/lib/integrated-cropping-system';
import { extractAdvancedFeatures } from '@/lib/advanced-feature-extraction';
import { emgDatabase } from '@/lib/db';

async function collectAndSaveWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[],
  commandName: string
) {
  try {
    // 1. 执行两阶段裁剪
    const croppingResult = await integratedCroppingSystem.performCollectionCropping(
      [{ ch1, ch2, ch3 }],
      (current, total) => console.log(`处理进度：${current}/${total}`)
    );

    // 2. 检查是否有异常
    if (croppingResult.anomalousIndices.length > 0) {
      console.warn('检测到异常波形');
      return;
    }

    // 3. 提取特征
    const croppedWaveform = croppingResult.stage2Crops[0];
    const features = extractAdvancedFeatures(croppedWaveform);

    // 4. 保存到 IndexedDB
    await emgDatabase.saveCommand(commandName, {
      index: Date.now(),
      timestamp: Date.now(),
      waveform: croppedWaveform,
      duration: ch1.length / 500, // 假设采样率 500Hz
      userId: 'user1',
      userName: 'Alice',
      croppingMeta: {
        stage: 'primary',
        confidence: croppingResult.stage1Result.confidence,
        originalLength: ch1.length,
        croppedLength: croppingResult.stage1Crops[0].ch1.length,
        normalizedLength: 512,
      },
      recognitionResults: [],
    });

    console.log('采集数据已保存');
  } catch (error) {
    console.error('采集失败：', error);
  }
}
```

### 完整识别流程

```typescript
import { integratedCroppingSystem } from '@/lib/integrated-cropping-system';
import { extractAdvancedFeatures } from '@/lib/advanced-feature-extraction';
import { recognitionEngine } from '@/lib/recognition-engine';
import { emgDatabase } from '@/lib/db';

async function recognizeWaveform(
  ch1: number[],
  ch2: number[],
  ch3: number[]
) {
  try {
    // 1. 执行两阶段裁剪
    const croppingResult = await integratedCroppingSystem.performTestCropping({
      ch1,
      ch2,
      ch3,
    });

    // 2. 检查质量
    if (croppingResult.isAnomaly) {
      console.warn('波形质量不佳');
      return null;
    }

    // 3. 提取特征
    const features = extractAdvancedFeatures(croppingResult.stage2Crop);

    // 4. 执行识别
    const predictions = recognitionEngine.recognize(features);

    // 5. 返回最高置信度的结果
    if (predictions.length > 0 && predictions[0].confidence > 0.5) {
      const result = {
        command: predictions[0].commandName,
        confidence: predictions[0].confidence,
        allPredictions: predictions,
      };

      // 6. 保存识别结果（可选）
      await emgDatabase.saveRecognitionResult({
        timestamp: Date.now(),
        command: result.command,
        confidence: result.confidence,
        allScores: predictions,
      });

      return result;
    } else {
      console.log('无法识别');
      return null;
    }
  } catch (error) {
    console.error('识别失败：', error);
    return null;
  }
}
```

### 数据导出示例

```typescript
import { exportToCSV, exportToJSON } from '@/lib/data-export';
import { emgDatabase } from '@/lib/db';

async function exportAllData() {
  try {
    // 1. 获取所有数据
    const commands = await emgDatabase.getAllCommands();

    // 2. 导出为 CSV
    const csv = exportToCSV(commands);
    const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const csvLink = document.createElement('a');
    csvLink.href = URL.createObjectURL(csvBlob);
    csvLink.download = `collections-${new Date().toISOString()}.csv`;
    csvLink.click();

    // 3. 导出为 JSON
    const json = exportToJSON(commands);
    const jsonBlob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const jsonLink = document.createElement('a');
    jsonLink.href = URL.createObjectURL(jsonBlob);
    jsonLink.download = `collections-${new Date().toISOString()}.json`;
    jsonLink.click();

    console.log('数据导出完成');
  } catch (error) {
    console.error('导出失败：', error);
  }
}
```

---

**文档完成时间**：2026-05-22  
**文档版本**：1.0  
**审查状态**：待外部 AI 评审

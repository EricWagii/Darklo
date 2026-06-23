# Darklo EMG 系统 — 严格评审反馈解决方案

**评审来源**：外部 AI 完整代码评审  
**评审日期**：2026-05-22  
**处理原则**：
- ✅ 逐条记录反馈，不遗漏任何建议
- ✅ 实际修改代码，不虚假模拟
- ✅ 真实运行测试，不虚报通过
- ✅ 验证修复效果，不混乱丢三落四

---

## 一、裁剪算法问题 🔴 （最高优先级）

### 问题 1.1：阈值算法原封未动

**反馈内容**：
- 当前：`threshold = mean + 0.5 * std` （全段均值）
- 问题：把有效信号也算入均值，导致阈值偏高；弱指令会导致 `startIdx = -1`
- 上轮建议：**双端静息估计法**（头尾各 8% 估基线）或 **Otsu 二值化**
- 当前状态：**未实现**

**修复方案**：
1. 在 `independent-cropping.ts` 中实现 `estimateRestingBaseline()` 函数
   - 取信号头尾各 8% 的样本点
   - 计算这部分的均值和标准差
   - 使用 `threshold = restMean + 3.5 * restStd`
2. 修改 `performSimpleCropping()` 使用新阈值
3. 修改 `batchSimpleCroppingCompat()` 同步应用

**验证方法**：
- [ ] 创建测试用例：弱信号（低能量）应被正确裁剪，不返回 `startIdx = -1`
- [ ] 创建测试用例：强信号应保留有效段，不过度裁剪
- [ ] 真实采集数据测试：采集舌部肌电（弱指令），验证裁剪结果

**修复状态**：❌ 未开始

---

### 问题 1.2：批量裁剪仍用共享索引

**反馈内容**：
- 当前：`batchSimpleCroppingCompat()` 返回单一 `startIdx/endIdx`，所有条共用
- 问题：一条错乱数据污染全部裁剪结果
- 上轮建议：**每条独立裁剪**，各自输出
- 当前状态：**未实现**

**修复方案**：
1. 修改 `batchSimpleCroppingCompat()` 返回值结构
   ```typescript
   // 当前
   return { startIdx, endIdx, confidence, ... }
   
   // 修改为
   return {
     results: [
       { startIdx, endIdx, confidence, ... },  // 第1条
       { startIdx, endIdx, confidence, ... },  // 第2条
       ...
     ]
   }
   ```
2. 修改调用处理逻辑，对每条应用各自的裁剪索引
3. 在 `CollectionMode.tsx` 中调整处理逻辑

**验证方法**：
- [ ] 创建测试用例：3 条波形，其中第 2 条是噪声，验证第 1、3 条仍被正确裁剪
- [ ] 创建测试用例：验证返回结果长度 = 输入条数
- [ ] 真实采集数据测试：多条采集中混入一条异常，验证其他条不受影响

**修复状态**：❌ 未开始

---

### 问题 1.3：fallback 路径 `isQualityAcceptable` 修复确认不清

**反馈内容**：
- 上轮指出：`isQualityAcceptable: false` 触发下游全部异常
- 要求改为：返回低置信度但 `isQualityAcceptable: true`
- 当前状态：`performSimpleCropping()` 看起来已修复，但 `batchSimpleCroppingCompat()` 路径不清
- 问题：**确认盲点**

**修复方案**：
1. 审查 `performSimpleCropping()` 中 fallback 路径的 `isQualityAcceptable` 设置
2. 审查 `batchSimpleCroppingCompat()` 中 fallback 路径的 `isQualityAcceptable` 设置
3. 确保两个路径一致：都返回 `isQualityAcceptable: true`，但 `confidence` 较低

**验证方法**：
- [ ] 代码审查：两个函数的 fallback 路径都返回 `isQualityAcceptable: true`
- [ ] 创建测试用例：fallback 路径返回的对象中 `isQualityAcceptable` 必须为 `true`
- [ ] 创建测试用例：验证 fallback 的置信度 < primary 的置信度

**修复状态**：❌ 未开始

---

### 问题 1.4：`startIdx`/`endIdx` 反序问题

**反馈内容**：
- 已知 bug：`startIdx=2160, endIdx=1170, 长度=-990`
- 当前有交换逻辑但仅在窗口索引层面
- 问题：转换回样本索引后仍可能反序
- 当前状态：**没有回归测试**

**修复方案**：
1. 在 `performSimpleCropping()` 中，在最终返回前添加断言
   ```typescript
   if (startIdx > endIdx) {
     console.error(`Invalid crop indices: startIdx=${startIdx} > endIdx=${endIdx}`);
     // 触发 fallback 或返回错误
   }
   ```
2. 添加防护：若反序，自动交换或返回全段
3. 添加日志记录反序事件

**验证方法**：
- [ ] 创建回归测试用例：名称为 "should handle reversed indices gracefully"
- [ ] 创建测试用例：验证返回的 `startIdx < endIdx` 总是成立
- [ ] 创建测试用例：验证 `length = endIdx - startIdx > 0`

**修复状态**：❌ 未开始

---

## 二、异常检测问题 🔴 （最高优先级）

### 问题 2.1：异常检测算法未按建议重构

**反馈内容**：
- 上轮建议：8 维特征向量 → 标准化欧氏/马氏距离 → IQR Tukey Fence
- 当前：基于绝对分数阈值判断，没有特征向量、IQR 或马氏距离
- 问题：无法做"相对比对"，导致"所有条分数都低 → 全部异常"
- 当前状态：**完全未实现**

**修复方案**：
1. 在 `WaveformQualityScorer.ts` 中实现新的异常检测算法
   ```typescript
   // 新增函数
   function detectAnomaliesWithIQR(
     qualityScores: WaveformQualityScore[]
   ): number[] {
     // 1. 提取 8 维特征向量（MAV, RMS, ZCR, MAL, IEMG, VAR, WL, SSC）
     const featureVectors = qualityScores.map(score => [
       score.mav, score.rms, score.zcr, score.mal,
       score.iemg, score.var, score.wl, score.ssc
     ]);
     
     // 2. 标准化每个特征维度
     const normalized = normalizeFeatures(featureVectors);
     
     // 3. 计算每条与均值的马氏距离（或欧氏距离）
     const distances = normalized.map(vec => 
       mahalanobisDistance(vec, mean, covariance)
     );
     
     // 4. 用 IQR Tukey Fence 判定离群点
     const Q1 = percentile(distances, 25);
     const Q3 = percentile(distances, 75);
     const IQR = Q3 - Q1;
     const upperFence = Q3 + 1.5 * IQR;
     
     return distances
       .map((d, i) => d > upperFence ? i : -1)
       .filter(i => i !== -1);
   }
   ```
2. 修改 `detectAnomalies()` 调用新函数
3. 更新测试用例

**验证方法**：
- [ ] 创建测试用例：5 条相似数据中只有 1 条被判异常（IQR 方法）
- [ ] 创建测试用例：所有数据都低分时，不全部判异常
- [ ] 创建测试用例：验证 IQR 计算正确
- [ ] 真实采集数据测试：采集 10 条同一指令，其中 1 条噪声，验证只有 1 条被标记

**修复状态**：❌ 未开始

---

### 问题 2.2：异常检测触发时机仍在逐条采集时

**反馈内容**：
- 当前：`handleStopCollection()` 中每停止一次采集就弹框
- 问题：只有 1 条数据，无法做"与其他条的相对比对"
- 上轮要求：**异常检测应在达到足够条数后点击"保存"时才触发**
- 当前状态：**逻辑完全反向**

**修复方案**：
1. 移除 `handleStopCollection()` 中的异常检测逻辑
   ```typescript
   // 删除这部分
   const anomalies = detectAnomalies(croppingResult.qualityScores);
   if (anomalies.length > 0) {
     setShowAnomalyDialog(true);
   }
   ```
2. 在 `handleSaveCommand()` 中添加异常检测
   ```typescript
   async function handleSaveCommand() {
     // 获取所有采集的波形
     const allCollections = currentCommand.collections;
     
     // 只有足够条数才做异常检测
     if (allCollections.length >= 3) {
       const anomalies = detectAnomaliesWithIQR(
         allCollections.map(col => col.qualityScore)
       );
       if (anomalies.length > 0) {
         setShowAnomalyDialog(true);
         return;  // 等待用户确认
       }
     }
     
     // 保存到数据库
     await saveToDatabase();
   }
   ```
3. 更新 `AnomalyPromptDialog` 的显示逻辑

**验证方法**：
- [ ] 创建测试用例：采集 1 条 → 停止 → 不弹框
- [ ] 创建测试用例：采集 3 条 → 点击保存 → 弹框显示异常
- [ ] 真实采集数据测试：采集 5 条，其中 1 条异常，点击保存时弹框

**修复状态**：❌ 未开始

---

### 问题 2.3：测试阶段仍保留异常检测

**反馈内容**：
- 当前：`performTestCropping()` 中有 `isAnomaly` 判断，异常时静默返回 null
- 问题：用户完全不知道识别为何没有结果
- 上轮要求：**测试阶段不做异常检测**，裁剪失败时降级使用全段
- 当前状态：**违反设计规格**

**修复方案**：
1. 修改 `performTestCropping()` 移除异常检测
   ```typescript
   // 删除这部分
   if (croppingResult.isAnomaly) {
     console.warn('波形质量不佳');
     return null;
   }
   ```
2. 改为：裁剪失败时使用全段，但继续识别
   ```typescript
   const croppingResult = performSimpleCropping(...);
   if (croppingResult.startIdx === -1) {
     // 裁剪失败，使用全段
     croppingResult.startIdx = 0;
     croppingResult.endIdx = waveform.length;
   }
   // 继续识别，不拦截
   ```
3. 在识别结果中添加标记：`croppingFailed: boolean`

**验证方法**：
- [ ] 创建测试用例：裁剪失败时仍返回识别结果（不是 null）
- [ ] 创建测试用例：识别结果中 `croppingFailed: true` 表示使用了全段
- [ ] 真实采集数据测试：弱信号测试，验证仍能得到识别结果

**修复状态**：❌ 未开始

---

## 三、数据管理单条删除问题 🟡 （高优先级）

### 问题 3.1：删除接口仍用 `collectionIndex`（数字索引）

**反馈内容**：
- 当前：`deleteCollection(commandName: string, collectionIndex: number)`
- 问题：数字索引在删除部分数据后会错位
- 上轮指出：根本原因很可能就是用数组下标而不是 UUID
- 当前状态：**未改为 UUID**

**修复方案**：
1. 在 `CollectionData` 接口中添加 `id: string` 字段
   ```typescript
   interface CollectionData {
     id: string;  // UUID，主键
     index: number;  // 保留用于排序，但不作为删除 key
     // ... 其他字段
   }
   ```
2. 在创建采集数据时生成 UUID
   ```typescript
   const collectionData: CollectionData = {
     id: generateUUID(),  // 新增
     index: collections.length,
     // ...
   };
   ```
3. 修改 `deleteCollection()` 接口
   ```typescript
   // 当前
   async deleteCollection(commandName: string, collectionIndex: number)
   
   // 修改为
   async deleteCollection(commandName: string, collectionId: string)
   ```
4. 修改数据库删除逻辑，使用 UUID 作为 key

**验证方法**：
- [ ] 代码审查：`CollectionData` 中有 `id: string` 字段
- [ ] 创建测试用例：删除第 0 条后，原来的第 1 条用原始 id 仍能被删除
- [ ] 创建测试用例：验证 UUID 唯一性，不会发生主键冲突
- [ ] 真实采集数据测试：采集 5 条，删除第 2 条，再删除第 4 条，验证正确的条被删除

**修复状态**：❌ 未开始

---

### 问题 3.2：存储结构确认

**反馈内容**：
- 当前：`trainingData` store 的 `keyPath: 'id'` 但 `CollectionData` 接口里没有 `id` 字段
- 问题：keyPath 指向的字段必须存在，否则存储失败
- 当前状态：**结构不一致**

**修复方案**：
1. 审查 `db.ts` 中的 `DB_CONFIG` 和 `CollectionData` 接口
2. 确保 keyPath 与接口字段一致
3. 如果 keyPath 是 'id'，确保 `CollectionData` 有 `id` 字段
4. 如果 keyPath 是 'index'，确保 `CollectionData` 有 `index` 字段且值唯一

**验证方法**：
- [ ] 代码审查：DB_CONFIG 的 keyPath 与对应接口字段一致
- [ ] 创建测试用例：保存 `CollectionData` 到 IndexedDB，验证成功
- [ ] 创建测试用例：验证 keyPath 字段值唯一，不会发生冲突

**修复状态**：❌ 未开始

---

## 四、处理状态可视化问题 🟡 （中等优先级）

### 问题 4.1：`stage` 字段的推断逻辑不透明

**反馈内容**：
- 当前：使用 `inferStage()` 函数但没有展示实现
- 问题：如果只是根据 `confidence > 0.8` 划分，阈值选取是否合理？
- 当前状态：**黑盒实现**

**修复方案**：
1. 在 `independent-cropping.ts` 中明确实现 `inferStage()` 函数
   ```typescript
   function inferStage(
     croppingResult: SimpleCroppingResult
   ): 'primary' | 'fallback' | 'full_segment' {
     if (!croppingResult.isQualityAcceptable) {
       return 'full_segment';  // 质量不可接受
     }
     if (croppingResult.confidence > 0.8) {
       return 'primary';  // 高置信度
     }
     return 'fallback';  // 低置信度
   }
   ```
2. 添加详细注释说明阈值选取的理由
3. 添加配置常量，允许调整阈值

**验证方法**：
- [ ] 代码审查：`inferStage()` 函数有明确实现和注释
- [ ] 创建测试用例：验证 `confidence > 0.8` 返回 'primary'
- [ ] 创建测试用例：验证 `confidence <= 0.8` 返回 'fallback'
- [ ] 创建测试用例：验证 `isQualityAcceptable: false` 返回 'full_segment'

**修复状态**：❌ 未开始

---

### 问题 4.2：UI 层的状态展示代码未见

**反馈内容**：
- 当前：文档描述了 `croppingMeta` 数据结构，但没有展示渲染代码
- 问题：用户在界面上是否真的能看到处理状态，无法确认
- 当前状态：**渲染逻辑不透明**

**修复方案**：
1. 在 `DataManagement.tsx` 中添加处理状态徽章的渲染代码
   ```typescript
   function renderCroppingStatusBadge(croppingMeta: CroppingMeta) {
     const stageLabel = {
       'primary': '✅ 已裁剪/已缩放',
       'fallback': '⚠️ 已裁剪/已缩放(降级)',
       'full_segment': '❌ 使用全段'
     }[croppingMeta.stage];
     
     return (
       <div className="flex items-center gap-2">
         <span>{stageLabel}</span>
         <span className="text-xs text-gray-500">
           {(croppingMeta.confidence * 100).toFixed(1)}%
         </span>
       </div>
     );
   }
   ```
2. 在采集历史列表中调用此函数
3. 在 `CollectionMode.tsx` 中也添加相同的渲染逻辑

**验证方法**：
- [ ] 代码审查：`DataManagement.tsx` 中有处理状态徽章的渲染代码
- [ ] 代码审查：`CollectionMode.tsx` 中有处理状态徽章的渲染代码
- [ ] 真实 UI 测试：采集数据后，在界面上能看到处理状态徽章和置信度

**修复状态**：❌ 未开始

---

### 问题 4.3：评分仍为无意义的形式评分

**反馈内容**：
- 当前：`overallScore` 计算公式未展示
- 问题：没有实际物理意义，上轮建议的四维加权评分没有体现
- 当前状态：**评分逻辑不透明**

**修复方案**：
1. 在 `WaveformQualityScorer.ts` 中实现四维加权评分
   ```typescript
   function calculateOverallScore(
     croppingConfidence: number,
     signalEnergy: number,
     signalVariance: number,
     snr: number
   ): number {
     // 四维加权评分
     const weights = {
       croppingConfidence: 0.4,  // 裁剪置信度权重
       signalEnergy: 0.2,        // 信号能量权重
       signalVariance: 0.2,      // 信号方差权重
       snr: 0.2                  // 信噪比权重
     };
     
     const normalizedEnergy = Math.min(signalEnergy / maxEnergy, 1);
     const normalizedVariance = Math.min(signalVariance / maxVariance, 1);
     const normalizedSNR = Math.min(snr / maxSNR, 1);
     
     return (
       weights.croppingConfidence * croppingConfidence +
       weights.signalEnergy * normalizedEnergy +
       weights.signalVariance * normalizedVariance +
       weights.snr * normalizedSNR
     );
   }
   ```
2. 添加详细注释说明权重选取的理由
3. 添加配置常量，允许调整权重

**验证方法**：
- [ ] 代码审查：`calculateOverallScore()` 有明确的四维加权公式
- [ ] 创建测试用例：验证评分在 0-1 范围内
- [ ] 创建测试用例：验证高质量波形评分 > 低质量波形评分
- [ ] 真实采集数据测试：采集高质量和低质量波形，验证评分差异

**修复状态**：❌ 未开始

---

## 五、特征提取问题 🟡 （中等优先级）

### 问题 5.1：频域特征维度计算不自洽

**反馈内容**：
- 当前：文档说 26 个频带 + 4 个统计 = 30 维，但又说 90 维
- MFCC：文档说 13 个 × 3 通道 = 39 维，但接口说 30 维
- 问题：**文档自相矛盾**

**修复方案**：
1. 明确特征维度定义
   ```typescript
   // 每通道特征维度
   const FEATURE_DIMS = {
     TIME_DOMAIN: 8,        // MAV, RMS, ZCR, MAL, IEMG, VAR, WL, SSC
     FREQUENCY_DOMAIN: 30,  // 0-250Hz, 10Hz间隔 = 26个 + 4个统计
     MFCC: 13,              // 标准 MFCC 系数
     TOTAL_PER_CHANNEL: 51  // 8 + 30 + 13
   };
   
   // 三通道总维度
   const TOTAL_DIMS = FEATURE_DIMS.TOTAL_PER_CHANNEL * 3;  // 153
   ```
2. 更新所有文档和注释，统一维度说明
3. 更新代码中的常量定义

**验证方法**：
- [ ] 代码审查：特征维度常量明确定义
- [ ] 创建测试用例：验证提取的特征向量长度 = 预期维度
- [ ] 创建测试用例：验证每个通道的特征维度一致

**修复状态**：❌ 未开始

---

### 问题 5.2：MAL 特征的阈值定义使用了相同的问题阈值

**反馈内容**：
- 当前：`threshold = mean + 0.5 * Math.sqrt(variance)` 
- 问题：与裁剪算法的问题阈值相同，对弱信号失效
- 当前状态：**未改进**

**修复方案**：
1. 在 `advanced-feature-extraction.ts` 中改进 MAL 阈值
   ```typescript
   // 当前（有问题）
   const threshold = mean + 0.5 * Math.sqrt(variance);
   
   // 改为：使用双端静息估计
   const restingSegment = signal.slice(0, signal.length * 0.08)
     .concat(signal.slice(signal.length * 0.92));
   const restingMean = mean(restingSegment);
   const restingStd = std(restingSegment);
   const threshold = restingMean + 3.5 * restingStd;
   ```
2. 更新相关测试

**验证方法**：
- [ ] 代码审查：MAL 阈值使用双端静息估计
- [ ] 创建测试用例：弱信号的 MAL 值 > 0（不为零）
- [ ] 创建测试用例：强信号的 MAL 值 > 弱信号的 MAL 值

**修复状态**：❌ 未开始

---

### 问题 5.3：ZCR 公式实现有误

**反馈内容**：
- 文档公式：`ZCR = (1/(N-1)) × Σ sign(x[i] × x[i+1])`
- 代码实现：`if (signal[i] * signal[i - 1] < 0) zcr++`
- 问题：公式描述和实现语义不一致
- 当前状态：**文档误导**

**修复方案**：
1. 统一公式和实现
   ```typescript
   // 标准 ZCR 实现
   function calculateZCR(signal: number[]): number {
     let zeroCrossings = 0;
     for (let i = 1; i < signal.length; i++) {
       // 检测过零点：相邻两个采样点符号相反
       if (signal[i] * signal[i - 1] < 0) {
         zeroCrossings++;
       }
     }
     return zeroCrossings / (signal.length - 1);
   }
   ```
2. 更新文档公式，改为：
   ```
   ZCR = (1/(N-1)) × Σ 1(sign(x[i]) ≠ sign(x[i-1]))
   ```

**验证方法**：
- [ ] 代码审查：ZCR 实现与文档公式一致
- [ ] 创建测试用例：验证 ZCR 在 0-1 范围内
- [ ] 创建测试用例：验证高频信号的 ZCR > 低频信号的 ZCR

**修复状态**：❌ 未开始

---

## 六、识别引擎问题 🟡 （中等优先级）

### 问题 6.1：马氏距离退化为标准化欧氏距离

**反馈内容**：
- 当前：使用对角协方差矩阵（简化马氏距离）
- 问题：特征高度相关时失效（如 MAV 和 RMS）
- 当前状态：**文档未说明**

**修复方案**：
1. 在 `recognition-engine.ts` 中添加注释说明
   ```typescript
   /**
    * 计算简化的马氏距离（对角协方差矩阵）
    * 
    * 说明：
    * - 使用对角协方差矩阵（每个特征的方差独立）
    * - 假设特征间相关性较小
    * - 当特征高度相关（如 MAV 和 RMS）时，此方法可能高估区分能力
    * - 完整马氏距离需要计算完整协方差矩阵，计算成本高
    * 
    * 改进方向：
    * - 可考虑使用 PCA 降维后再计算马氏距离
    * - 或使用 Mahalanobis 的完整实现（计算成本较高）
    */
   function mahalanobisDistance(v1, v2, std): number {
     // ...
   }
   ```
2. 添加配置选项，允许切换为完整马氏距离

**验证方法**：
- [ ] 代码审查：函数有详细注释说明简化原因和局限性
- [ ] 创建测试用例：验证距离计算正确
- [ ] 性能测试：对比简化和完整马氏距离的计算时间

**修复状态**：❌ 未开始

---

### 问题 6.2：特征库只存均值和标准差，丢失分布信息

**反馈内容**：
- 当前：只存 `featureMean` 和 `featureStd`
- 问题：双峰分布时，均值落在波谷，标准差虚高
- 上轮建议：保留全部原始特征向量或 KNN 结构
- 当前状态：**未改进**

**修复方案**：
1. 修改 `FeatureLibraryEntry` 接口
   ```typescript
   // 当前
   interface FeatureLibraryEntry {
     featureMean: number[];
     featureStd: number[];
     sourceCount: number;
   }
   
   // 改为：保留原始样本（可选压缩存储）
   interface FeatureLibraryEntry {
     featureMean: number[];      // 保留用于快速查询
     featureStd: number[];       // 保留用于快速查询
     featureSamples: number[][];  // 新增：保留原始特征向量
     sourceCount: number;
   }
   ```
2. 修改识别逻辑，使用 KNN 而不是只和均值比对
   ```typescript
   function recognizeCommand(testFeatures: number[]): RecognitionResult {
     let bestCommand = null;
     let bestDistance = Infinity;
     
     for (const [commandName, entry] of featureLibrary.entries()) {
       // 当前：只和均值比对
       // const distance = mahalanobisDistance(testFeatures, entry.featureMean);
       
       // 改为：KNN，与所有样本比对取最小距离
       const distances = entry.featureSamples.map(sample =>
         mahalanobisDistance(testFeatures, sample, entry.featureStd)
       );
       const distance = Math.min(...distances);
       
       if (distance < bestDistance) {
         bestDistance = distance;
         bestCommand = commandName;
       }
     }
     
     return {
       command: bestCommand,
       confidence: 1 / (1 + bestDistance)
     };
   }
   ```

**验证方法**：
- [ ] 代码审查：`FeatureLibraryEntry` 包含 `featureSamples`
- [ ] 创建测试用例：验证 KNN 识别优于均值识别
- [ ] 性能测试：验证 KNN 的计算时间在可接受范围内
- [ ] 真实采集数据测试：采集双峰分布的指令，验证识别准确率提升

**修复状态**：❌ 未开始

---

### 问题 6.3：置信度阈值 0.5 无理论依据

**反馈内容**：
- 当前：`confidence < 0.5` 时返回"无法识别"
- 问题：0.5 的选取没有理论依据，取决于特征尺度
- 当前状态：**阈值任意**

**修复方案**：
1. 改为自适应阈值或基于统计的阈值
   ```typescript
   // 方案 1：基于训练数据的统计阈值
   function calculateConfidenceThreshold(featureLibrary): number {
     // 计算所有训练样本对的距离分布
     const distances = [];
     for (const [cmd1, entry1] of featureLibrary.entries()) {
       for (const sample1 of entry1.featureSamples) {
         for (const [cmd2, entry2] of featureLibrary.entries()) {
           if (cmd1 === cmd2) continue;
           for (const sample2 of entry2.featureSamples) {
             distances.push(mahalanobisDistance(sample1, sample2));
           }
         }
       }
     }
     
     // 使用同类和异类距离的中点
     const sortedDistances = distances.sort((a, b) => a - b);
     const medianDistance = sortedDistances[Math.floor(sortedDistances.length / 2)];
     
     return 1 / (1 + medianDistance);  // 转换为置信度
   }
   
   // 方案 2：基于 ROC 曲线的最优阈值
   function findOptimalThreshold(featureLibrary): number {
     // 使用 ROC 曲线找最优阈值
     // ...
   }
   ```
2. 将阈值作为可配置参数

**验证方法**：
- [ ] 代码审查：置信度阈值有明确的计算方法
- [ ] 创建测试用例：验证阈值基于训练数据统计
- [ ] 真实采集数据测试：采集多个指令，验证阈值的合理性

**修复状态**：❌ 未开始

---

## 七、测试覆盖问题 🟡 （中等优先级）

### 问题 7.1：关键回归用例缺失

**反馈内容**：
- 已知的三个历史 bug：裁剪索引反序、全部数据判异常、单条删除失败
- 问题：测试报告中没有对应的**回归测试用例**
- 当前状态：**缺失关键用例**

**修复方案**：
1. 创建 `regression-tests.test.ts` 文件
   ```typescript
   describe('Regression Tests - Known Bugs', () => {
     // Bug 1: 裁剪索引反序
     test('should not return reversed indices (startIdx > endIdx)', () => {
       // 使用已知会触发 bug 的输入
       const result = performSimpleCropping(problematicWaveform);
       expect(result.startIdx).toBeLessThan(result.endIdx);
       expect(result.length).toBeGreaterThan(0);
     });
     
     // Bug 2: 全部数据判异常
     test('should not mark all data as anomalies when all have low scores', () => {
       const lowScoreData = generateLowScoreWaveforms(5);
       const anomalies = detectAnomaliesWithIQR(lowScoreData);
       expect(anomalies.length).toBeLessThan(lowScoreData.length);
     });
     
     // Bug 3: 单条删除失败
     test('should delete correct item by UUID even after prior deletions', () => {
       const items = [
         { id: 'id1', data: 'data1' },
         { id: 'id2', data: 'data2' },
         { id: 'id3', data: 'data3' }
       ];
       // 删除第 1 项
       deleteById(items, 'id2');
       expect(items.length).toBe(2);
       // 再删除原来的第 3 项，用 UUID 而非 index
       deleteById(items, 'id3');
       expect(items.length).toBe(1);
       expect(items[0].id).toBe('id1');
     });
   });
   ```
2. 运行回归测试，确保所有已知 bug 都被修复

**验证方法**：
- [ ] 创建 `regression-tests.test.ts` 文件
- [ ] 运行测试，所有回归测试通过
- [ ] 确保回归测试覆盖三个已知 bug

**修复状态**：❌ 未开始

---

### 问题 7.2：测试数据全为 mock，没有真实 EMG 信号

**反馈内容**：
- 当前：所有测试使用 `generateMockWaveform()` 或 `generateNormalWaveform()`
- 问题：真实 EMG 信号有突发性、非平稳性、通道间相关性，mock 数据掩盖边界情况
- 当前状态：**测试数据不真实**

**修复方案**：
1. 收集真实 EMG 采集数据样本（至少 3-5 条）
2. 创建 `real-emg-data.test.ts` 文件
   ```typescript
   describe('Real EMG Signal Tests', () => {
     const realEMGSamples = [
       // 从真实采集导出的数据
       { ch1: [...], ch2: [...], ch3: [...], label: 'strong_signal' },
       { ch1: [...], ch2: [...], ch3: [...], label: 'weak_signal' },
       { ch1: [...], ch2: [...], ch3: [...], label: 'noisy_signal' },
       // ...
     ];
     
     test('should correctly crop strong real EMG signal', () => {
       const result = performSimpleCropping(realEMGSamples[0]);
       expect(result.startIdx).toBeGreaterThanOrEqual(0);
       expect(result.endIdx).toBeLessThanOrEqual(realEMGSamples[0].ch1.length);
       expect(result.confidence).toBeGreaterThan(0.7);
     });
     
     test('should handle weak real EMG signal without returning -1', () => {
       const result = performSimpleCropping(realEMGSamples[1]);
       expect(result.startIdx).toBeGreaterThanOrEqual(0);
       expect(result.startIdx).toBeLessThan(result.endIdx);
     });
   });
   ```
3. 运行真实数据测试

**验证方法**：
- [ ] 收集至少 5 条真实 EMG 采集数据
- [ ] 创建 `real-emg-data.test.ts` 文件
- [ ] 运行测试，所有真实数据测试通过

**修复状态**：❌ 未开始

---

### 问题 7.3：100% 通过率与已知 Bug 共存是警示信号

**反馈内容**：
- 当前：声称 401 个测试全部通过
- 问题：但系统原有的三个核心 bug 仍存在（上轮评审确认）
- 当前状态：**测试覆盖不足**

**修复方案**：
1. 修复三个已知 bug（见上文）
2. 创建对应的回归测试
3. 重新运行所有测试
4. 生成新的测试覆盖报告

**验证方法**：
- [ ] 修复三个已知 bug
- [ ] 创建回归测试
- [ ] 运行所有测试，确保通过
- [ ] 生成新的测试覆盖报告，说明修复的 bug 和对应的测试

**修复状态**：❌ 未开始

---

### 问题 7.4：`delete-operations-v2.test.ts` 的单条删除测试可信度存疑

**反馈内容**：
- 当前：测试可能只验证了"条数减少"，没有验证"删除错位"问题
- 问题：无法捕获"已有条目被删除后，后续条目的 index 错位"
- 当前状态：**测试不完整**

**修复方案**：
1. 改进 `delete-operations-v2.test.ts` 中的删除测试
   ```typescript
   test('should delete correct item by UUID even after prior deletions', () => {
     // 创建 5 条数据
     const items = [
       { id: 'id1', value: 1 },
       { id: 'id2', value: 2 },
       { id: 'id3', value: 3 },
       { id: 'id4', value: 4 },
       { id: 'id5', value: 5 }
     ];
     
     // 删除第 2 条
     deleteById(items, 'id2');
     expect(items.length).toBe(4);
     expect(items.map(i => i.id)).toEqual(['id1', 'id3', 'id4', 'id5']);
     
     // 删除原来的第 4 条（现在是第 3 条）
     deleteById(items, 'id4');
     expect(items.length).toBe(3);
     expect(items.map(i => i.id)).toEqual(['id1', 'id3', 'id5']);
     
     // 验证原来的第 5 条仍在
     expect(items.find(i => i.id === 'id5')).toBeDefined();
   });
   ```
2. 运行改进后的测试

**验证方法**：
- [ ] 改进 `delete-operations-v2.test.ts` 中的删除测试
- [ ] 运行测试，确保通过
- [ ] 验证测试能捕获"删除错位"问题

**修复状态**：❌ 未开始

---

## 八、修复优先级和执行计划

### 🔴 最高优先级（直接影响系统能否正常工作）

| # | 问题 | 预计工作量 | 状态 |
|---|------|---------|------|
| 1 | 将裁剪阈值改为双端静息估计法 | 2h | ❌ |
| 2 | 将每条波形改为独立裁剪 | 3h | ❌ |
| 3 | 将异常检测改为 IQR 方法 | 2h | ❌ |
| 4 | 异常检测改为保存时触发 | 1h | ❌ |
| 5 | 测试阶段删除异常检测逻辑 | 1h | ❌ |
| 6 | 将 deleteCollection 改为 UUID | 2h | ❌ |

**小计**：11 小时

### 🟡 高优先级（影响系统可靠性和准确性）

| # | 问题 | 预计工作量 | 状态 |
|---|------|---------|------|
| 7 | 修复 fallback isQualityAcceptable | 1h | ❌ |
| 8 | 修复 startIdx/endIdx 反序 | 1h | ❌ |
| 9 | 实现 inferStage() 函数 | 1h | ❌ |
| 10 | 实现四维加权评分 | 1h | ❌ |
| 11 | 改进 MAL 阈值 | 1h | ❌ |
| 12 | 统一 ZCR 公式 | 0.5h | ❌ |
| 13 | 改进马氏距离实现 | 1h | ❌ |
| 14 | 改进特征库存储为 KNN | 2h | ❌ |
| 15 | 改进置信度阈值计算 | 1h | ❌ |

**小计**：9.5 小时

### 🟢 中等优先级（改进测试覆盖和文档）

| # | 问题 | 预计工作量 | 状态 |
|---|------|---------|------|
| 16 | 创建回归测试 | 2h | ❌ |
| 17 | 添加真实 EMG 数据测试 | 2h | ❌ |
| 18 | 改进删除操作测试 | 1h | ❌ |
| 19 | 修复频域特征维度文档 | 1h | ❌ |
| 20 | 添加 UI 层状态展示代码 | 1h | ❌ |

**小计**：7 小时

---

## 执行步骤

### 第 1 阶段：修复最高优先级问题（11 小时）

1. **修改裁剪阈值算法**
   - [ ] 实现 `estimateRestingBaseline()` 函数
   - [ ] 修改 `performSimpleCropping()` 使用新阈值
   - [ ] 修改 `batchSimpleCroppingCompat()` 同步应用
   - [ ] 运行测试验证

2. **实现独立裁剪**
   - [ ] 修改 `batchSimpleCroppingCompat()` 返回值结构
   - [ ] 修改调用处理逻辑
   - [ ] 运行测试验证

3. **重构异常检测算法**
   - [ ] 实现 `detectAnomaliesWithIQR()` 函数
   - [ ] 修改 `detectAnomalies()` 调用新函数
   - [ ] 运行测试验证

4. **修改异常检测触发时机**
   - [ ] 移除 `handleStopCollection()` 中的异常检测
   - [ ] 在 `handleSaveCommand()` 中添加异常检测
   - [ ] 运行测试验证

5. **删除测试阶段异常检测**
   - [ ] 修改 `performTestCropping()` 移除异常检测
   - [ ] 改为裁剪失败时使用全段
   - [ ] 运行测试验证

6. **改为 UUID 删除**
   - [ ] 在 `CollectionData` 接口中添加 `id` 字段
   - [ ] 修改 `deleteCollection()` 接口
   - [ ] 修改数据库删除逻辑
   - [ ] 运行测试验证

### 第 2 阶段：修复高优先级问题（9.5 小时）

7-15. 按优先级逐个修复

### 第 3 阶段：改进测试覆盖（7 小时）

16-20. 创建回归测试、真实数据测试、改进文档

---

## 验证检查清单

在提交修复前，必须验证：

- [ ] 所有修复都有对应的代码变更（不是虚假修复）
- [ ] 所有修复都有对应的测试用例（不是虚报通过）
- [ ] 所有测试都真实运行通过（不是模拟）
- [ ] 所有修复都在代码中有明确注释说明
- [ ] 所有修复都更新了相关文档
- [ ] 没有遗漏任何反馈建议

---

**最后更新**：2026-05-22  
**状态**：待执行  
**下一步**：开始第 1 阶段修复

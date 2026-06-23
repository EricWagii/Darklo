# Claude 代码评审反馈

**评审时间**: 2026-05-19  
**评审工具**: Claude AI  
**反馈类别**: 严重 Bug、高风险、中风险、工程质量

---

## 🔴 严重 Bug - 代码中硬认存在

### 1. 硬编码密码泄露 (contexts/AuthContext.tsx:32 | lib/user-auth.ts:1903)

**问题**: 明文密码硬编码在源代码中

**位置**:
- AuthContext.tsx 第 32 行: `const CORRECT_PASSWORD = 'geniusatwork'`
- user-auth.ts 第 1903 行: `const ADMIN_PASSWORD = 'geniusatwork'`

**风险**: 任何人拿到源代码（包括未来的 GitHub 推送）都能直接登录管理员账户，获取所有用户采集数据

**修复方案**:
1. 从代码中删除所有硬编码密码
2. 使用环境变量 `import.meta.env.VITE_ADMIN_PASSWORD` 替代
3. 将该变量加入 .gitignore
4. **长期方案**: Admin 首次启动时强制重置密码

---

### 2. FFT 实现性能问题 (lib/advanced-feature-extraction.ts:1619-1644)

**问题**: FFT 实现为 O(n²) 补素 DFT，实时运行会卡死 UI

**详细分析**:
- `extractFrequencyDomainFeatures()` 中使用双重循环手写 DFT
- 外层遍历 n/2 个频率点，内层遍历 n 个样本
- 复杂度 O(n²)，但同文件 frequency-domain-features-v2.ts 里已经使用了 fft.js 库（O(n log n)）
- 这个旧实现仍被调用，每帧耗时超过 200ms，导致主线程卡顿

**修复方案**:
1. 删除 advanced-feature-extraction.ts 中与的 DFT 实现
2. 统一改为调用 frequency-domain-features-v2.ts 中的 extractFrequencyDomainFeaturesV2()
3. 该函数已使用 fft.js 库，性能无问题

---

### 3. Mahalanobis 距离实现错误 (lib/advanced-feature-extraction.ts:1822-1856)

**问题**: 协方差矩阵传入时计算的是逆距阵乘法，但直接用原矩阵相乘

**详细分析**:
- Mahalanobis 距离公式为 `sqrt(d^T · Σ^-1 · d)`，需要协方差矩阵的逆
- 代码中当 covarianceMatrix 存时，直接用 `diff[i] * diff[j] * covarianceMatrix[i][j]` 相乘
- 这是用原矩阵而非逆矩阵，计算结果在数学上是错误的
- 无协方差矩阵时退化为普通欧氏距离（但样声称是 Mahalanobis）
- 这套基于此距离的识别结果完全失去去可靠性

**修复方案**:
1. 如无法实现距阵求逆，直接使用欧氏距离或余弦相似度
2. 若要保留 Mahalanobis，需先实现矩阵求逆（LU 分解或 math.js 的 inv()）
3. 然后用逆矩阵做乘法

---

## 🟡 高风险 - 逻辑缺陷与数据一致性

### 1. IndexedDB 声称使用但实际全用 localStorage (lib/data-storage-service.ts:4473-4483)

**问题**:
- DataStorageService 声称用 IndexedDB，实际全部用 localStorage
- 类注释写「优先使用 IndexedDB（无容量限制）」，但 initialize() 函数第一行就是 `this.useIndexedDB = false`
- 所有读写都调用 `saveToLocalStorage()`
- localStorage 限额 5-10MB，单次采集波形数据（3 通道 × 500 点 × 多次采集）很快就会触发 QuotaExceededError
- 且该错误被 catch 吞掉只打日志，用户毫无感知，数据静默丢失

**修复方案**:
1. 真正初始化 IndexedDB（db.ts 里的 EMGDatabase 已经实现好了）
2. 删除 DataStorageService 这个半成品包装类
3. 统一使用 emgDatabase 单例
4. 短期内至少要在 localStorage 写入失败时向用户明确报错，不能静默丢弃

---

### 2. 采集停止后数据不保存 (hooks/useEMGCollection.ts:490-513)

**问题**: isCollecting 读取闭包里旧值

**详细分析**:
- addData 中 `if (!isCollecting) return` 读取的是 useCallback 闭包捕获的旧值
- 当采集时长到期时，setIsCollecting(false) 是异步 setState，下一帧采集数据可能因闭包里 isCollecting 仍为 true 而继续被写入
- 或者相反，因为并发 state 更新时序问题，导致数据丢失
- 此外 addData 的依赖数组含 isCollecting，每次状态变化都重创建回调，硬件数据流注册的是旧回调，造成数据断层

**修复方案**:
1. 用 useRef 替代 state 标志控制采集状态：`isCollectingRef.current` 同步写，避免闭包陷阱
2. addData 的依赖数组改为 `[isCollectingRef]`，通过 ref 控制行为

---

### 3. 频域特征提取：采样单点功率，而非频带平均 (lib/frequency-domain-features-v2.ts:8079-8086)

**问题**: 采样单点功率，而非频带平均，对噪声极度敏感

**详细分析**:
- 26 维频域特征通过 `const idx = Math.floor(freq / freqResolution); features.push(power[idx])` 实现
- 即直接取单个频率 bin 的功率值
- EMG 信号功率在频域并非精确落在整数频率点，单点采样受噪声淹没影响巨大
- 同一用户重复采集同一指令，该特征值可能变化 50% 以上，严重损害识别稳定性

**修复方案**:
1. 对 [freq-5, freq+5] Hz 范围内所有 bin 求和（或均值）
2. 替代单点采样，这是标准做法，显著提升鲁棒性

---

### 4. 审计日志存在 10000 条上限 + 每次写入全量序列化 (lib/audit-log.ts:1980-2023)

**问题**: 性能和可靠性均差

**详细分析**:
- logAuditEvent 每次调用都执行：getALLAuditLogs()（读取并 JSON.parse 全量数据）→ push → JSON.stringify 全量序列化 → localStorage.setItem
- 当日志达到 10000 条时，单次写入的序列化数据超过 5MB，阻塞主线程数百毫秒，且审计日志放 localStorage 而主数据放 IndexedDB，数据分裂

**修复方案**:
1. 将审计日志迁移到 IndexedDB 的独立 object store
2. 利用其原生追加入能力，或将上限从 10000 降至 500，避免性能问题

---

## 🟠 中风险 - 工程质量与可维护性

### 1. 全局 - 组件样式

**问题**: CSS-in-JS inline style 与 Tailwind 严重混用，维护成本高

**详细分析**:
- 业务组件（UserLoginDialog、UserManagement、DebugSerial 等）全部使用 `inline style={{}}` 写死颜色（大量 #1a1a1a、#d4af37、#0a0a0a）
- UI 基础组件（shadcn/ui）用 Tailwind class
- 两套系统并存导致主题统一一不可能实现，暗色模式适配法通过 CSS 变量完成，每次改色需要全局搜索替换

**修复方案**:
1. 统一到 Tailwind + CSS 变量
2. 将 #d4af37 等品牌色提取到 tailwind.config.js 的 theme.extend.colors
3. 业务组件改用 className 替代 inline style

---

### 2. 特征归一化在特征提取内部完成，识别时无法使用训练样本的统计量 (lib/advanced-feature-extraction.ts:1790-1817)

**问题**: 归一化在特征提取内部完成，识别时无法使用训练样本的统计量

**详细分析**:
- normalizeFeatureVector 使用当前向量自身的均值和方差做 z-score 归一化（在线归一化）
- 正确做法是用训练样本的全局 mean 和 std，持久化到 IndexedDB 随模型一起存储
- 识别时用保存的统计量归一化，不要用当前样本的自身统计量
- 当前实现导致每个样本独立归一化，训练和识别时的特征分布不一致，模型无法学到正确的判别边界

**修复方案**:
1. 在模型训练时计算并保存训练集的全局 mean 和 std
2. 持久化到 IndexedDB 随模型一起存储
3. 识别时用保存的统计量归一化，不要用当前样本的自身统计量

---

### 3. getRecognitionStatistics 的 successRate 永远返回 100% (lib/template-based-recognition.ts:11840-11870)

**问题**: getRecognitionStatistics 的 successRate 永远返回 100%

**详细分析**:
- 函数接收 RecognitionResult[] 参数，但该数组的元素都已经是识别成功的结果（recognizeMultipleSignals 中已经 filter 掉了 null）
- 所以 successCount = results.length，successRate = 100 永远为 true
- 这个统计函数在语义上是错误的，返回的准确率没有任何参考价值

**修复方案**:
1. 统计函数应接收包含失败结果（null）的原始数组，或由调用方传入总测试次数
2. 才能计算真实 successRate

---

### 4. exportToExcel 导出的是 CSV 内容但文件扩展名是 .xlsx (lib/data-export.ts:4239-4272)

**问题**: 导出的是 CSV 内容但文件扩展名是 .xlsx

**详细分析**:
- 导出功能说「使用 CSV 作为中间格式」，但 MIME type 设为 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- 文件名后缀 .xlsx
- 真正的 xlsx 是 ZIP 格式包含 XML，而这个函数生成的是纯 CSV 文本
- 某些系统和工具会因格式不匹配拒绝打开或报错，同时也是对用户的误导

**修复方案**:
1. 要么改文件名为 .csv，MIME type 为 text/csv
2. 要么引入 SheetJS (xlsx) 库生成真正的 xlsx 文件

---

### 5. Settings 页显示采样率 250Hz，但其他模块的是 500Hz，数值不一致 (pages/Settings.tsx:30356-30358)

**问题**: Settings 页显示采样率 250Hz，但其他模块的是 500Hz，数值不一致

**详细分析**:
- Settings 页系统信息区域硬编码采样率：250 Hz
- 但 frequency-domain-features-v2.ts 歌认参数是 500Hz
- fixed-length-cropping.ts 注释说「对应 500Hz 采样率下的 1.024 秒」
- 采样率不一致会导致频域特征的频率轴计算错误，影响所有频域特征的物理意义

**修复方案**:
1. 从 shared/const.ts 的 HARDWARE_CONFIG.SAMPLE_RATE 统一读取，而不在各硬编码
2. 先确认硬件实际采样率，然后全局只改一个常量

---

## 📊 评审总结

| 类别 | 数量 | 严重程度 |
|------|------|---------|
| 严重 Bug | 3 | 🔴 立即修复 |
| 高风险 | 4 | 🟡 本周修复 |
| 中风险 | 5 | 🟠 下周修复 |
| **总计** | **12** | - |

---

## 🎯 修复优先级

### 第一阶段（立即）
1. ✅ 移除硬编码密码，改用环境变量
2. ✅ 修复 FFT 实现，统一使用 fft.js
3. ✅ 修复 Mahalanobis 距离计算

### 第二阶段（本周）
4. ✅ 真正实现 IndexedDB 数据存储
5. ✅ 修复采集停止后数据不保存问题
6. ✅ 改进频域特征采样方式
7. ✅ 迁移审计日志到 IndexedDB

### 第三阶段（下周）
8. ⚠️ 统一样式系统（CSS-in-JS → Tailwind）
9. ⚠️ 修复特征归一化逻辑
10. ⚠️ 修复 successRate 统计
11. ⚠️ 修复 CSV/XLSX 导出格式
12. ⚠️ 统一采样率常量

---

**评审完成**: 2026-05-19  
**评审工具**: Claude AI  
**建议**: 按优先级依次修复，第一阶段完成后可重新部署

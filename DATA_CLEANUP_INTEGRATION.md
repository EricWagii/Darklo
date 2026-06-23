# 数据清除集成指南

## 概述

新增了 `data-wipe.ts` 模块，用于彻底清除所有 IndexedDB 历史数据。

**核心原则**：
- ✅ 只清除 IndexedDB，不涉及 localStorage/sessionStorage
- ✅ UI 删除后自动调用，不需要二次确认
- ✅ 确保数据完全清除，避免历史脏数据污染

## 模块位置

`client/src/lib/data-wipe.ts`

## 导出的函数

### 1. `getIndexedDBStatistics()`

获取当前 IndexedDB 数据统计

```typescript
const stats = await getIndexedDBStatistics();
// 返回：
// {
//   commandCount: 5,
//   collectionCount: 45,
//   recognitionRecordCount: 120,
//   calibrationDataExists: true
// }
```

### 2. `wipeAllIndexedDBData()`

彻底清除所有 IndexedDB 数据

```typescript
const report = await wipeAllIndexedDBData();
// 返回详细的清除报告
```

**返回格式**：
```typescript
{
  timestamp: "2026-06-02T10:50:00.000Z",
  commandsDeleted: 5,
  collectionsDeleted: 45,
  recognitionRecordsDeleted: 120,
  calibrationDataDeleted: 1,
  indexedDBCleared: true,
  success: true,
  details: [
    "✅ 已删除 5 个指令，45 条采集",
    "✅ 已删除 120 条识别记录",
    "✅ 已清除校准数据",
    "✅ IndexedDB 已完全清空",
    "\n✅ 数据清除成功 - IndexedDB 已完全清空"
  ]
}
```

### 3. `verifyIndexedDBWiped()`

验证 IndexedDB 是否已完全清除

```typescript
const result = await verifyIndexedDBWiped();
// 返回：
// {
//   isClean: true,
//   remainingData: {
//     commands: 0,
//     recognitionRecords: 0,
//     calibrationDataExists: false
//   }
// }
```

### 4. `autoCleanupAfterDelete()`

自动清除 - 在删除操作后自动调用

```typescript
await autoCleanupAfterDelete();
// 检测脏数据并自动清除
```

## 集成位置

### DataManagement.tsx

在删除指令、采集或识别记录后调用：

```typescript
import { autoCleanupAfterDelete } from '@/lib/data-wipe';

// 删除指令后
await emgDatabase.deleteCommand(commandName);
await autoCleanupAfterDelete(); // 自动清除脏数据

// 删除采集后
await emgDatabase.deleteCollection(commandName, collectionId);
await autoCleanupAfterDelete(); // 自动清除脏数据

// 删除识别记录后
await emgDatabase.deleteRecognitionRecord(recordId);
await autoCleanupAfterDelete(); // 自动清除脏数据
```

### RecognitionMode.tsx

在删除识别记录后调用：

```typescript
import { autoCleanupAfterDelete } from '@/lib/data-wipe';

// 删除识别记录后
await emgDatabase.deleteRecognitionRecord(recordId);
await autoCleanupAfterDelete(); // 自动清除脏数据
```

## 使用场景

### 场景1：用户删除指令

1. 用户点击"删除"按钮
2. 系统调用 `deleteCommand()`
3. **自动调用** `autoCleanupAfterDelete()`
4. 检测并清除任何残留数据
5. UI 更新，显示删除成功

### 场景2：用户删除采集

1. 用户点击"删除采集"按钮
2. 系统调用 `deleteCollection()`
3. **自动调用** `autoCleanupAfterDelete()`
4. 检测并清除任何残留数据
5. UI 更新，显示删除成功

### 场景3：用户删除识别记录

1. 用户点击"删除"按钮
2. 系统调用 `deleteRecognitionRecord()`
3. **自动调用** `autoCleanupAfterDelete()`
4. 检测并清除任何残留数据
5. UI 更新，显示删除成功

## 数据清除流程

```
删除操作 (deleteCommand/deleteCollection/deleteRecognitionRecord)
    ↓
自动调用 autoCleanupAfterDelete()
    ↓
检测脏数据
    ├─ 识别记录存在但指令为空？→ 自动清除
    ├─ 校准数据存在但指令为空？→ 自动清除
    └─ 否则 → 完成
    ↓
验证 IndexedDB 是否为空
    ├─ 是 → 清除成功
    └─ 否 → 记录警告
    ↓
完成
```

## 测试验证

### 测试1：删除指令后验证

```typescript
// 创建指令
await emgDatabase.saveCommand('test', { name: 'test', collections: [...] });

// 删除指令
await emgDatabase.deleteCommand('test');
await autoCleanupAfterDelete();

// 验证
const result = await verifyIndexedDBWiped();
console.assert(result.isClean, '数据应该完全清除');
```

### 测试2：检测脏数据

```typescript
// 模拟脏数据：识别记录存在但指令为空
await emgDatabase.saveRecognitionRecord({ ... });
await emgDatabase.deleteCommand('test');

// 自动清除应该检测并清除脏数据
await autoCleanupAfterDelete();

// 验证
const result = await verifyIndexedDBWiped();
console.assert(result.isClean, '脏数据应该被自动清除');
```

## 关键特性

### 1. 自动化
- 不需要用户手动操作
- 删除后自动清除脏数据
- 无需二次确认

### 2. 完整性
- 清除所有 commands
- 清除所有 recognitionRecords
- 清除所有 calibrationData
- 验证 IndexedDB 完全清空

### 3. 安全性
- 详细的清除报告
- 验证机制确保清除成功
- 自动检测脏数据

### 4. 隔离性
- 只操作 IndexedDB
- 不涉及 localStorage/sessionStorage
- 不改动其他系统

## 故障排除

### 问题1：删除后仍有数据残留

**原因**：可能是某个删除操作失败

**解决**：
1. 检查浏览器控制台是否有错误
2. 调用 `verifyIndexedDBWiped()` 检查残留数据
3. 手动调用 `wipeAllIndexedDBData()` 彻底清除

### 问题2：自动清除没有触发

**原因**：可能是 `autoCleanupAfterDelete()` 没有被调用

**解决**：
1. 检查删除操作后是否调用了 `autoCleanupAfterDelete()`
2. 检查浏览器控制台是否有错误
3. 手动调用 `autoCleanupAfterDelete()`

## 最佳实践

1. **始终在删除后调用** `autoCleanupAfterDelete()`
2. **定期验证** 使用 `verifyIndexedDBWiped()`
3. **监控日志** 查看清除报告中的详情
4. **测试脏数据** 确保自动清除机制正常工作

## 相关文件

- `client/src/lib/data-wipe.ts` - 数据清除模块
- `client/src/lib/db.ts` - IndexedDB 操作
- `client/src/pages/DataManagement.tsx` - 数据管理页面
- `client/src/pages/RecognitionMode.tsx` - 识别模式页面

# 浏览器 IndexedDB 验证指南

本文档提供真实浏览器环境下的 IndexedDB 数据验证方法，用于验证 db.ts 的删除和清理逻辑。

## 验证环境

- 浏览器：Chrome/Firefox/Edge（任何支持 IndexedDB 的浏览器）
- 项目 URL：https://3000-i4t40wud79rya2x619xpx-4634769a.us2.manus.computer
- 数据库名：EMGDatabase
- 开发者工具：F12 → Application → IndexedDB

## 验证场景

### 场景 1：deleteCommand - 删除所有同名 commands

**目标**：验证删除指令时，所有同名记录都被删除

**步骤**：

1. 打开浏览器开发者工具（F12）
2. 进入 Application → IndexedDB → EMGDatabase → commands
3. 采集训练页面：
   - 创建指令 "test"
   - 采集 5 次
   - 保存
4. 验证 IndexedDB 中的 commands 记录：
   - 应该有 1 条记录，key = "test"
   - collections 数组包含 5 条采集

5. 数据管理页面：
   - 删除指令 "test"
6. 验证 IndexedDB 中的 commands 记录：
   - 应该没有任何记录（commands store 为空）

**验证代码**（在浏览器控制台执行）：

```javascript
// 打开 IndexedDB 数据库
const request = indexedDB.open('EMGDatabase');
request.onsuccess = (event) => {
  const db = event.target.result;
  
  // 查询 commands store
  const transaction = db.transaction(['commands'], 'readonly');
  const store = transaction.objectStore('commands');
  const getAllRequest = store.getAll();
  
  getAllRequest.onsuccess = () => {
    console.log('Commands:', getAllRequest.result);
    console.log('总数:', getAllRequest.result.length);
  };
};
```

**预期结果**：
- 删除前：1 条记录
- 删除后：0 条记录

---

### 场景 2：deleteCommand 级联删除 - 清除所有相关数据

**目标**：验证删除指令时，所有相关的识别记录、反馈数据、校准数据都被删除

**步骤**：

1. 采集训练页面：
   - 创建指令 "start"
   - 采集 5 次
   - 保存

2. 默念测试页面：
   - 进行 3 次识别
   - 提供反馈（正确/错误）

3. 验证 IndexedDB 中的所有 store：
   - commands：1 条
   - recognitionRecords：3 条（识别记录）
   - feedbackData：3 条（反馈数据）

4. 数据管理页面：
   - 删除指令 "start"

5. 验证 IndexedDB 中的所有 store：
   - commands：0 条
   - recognitionRecords：0 条（应该全部删除）
   - feedbackData：0 条（应该全部删除）
   - calibrationData：0 条（应该全部删除）

**验证代码**（在浏览器控制台执行）：

```javascript
const request = indexedDB.open('EMGDatabase');
request.onsuccess = (event) => {
  const db = event.target.result;
  
  const stores = ['commands', 'recognitionRecords', 'feedbackData', 'calibrationData'];
  
  stores.forEach(storeName => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = () => {
      console.log(`${storeName}:`, getAllRequest.result.length, '条记录');
    };
  });
};
```

**预期结果**：
- 删除前：commands=1, recognitionRecords=3, feedbackData=3, calibrationData=0
- 删除后：commands=0, recognitionRecords=0, feedbackData=0, calibrationData=0

---

### 场景 3：deleteCollection - 删除采集并清理空指令

**目标**：验证删除采集时，如果指令的 collections 为空则删除指令

**步骤**：

1. 采集训练页面：
   - 创建指令 "click"
   - 采集 3 次
   - 保存

2. 验证 IndexedDB：
   - commands store 中有 1 条记录
   - collections 数组包含 3 条采集

3. 数据管理页面：
   - 删除第 1 条采集

4. 验证 IndexedDB：
   - commands store 中仍有 1 条记录
   - collections 数组包含 2 条采集

5. 继续删除第 2、3 条采集

6. 验证 IndexedDB：
   - 删除第 2 条后：collections 包含 1 条采集
   - 删除第 3 条后：commands store 为空（指令被删除）

**验证代码**（在浏览器控制台执行）：

```javascript
const request = indexedDB.open('EMGDatabase');
request.onsuccess = (event) => {
  const db = event.target.result;
  
  const transaction = db.transaction(['commands'], 'readonly');
  const store = transaction.objectStore('commands');
  const getAllRequest = store.getAll();
  
  getAllRequest.onsuccess = () => {
    const commands = getAllRequest.result;
    console.log('Commands:', commands);
    commands.forEach(cmd => {
      console.log(`- ${cmd.name}: ${cmd.collections.length} 条采集`);
      cmd.collections.forEach((col, idx) => {
        console.log(`  ${idx + 1}. ${col.id}`);
      });
    });
  };
};
```

**预期结果**：
- 删除前：1 条指令，3 条采集
- 删除 1 条后：1 条指令，2 条采集
- 删除 2 条后：1 条指令，1 条采集
- 删除 3 条后：0 条指令

---

### 场景 4：getCommand 合并同名旧 key 记录

**目标**：验证 getCommand 即使命中也要检查并合并同名旧 key 记录

**注意**：此场景需要通过直接修改 IndexedDB 来模拟旧数据

**步骤**：

1. 打开浏览器开发者工具
2. 在控制台执行以下代码，模拟旧数据：

```javascript
const request = indexedDB.open('EMGDatabase');
request.onsuccess = (event) => {
  const db = event.target.result;
  
  const transaction = db.transaction(['commands'], 'readwrite');
  const store = transaction.objectStore('commands');
  
  // 保存旧 key 的记录
  store.put({
    key: 'test-old',
    name: 'test',
    collections: [{ id: 'col-old-1', data: [] }],
    createdAt: Date.now(),
  });
  
  // 保存新 key 的记录
  store.put({
    key: 'test',
    name: 'test',
    collections: [{ id: 'col-new-1', data: [] }],
    createdAt: Date.now(),
  });
  
  transaction.oncomplete = () => {
    console.log('模拟旧数据完成');
  };
};
```

3. 采集训练或默念测试页面：
   - 任何操作会触发 getCommand('test')

4. 验证 IndexedDB：
   - 应该只有 1 条记录，key = "test"
   - collections 数组包含 2 条采集（来自旧 key 和新 key）

**验证代码**（在浏览器控制台执行）：

```javascript
const request = indexedDB.open('EMGDatabase');
request.onsuccess = (event) => {
  const db = event.target.result;
  
  const transaction = db.transaction(['commands'], 'readonly');
  const store = transaction.objectStore('commands');
  const getAllRequest = store.getAll();
  
  getAllRequest.onsuccess = () => {
    const commands = getAllRequest.result;
    console.log('合并后的 commands:');
    commands.forEach(cmd => {
      console.log(`- key: ${cmd.key}, name: ${cmd.name}, collections: ${cmd.collections.length}`);
    });
  };
};
```

**预期结果**：
- 合并前：2 条记录（test-old 和 test）
- 合并后：1 条记录（test），collections 包含 2 条采集

---

### 场景 5：同名指令合并

**目标**：验证删除采集时，先合并同名指令

**步骤**：

1. 在浏览器控制台执行以下代码，模拟多个同名指令：

```javascript
const request = indexedDB.open('EMGDatabase');
request.onsuccess = (event) => {
  const db = event.target.result;
  
  const transaction = db.transaction(['commands'], 'readwrite');
  const store = transaction.objectStore('commands');
  
  // 保存第一个 "merge-test" 指令
  store.put({
    key: 'merge-test-1',
    name: 'merge-test',
    collections: [{ id: 'col-1', data: [] }],
    createdAt: Date.now(),
  });
  
  // 保存第二个 "merge-test" 指令
  store.put({
    key: 'merge-test-2',
    name: 'merge-test',
    collections: [{ id: 'col-2', data: [] }],
    createdAt: Date.now(),
  });
  
  transaction.oncomplete = () => {
    console.log('模拟多个同名指令完成');
  };
};
```

2. 数据管理页面：
   - 删除一条采集（col-1 或 col-2）

3. 验证 IndexedDB：
   - 应该只有 1 条记录，key = "merge-test"
   - collections 数组包含 1 条采集

**验证代码**（在浏览器控制台执行）：

```javascript
const request = indexedDB.open('EMGDatabase');
request.onsuccess = (event) => {
  const db = event.target.result;
  
  const transaction = db.transaction(['commands'], 'readonly');
  const store = transaction.objectStore('commands');
  const getAllRequest = store.getAll();
  
  getAllRequest.onsuccess = () => {
    const commands = getAllRequest.result;
    console.log('合并后的 commands:');
    console.log(`总数: ${commands.length}`);
    commands.forEach(cmd => {
      console.log(`- ${cmd.name}: ${cmd.collections.length} 条采集`);
    });
  };
};
```

**预期结果**：
- 合并前：2 条记录
- 合并后：1 条记录，1 条采集

---

## 快速验证清单

| 场景 | 验证点 | 预期结果 |
|------|-------|--------|
| deleteCommand | 删除所有同名 commands | commands store 为空 |
| deleteCommand 级联 | 删除相关数据 | recognitionRecords/feedbackData 为空 |
| deleteCollection | 删除采集后清理空指令 | 指令被删除 |
| getCommand 合并 | 合并同名旧 key 记录 | 只有 1 条规范化记录 |
| 同名指令合并 | 删除采集时合并同名指令 | 只有 1 条记录 |

---

## 故障排查

### 问题 1：IndexedDB 中仍有旧数据

**原因**：删除操作未完全执行

**解决**：
1. 刷新页面，重新加载应用
2. 检查浏览器控制台是否有错误
3. 检查 db.ts 中的删除逻辑是否正确

### 问题 2：指令未被删除

**原因**：collections 不为空

**解决**：
1. 确认所有采集都已删除
2. 检查 deleteCollection 逻辑是否正确

### 问题 3：同名记录未被合并

**原因**：getCommand 未被调用

**解决**：
1. 在采集训练或默念测试页面进行操作
2. 检查浏览器控制台是否有合并日志

---

## 导出 IndexedDB 数据

在浏览器控制台执行以下代码，导出所有 IndexedDB 数据为 JSON：

```javascript
const request = indexedDB.open('EMGDatabase');
request.onsuccess = (event) => {
  const db = event.target.result;
  const stores = ['commands', 'recognitionRecords', 'feedbackData', 'calibrationData'];
  const result = {};
  
  let completed = 0;
  
  stores.forEach(storeName => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const getAllRequest = store.getAll();
    
    getAllRequest.onsuccess = () => {
      result[storeName] = getAllRequest.result;
      completed++;
      
      if (completed === stores.length) {
        console.log(JSON.stringify(result, null, 2));
        // 复制到剪贴板
        copy(JSON.stringify(result, null, 2));
        console.log('数据已复制到剪贴板');
      }
    };
  });
};
```

---

## 参考资源

- [MDN - IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Chrome DevTools - IndexedDB](https://developer.chrome.com/docs/devtools/storage/indexeddb/)
- [Firefox Developer Tools - Storage](https://developer.mozilla.org/en-US/docs/Tools/Storage_Inspector)

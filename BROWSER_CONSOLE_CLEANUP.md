# 浏览器控制台 IndexedDB 清除脚本

## 使用场景

如果您需要**立即彻底清除所有 IndexedDB 历史数据**，可以在浏览器控制台运行以下脚本。

## 使用步骤

1. **打开浏览器开发者工具**
   - Chrome/Edge/Firefox：按 `F12` 或 `Ctrl+Shift+I`
   - Safari：`Cmd+Option+I`

2. **切换到 Console 标签**

3. **复制并粘贴以下脚本**

4. **按 Enter 执行**

5. **等待完成**（通常 1-2 秒）

6. **刷新页面**

## 脚本

```javascript
// ============================================================
// IndexedDB 完整清除脚本
// 用于彻底清除所有历史数据
// ============================================================

(async function() {
  console.log('🗑️ 开始清除 IndexedDB 数据...');
  
  try {
    // 1. 获取所有数据库名称
    const dbs = await indexedDB.databases();
    console.log(`📊 检测到 ${dbs.length} 个数据库`);
    
    // 2. 删除所有数据库
    for (const db of dbs) {
      console.log(`🗑️ 删除数据库: ${db.name}`);
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = () => {
          console.log(`✅ 已删除: ${db.name}`);
          resolve();
        };
        req.onerror = () => {
          console.error(`❌ 删除失败: ${db.name}`);
          reject(req.error);
        };
      });
    }
    
    // 3. 验证
    const remaining = await indexedDB.databases();
    console.log(`\n✅ 清除完成！`);
    console.log(`📊 剩余数据库数: ${remaining.length}`);
    
    if (remaining.length === 0) {
      console.log('✅ IndexedDB 已完全清空');
      console.log('\n💡 提示：请刷新页面开始新的测试');
    } else {
      console.warn('⚠️ 仍有数据库未删除，请重试');
    }
    
  } catch (error) {
    console.error('❌ 清除失败:', error);
  }
})();
```

## 验证清除结果

清除完成后，可以运行以下脚本验证：

```javascript
// 验证 IndexedDB 是否已清空
(async function() {
  const dbs = await indexedDB.databases();
  console.log(`📊 当前数据库数: ${dbs.length}`);
  
  if (dbs.length === 0) {
    console.log('✅ IndexedDB 已完全清空');
  } else {
    console.log('❌ 仍有数据库：');
    dbs.forEach(db => console.log(`  - ${db.name}`));
  }
})();
```

## 注意事项

1. **不可恢复** - 清除后数据无法恢复，请确认后再执行
2. **需要刷新** - 清除后必须刷新页面才能生效
3. **完全清除** - 脚本会删除所有 IndexedDB 数据库，包括其他网站的数据
4. **浏览器兼容** - 支持 Chrome、Firefox、Edge、Safari 等现代浏览器

## 清除后的操作

1. **刷新页面**
   ```
   Ctrl+R（Windows）或 Cmd+R（Mac）
   ```

2. **开始新的测试**
   - 选择 4 个指令
   - 每个指令采集 8-10 条样本
   - 每个指令测试 5 次

3. **导出诊断数据**
   - 完成测试后点击"📊 导出诊断数据"
   - 获得完整的诊断报告

## 故障排除

### 问题1：脚本执行失败

**原因**：可能是浏览器安全限制

**解决**：
1. 确保在正确的网站上运行脚本
2. 检查浏览器控制台是否有错误信息
3. 尝试关闭浏览器后重新打开

### 问题2：清除后仍有数据

**原因**：可能是某个数据库删除失败

**解决**：
1. 运行验证脚本检查剩余数据库
2. 手动删除剩余数据库：
   ```javascript
   indexedDB.deleteDatabase('database-name');
   ```
3. 刷新页面后重试

### 问题3：页面无法正常加载

**原因**：可能是清除过程中发生错误

**解决**：
1. 强制刷新：`Ctrl+Shift+R`（Windows）或 `Cmd+Shift+R`（Mac）
2. 清除浏览器缓存
3. 重新打开浏览器

## 自动清除选项

如果您不想手动运行脚本，可以在应用中使用以下方法：

### 方法1：使用数据管理页面
- 打开"数据管理"页面
- 点击"清除所有数据"按钮（如果可用）
- 确认后自动清除

### 方法2：使用诊断导出
- 在"默念测试"页面完成测试
- 点击"📊 导出诊断数据"
- 诊断报告会自动检测脏数据

### 方法3：使用代码
```typescript
import { wipeAllIndexedDBData } from '@/lib/data-wipe';

// 清除所有数据
const report = await wipeAllIndexedDBData();
console.log(report);
```

## 最佳实践

1. **定期清除** - 每次开始新的测试前清除一次
2. **验证清除** - 清除后运行验证脚本确认
3. **记录诊断** - 清除前导出诊断数据备份
4. **检查日志** - 查看浏览器控制台的清除日志

## 相关文件

- `client/src/lib/data-wipe.ts` - 清除模块
- `client/src/lib/db.ts` - IndexedDB 操作
- `DATA_CLEANUP_INTEGRATION.md` - 集成指南

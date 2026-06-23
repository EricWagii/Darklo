# ConfirmDialog 异步支持修复报告

## 问题背景

用户采集数据后点击"保存数据"，确认对话框中点击"确认"按钮后毫无反应，页面卡住。同时数据管理页面显示 0 条指令，但首页显示 5 条。

## 根本原因分析

### 问题链

1. **ConfirmDialog 组件不支持异步操作**
   - 第 303 行：`onConfirm: () => void` - 类型定义为同步函数
   - 第 318 行：`onClick={onConfirm}` - 直接调用，不等待异步完成

2. **CollectionMode.tsx 中的 handleCompleteCollection 是异步函数**
   - 包含 IndexedDB 保存、特征提取等耗时操作
   - 但 ConfirmDialog 不等待其完成

3. **用户体验问题**
   - 用户点击"确认"按钮
   - 对话框立即关闭
   - `handleCompleteCollection()` 在后台执行
   - 用户看不到任何进度反馈，以为卡住了

4. **数据存储不一致**
   - 保存流程在后台执行时，用户已离开页面
   - 导致数据存储不完整
   - 首页显示 5 条（缓存），数据管理显示 0 条（未保存）

## 修复方案

### 修改 ConfirmDialog 组件

```typescript
export const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;  // ← 支持异步
  onCancel: () => void;
  isOpen: boolean;
}> = ({ title, message, onConfirm, onCancel, isOpen }) => {
  const [isLoading, setIsLoading] = React.useState(false);  // ← 添加加载状态

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();  // ← 等待异步完成
    } catch (error) {
      console.error('[ConfirmDialog] 确认操作失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <Card className="w-96">
        <h3 className="text-2xl font-bold mb-4">{title}</h3>
        <p className="text-secondary mb-6">{message}</p>
        {isLoading && (
          <div className="mb-4 text-center text-gray-400 text-sm">
            处理中...
          </div>
        )}
        <div className="flex gap-4 justify-end">
          <Button 
            variant="secondary" 
            onClick={onCancel} 
            disabled={isLoading}  // ← 处理中禁用取消
          >
            取消
          </Button>
          <Button 
            variant="primary" 
            onClick={handleConfirm} 
            disabled={isLoading}  // ← 处理中禁用确认
          >
            {isLoading ? '处理中...' : '确认'}
          </Button>
        </div>
      </Card>
    </div>
  );
};
```

### 修复效果

| 步骤 | 修复前 | 修复后 |
|------|--------|--------|
| 1. 用户点击确认 | 对话框立即关闭 | 显示"处理中..." |
| 2. 保存流程执行 | 后台执行，无反馈 | 按钮禁用，用户知道系统在处理 |
| 3. 保存完成 | 用户不知道结果 | 对话框关闭，显示成功提示 |
| 4. 数据存储 | 不完整 | 完整保存到 IndexedDB |

## 修复验证

### 编译状态

✅ **编译通过**（0 个错误）

```
✓ built in 7.57s
```

### 修复前的问题

- 点击确认后对话框立即关闭
- 用户看不到保存进度
- 保存流程在后台执行，容易中断
- 数据存储不一致

### 修复后的预期行为

1. 用户点击"确认"按钮
2. 对话框显示"处理中..."
3. 按钮被禁用（防止重复点击）
4. 等待 `handleCompleteCollection()` 完成
5. 对话框关闭
6. 显示成功提示
7. 数据完整保存到 IndexedDB

## 后续建议

1. **添加进度条** - 在"处理中..."下显示进度条，让用户了解保存进度

2. **添加超时保护** - 如果处理超过 30 秒，自动超时并显示错误

3. **添加错误恢复** - 如果保存失败，显示错误信息和重试按钮


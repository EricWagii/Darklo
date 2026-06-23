#!/bin/bash

# any 类型修复脚本
# 自动修复常见的 any 类型模式

echo "开始修复 any 类型..."

# 1. 修复 (e as any) 为 (e as Event)
find client/src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/(e as any)/(e as Event)/g'
echo "✓ 修复 (e as any) → (e as Event)"

# 2. 修复 (error: any) 为 (error: unknown)
find client/src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/(error: any)/(error: unknown)/g'
echo "✓ 修复 (error: any) → (error: unknown)"

# 3. 修复 (value: any) 为 (value: unknown)
find client/src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/(value: any)/(value: unknown)/g'
echo "✓ 修复 (value: any) → (value: unknown)"

# 4. 修复 (data: any) 为 (data: unknown)
find client/src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/(data: any)/(data: unknown)/g'
echo "✓ 修复 (data: any) → (data: unknown)"

# 5. 修复 (event: any) 为 (event: Event)
find client/src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/(event: any)/(event: Event)/g'
echo "✓ 修复 (event: any) → (event: Event)"

# 6. 修复 as any 为 as unknown
find client/src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/ as any/ as unknown/g'
echo "✓ 修复 as any → as unknown"

echo "修复完成！"

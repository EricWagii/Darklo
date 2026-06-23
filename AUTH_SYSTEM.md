# 服务器端认证系统文档

## 概述

本项目已升级为完整的服务器端认证系统，支持用户名+密码登录和跨设备同步登录功能。

## 核心功能

### 1. 用户认证

#### 注册新用户
```typescript
const result = await trpc.auth.register.mutate({
  username: 'testuser',
  password: 'password123',
  name: '测试用户'
});
```

#### 用户登录
```typescript
const result = await trpc.auth.login.mutate({
  username: 'testuser',
  password: 'password123'
});
```

#### 验证当前会话
```typescript
const user = await trpc.auth.verify.query();
```

#### 用户登出
```typescript
await trpc.auth.logout.mutate();
```

### 2. 密码安全

- 使用 **PBKDF2** 算法进行密码哈希
- 迭代次数：100,000
- 盐长度：32字节
- 哈希长度：64字节

### 3. 会话管理

- 使用 **JWT** 令牌管理会话
- 会话有效期：7天
- 支持跨设备登录跟踪（sessions表）
- 自动更新最后登录时间

## 数据库架构

### users 表

```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  openId VARCHAR(64) UNIQUE,              -- Manus OAuth ID
  username VARCHAR(64) UNIQUE,             -- 用户名（本地认证）
  passwordHash VARCHAR(255),               -- 密码哈希（PBKDF2）
  name TEXT,                               -- 用户名称
  email VARCHAR(320),                      -- 邮箱
  loginMethod VARCHAR(64),                 -- 登录方式（local/oauth）
  role ENUM('user', 'admin'),              -- 用户角色
  createdAt TIMESTAMP DEFAULT NOW(),       -- 创建时间
  updatedAt TIMESTAMP DEFAULT NOW(),       -- 更新时间
  lastSignedIn TIMESTAMP DEFAULT NOW()     -- 最后登录时间
);
```

### sessions 表

```sql
CREATE TABLE sessions (
  id VARCHAR(255) PRIMARY KEY,             -- 会话ID
  userId INT NOT NULL,                     -- 用户ID
  userAgent TEXT,                          -- 浏览器信息
  ipAddress VARCHAR(45),                   -- IP地址
  deviceName VARCHAR(255),                 -- 设备名称
  lastActivity TIMESTAMP,                  -- 最后活动时间
  createdAt TIMESTAMP DEFAULT NOW(),       -- 创建时间
  expiresAt TIMESTAMP NOT NULL             -- 过期时间
);
```

## 文件结构

```
server/
├── auth-utils.ts              # 认证工具（密码哈希、验证等）
├── auth-utils.test.ts         # 认证工具单元测试
├── db.ts                       # 数据库查询函数
├── routers.ts                  # tRPC认证API端点
└── seed-test-users.mjs        # 测试账户初始化脚本

client/
├── contexts/
│   └── UserSessionContext.tsx  # 用户会话管理上下文
├── components/
│   └── UserLoginDialog.tsx     # 登录/注册对话框
└── lib/
    └── trpc.ts                 # tRPC客户端配置
```

## 使用流程

### 1. 用户注册

```
用户输入用户名和密码
    ↓
前端验证格式
    ↓
调用 trpc.auth.register
    ↓
服务器验证用户名唯一性
    ↓
服务器哈希密码
    ↓
服务器创建用户记录
    ↓
服务器创建会话令牌
    ↓
设置会话Cookie
    ↓
返回用户信息
```

### 2. 用户登录

```
用户输入用户名和密码
    ↓
前端验证格式
    ↓
调用 trpc.auth.login
    ↓
服务器查询用户
    ↓
服务器验证密码
    ↓
服务器创建会话令牌
    ↓
设置会话Cookie
    ↓
更新最后登录时间
    ↓
返回用户信息
```

### 3. 跨设备登录

```
设备A登录
    ↓
创建会话记录（sessions表）
    ↓
返回JWT令牌
    ↓
设备B登录
    ↓
创建新的会话记录
    ↓
返回新的JWT令牌
    ↓
两个设备都可以独立访问（不互相影响）
```

## 安全特性

### 1. 密码安全
- ✅ PBKDF2哈希（不可逆）
- ✅ 随机盐值
- ✅ 高迭代次数

### 2. 会话安全
- ✅ JWT令牌签名
- ✅ 会话过期时间
- ✅ HttpOnly Cookie（防止XSS）

### 3. 访问控制
- ✅ 受保护路由检查
- ✅ 管理员权限验证
- ✅ 用户数据隔离

## 测试

### 运行单元测试
```bash
pnpm test -- server/auth-utils.test.ts
```

### 测试账户（需要运行种子脚本）
```bash
node server/seed-test-users.mjs
```

测试账户：
- 用户名：testuser，密码：password123
- 用户名：admin，密码：admin123
- 用户名：demo，密码：demo123

## 迁移指南

### 从localStorage迁移到服务器

现有的localStorage账户在用户首次登录时会被自动迁移到数据库：

1. 用户在登录对话框输入用户名和密码
2. 系统调用 `trpc.auth.login`
3. 服务器验证凭证并创建数据库记录
4. 返回JWT令牌并设置会话Cookie
5. 用户登录成功

### 数据持久化

- 用户信息存储在MySQL/TiDB数据库
- 会话信息存储在sessions表
- 本地采集数据仍存储在IndexedDB（用于离线支持）

## 常见问题

### Q: 如何重置用户密码？
A: 当前系统不支持自助密码重置。管理员可以通过数据库直接更新passwordHash字段。

### Q: 如何支持多设备登录？
A: 系统已支持多设备登录。每个设备登录时会创建独立的会话记录。

### Q: 会话会过期吗？
A: 是的，会话有效期为7天。过期后用户需要重新登录。

### Q: 如何实现"记住我"功能？
A: 可以在登录时增加一个"记住我"选项，将会话有效期延长到30天或更长。

## 下一步

1. ✅ 实现用户名+密码认证
2. ✅ 支持跨设备登录
3. ✅ 完整的单元测试
4. ⏳ 实现OAuth集成（Manus OAuth）
5. ⏳ 实现密码重置功能
6. ⏳ 实现两因素认证（2FA）
7. ⏳ 实现用户账户管理页面

## 参考资源

- [PBKDF2 标准](https://en.wikipedia.org/wiki/PBKDF2)
- [JWT 介绍](https://jwt.io/)
- [OWASP 密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

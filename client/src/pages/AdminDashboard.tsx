/**
 * 管理员后台页面
 * 
 * 功能：
 * - 查看所有用户和采集数据
 * - 管理用户账户
 * - 删除用户数据
 * - 系统统计
 * - 重置用户密码
 * - 导出采集数据
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  Container,
  Section,
  SectionLabel,
  SectionTitle,
  Button,
  Card,
  Divider,
  Grid,
} from '@/components/PremiumComponents';
import { useUserSession } from '@/contexts/UserSessionContext';
import { resetUserPassword } from '@/lib/user-auth';
import { exportToCSV, exportToJSON, exportUserStatistics } from '@/lib/data-export';
import { logAuditEvent, AuditEventType } from '@/lib/audit-log';
import { emgDatabase } from '@/lib/db';
import { DatabaseVerificationTool } from '@/components/DatabaseVerificationTool';
import { dataChangeEventManager } from '@/lib/data-change-events';

interface UserInfo {
  userId: string;
  userName: string;
  collections: number;
  createdAt?: number;
}

interface CommandData {
  name: string;
  collections: Array<{
    userId?: string;
    userName?: string;
    timestamp: number | Date;
    duration: number;
  }>;
}

export default function AdminDashboard() {
  const [location, navigate] = useLocation();
  const { currentUser, isLoggedIn } = useUserSession();

  const [users, setUsers] = useState<UserInfo[]>([]);
  const [commandsData, setCommandsData] = useState<CommandData[]>([]);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // 检查管理员权限
  useEffect(() => {
    if (isLoggedIn && !currentUser?.isAdmin) {
      navigate('/');
    }
  }, [isLoggedIn, currentUser, navigate]);

  // 加载所有数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const commands = await emgDatabase.getAllCommands();
        if (commands && commands.length > 0) {
          setCommandsData(commands);

          // 收集用户信息
          const userMap = new Map<string, UserInfo>();
          commands.forEach((cmd: any) => {
            cmd.collections?.forEach((col: any) => {
              if (col.userId && col.userName) {
                if (!userMap.has(col.userId)) {
                  userMap.set(col.userId, {
                    userId: col.userId,
                    userName: col.userName,
                    collections: 0,
                  });
                }
                const user = userMap.get(col.userId)!;
                user.collections += 1;
              }
            });
          });
          setUsers(Array.from(userMap.values()));
        }
      } catch (err) {
        console.error('加载数据失败:', err);
      }
    };

    loadData();
  }, []);

  // 删除用户的所有数据
  const handleDeleteUserData = (userId: string) => {
    const userName = users.find(u => u.userId === userId)?.userName;
    if (confirm(`确认删除用户 "${userName}" 的所有采集数据？`)) {
      const updated = commandsData
        .map((cmd) => ({
          ...cmd,
          collections: cmd.collections.filter((col) => col.userId !== userId),
        }))
        .filter((cmd) => cmd.collections.length > 0);

      setCommandsData(updated);
      
      // ✅ 修复：需要删除被完全清空的指令
      const toDelete = commandsData
        .filter((cmd) => {
          const filtered = cmd.collections.filter((col) => col.userId !== userId);
          return filtered.length === 0;  // 被完全清空的指令
        })
        .map((cmd) => cmd.name);
      
      // 保存修改后的指令
      updated.forEach(cmd => {
        emgDatabase.saveCommand(cmd);
        // ✅ 修改20：发送COMMAND_SAVED事件
        dataChangeEventManager.emitCommandSaved(cmd.name, 'AdminDashboard');
      });
      
      // ✅ 修复：删除被完全清空的指令
      toDelete.forEach(cmdName => {
        console.log(`[删除用户数据] 删除指令 "${cmdName}" 因为该用户的所有采集已被删除`);
        emgDatabase.deleteCommand(cmdName);
        // ✅ 修改20：发送COMMAND_DELETED事件
        dataChangeEventManager.emitCommandDeleted(cmdName, 'AdminDashboard');
      });

      // 更新用户列表
      setUsers(users.filter((u) => u.userId !== userId));
      
      // 记录删除事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.ADMIN_DELETE_USER_DATA,
          { targetUserId: userId, targetUserName: userName },
          currentUser.userId.toString(),
          currentUser.userName
        );
      }
    }
  };

  // 删除所有数据
  const handleClearAllData = () => {
    if (confirm('确认清空所有采集数据？此操作不可撤销！')) {
      setCommandsData([]);
      setUsers([]);
      // ✅ 修复：使用 clearAllData 清空所有 stores，不仅仅是 COMMANDS 和 TRAINING_DATA
      emgDatabase.clearAllData();
      // ✅ 修改20：发送ALL_DATA_CLEARED事件
      dataChangeEventManager.emitAllDataCleared('AdminDashboard');
      
      // 记录清空数据事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.ADMIN_CLEAR_ALL_DATA,
          { action: 'clear_all_data' },
          currentUser.userId.toString(),
          currentUser.userName
        );
      }
    }
  };

  // 重置用户密码
  const handleResetPassword = async (userId: string) => {
    if (!newPassword) {
      alert('请输入新密码');
      return;
    }

    // 添加确认对话
    const confirmed = window.confirm(
      `是否确定要为用户 ${userId} 重置密码?\n\n新密码: ${newPassword}\n\n此操作将被记录到审计日志中。`
    );

    if (!confirmed) {
      return;
    }

    const result = await resetUserPassword(userId, newPassword);
    if (result.success) {
      alert(result.message);
      setResetPasswordUserId(null);
      setNewPassword('');
      
      // 记录重置密码事件
      if (currentUser) {
        logAuditEvent(
          AuditEventType.USER_PASSWORD_RESET,
          { targetUserId: userId },
          currentUser.userId.toString(),
          currentUser.userName
        );
      }
    } else {
      alert(result.message);
    }
  };

  if (!isLoggedIn) {
    return (
      <Container>
        <Section>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
            <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px', backgroundColor: '#1a1a1a', border: '1px solid #d4af37', borderRadius: '8px' }}>
              <h2 style={{ color: '#d4af37', marginBottom: '20px', fontSize: '24px' }}>访问受限</h2>
              <p style={{ color: '#999', marginBottom: '30px', lineHeight: '1.6' }}>管理员后台需要先登录。请返回首页登录后再进入。</p>
              <Button onClick={() => navigate('/')} className="w-full">
                返回首页登录
              </Button>
            </div>
          </div>
        </Section>
      </Container>
    );
  }

  if (!currentUser?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <p className="text-error text-center py-12">您没有权限访问此页面</p>
        </Card>
      </div>
    );
  }

  const totalCollections = commandsData.reduce((sum, cmd) => sum + cmd.collections.length, 0);

  return (
    <div className="min-h-screen">
      {/* 顶部导航 */}
      <div
        className="border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'rgba(26, 26, 26, 0.7)',
        }}
      >
        <Container className="py-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="label mb-2">ADMIN PANEL</div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                管理员后台
              </h1>
            </div>
            <div className="flex gap-4">
              <Button variant="secondary" onClick={() => navigate('/audit-logs')}>
                查看审计日志
              </Button>
              <Button variant="secondary" onClick={() => navigate('/')}>
                返回主页
              </Button>
            </div>
          </div>
        </Container>
      </div>

      {/* 主内容 */}
      <Container>
        <Section>
          <SectionLabel number="01">SYSTEM OVERVIEW</SectionLabel>
          <SectionTitle>系统概览</SectionTitle>

          <Grid cols={3} gap="lg" className="mb-8">
            <Card>
              <div className="label mb-4">注册用户</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {users.length}
              </div>
              <p className="text-secondary text-sm">个用户</p>
            </Card>

            <Card>
              <div className="label mb-4">采集指令</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {commandsData.length}
              </div>
              <p className="text-secondary text-sm">个指令</p>
            </Card>

            <Card>
              <div className="label mb-4">总采集次数</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {totalCollections}
              </div>
              <p className="text-secondary text-sm">次采集</p>
            </Card>
          </Grid>

          <Divider />

          {/* 数据导出 */}
          <Section className="py-12">
            <SectionLabel>DATA EXPORT</SectionLabel>
            <SectionTitle>数据导出</SectionTitle>

            <Card className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  variant="secondary"
                  onClick={() => exportToJSON(commandsData)}
                  disabled={commandsData.length === 0}
                >
                  📄 导出 JSON
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => exportToCSV(commandsData)}
                  disabled={commandsData.length === 0}
                >
                  📊 导出 CSV
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => exportUserStatistics(commandsData)}
                  disabled={commandsData.length === 0}
                >
                  👥 导出用户统计
                </Button>
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 数据管理操作 */}
          <Section className="py-12">
            <SectionLabel>DATA MANAGEMENT</SectionLabel>
            <SectionTitle>数据管理</SectionTitle>

            <Card className="mb-8">
              <div className="flex gap-4">
                <Button
                  variant="error"
                  onClick={handleClearAllData}
                  disabled={commandsData.length === 0}
                >
                  🗑️ 清空所有数据
                </Button>
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 用户管理 */}
          <Section className="py-12">
            <SectionLabel number="02">USER MANAGEMENT</SectionLabel>
            <SectionTitle>用户管理</SectionTitle>

            {users.length === 0 ? (
              <Card>
                <p className="text-secondary text-center py-12">暂无用户数据</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {users.map((user) => (
                  <Card key={user.userId}>
                    {resetPasswordUserId === user.userId ? (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-2xl font-bold text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                            {user.userName}
                          </h4>
                          <p className="text-secondary text-sm mt-2">
                            {user.collections} 次采集
                          </p>
                        </div>
                        <div className="space-y-3">
                          <input
                            type="password"
                            placeholder="输入新密码（至少6个字符）"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2 rounded border"
                            style={{
                              borderColor: 'var(--color-border)',
                              backgroundColor: 'var(--color-background-secondary)',
                              color: 'var(--color-text)',
                            }}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              onClick={() => handleResetPassword(user.userId)}
                            >
                              ✓ 确认重置
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setResetPasswordUserId(null);
                                setNewPassword('');
                              }}
                            >
                              ✕ 取消
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="text-2xl font-bold text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                            {user.userName}
                          </h4>
                          <p className="text-secondary text-sm mt-2">
                            {user.collections} 次采集
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => setResetPasswordUserId(user.userId)}
                          >
                            🔑 重置密码
                          </Button>
                          <Button
                            variant="error"
                            onClick={() => handleDeleteUserData(user.userId)}
                          >
                            🗑️ 删除用户数据
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Section>

          {/* 数据库验证工具 */}
          <Divider />
          <Section className="py-12">
            <SectionLabel>DATABASE TOOLS</SectionLabel>
            <SectionTitle>数据库验证工具</SectionTitle>
            <DatabaseVerificationTool />
          </Section>
        </Section>
      </Container>
    </div>
  );
}

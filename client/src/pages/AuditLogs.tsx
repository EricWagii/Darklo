/**
 * 审计日志查看页面
 * 
 * 功能：
 * - 查看系统审计日志
 * - 按事件类型过滤
 * - 按用户过滤
 * - 导出审计日志
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
import {
  getAllAuditLogs,
  getAuditStatistics,
  exportAuditLogsToCSV,
  AuditEventType,
  AuditLogEntry,
} from '@/lib/audit-log';

export default function AuditLogs() {
  const [location, navigate] = useLocation();
  const { currentUser, isLoggedIn } = useUserSession();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [filterEventType, setFilterEventType] = useState<string | 'all'>('all');
  const [filterUserName, setFilterUserName] = useState<string | 'all'>('all');
  const [allUserNames, setAllUserNames] = useState<string[]>([]);

  // 检查管理员权限
  useEffect(() => {
    if (isLoggedIn && !currentUser?.isAdmin) {
      navigate('/');
    }
  }, [isLoggedIn, currentUser, navigate]);

  // 加载审计日志
  useEffect(() => {
    (async () => {
      try {
        const allLogs = await getAllAuditLogs();
        setLogs(allLogs);

        const statistics = await getAuditStatistics();
        setStats(statistics);

        // 收集所有用户名
        const userNames = Array.from(new Set(allLogs.map((log: any) => log.userName || 'Unknown')));
        setAllUserNames(userNames);
      } catch (error) {
        console.error('加载审计日志失败:', error);
      }
    })();
  }, []);

  if (!isLoggedIn) {
    return (
      <Container>
        <Section>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
            <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px', backgroundColor: '#1a1a1a', border: '1px solid #d4af37', borderRadius: '8px' }}>
              <h2 style={{ color: '#d4af37', marginBottom: '20px', fontSize: '24px' }}>访问受限</h2>
              <p style={{ color: '#999', marginBottom: '30px', lineHeight: '1.6' }}>审计日志需要先登录。请返回首页登录后再进入。</p>
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

  // 过滤日志
  const filteredLogs = logs.filter(log => {
    const eventTypeMatch = filterEventType === 'all' || log.eventType === filterEventType;
    const userNameMatch = filterUserName === 'all' || log.userName === filterUserName;
    return eventTypeMatch && userNameMatch;
  }).reverse();

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
              <div className="label mb-2">AUDIT LOGS</div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                审计日志
              </h1>
            </div>
            <div className="flex gap-4">
              <Button variant="secondary" onClick={() => navigate('/admin')}>
                返回管理员后台
              </Button>
            </div>
          </div>
        </Container>
      </div>

      {/* 主内容 */}
      <Container>
        <Section>
          <SectionLabel number="01">STATISTICS</SectionLabel>
          <SectionTitle>统计信息</SectionTitle>

          <Grid cols={2} gap="lg" className="mb-8">
            <Card>
              <div className="label mb-4">总事件数</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {stats?.totalEvents || 0}
              </div>
              <p className="text-secondary text-sm">条审计记录</p>
            </Card>

            <Card>
              <div className="label mb-4">事件类型</div>
              <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                {stats?.eventsByType ? Object.keys(stats.eventsByType).length : 0}
              </div>
              <p className="text-secondary text-sm">种事件类型</p>
            </Card>
          </Grid>

          <Divider />

          {/* 事件类型统计 */}
          <Section className="py-12">
            <SectionLabel>EVENT TYPES</SectionLabel>
            <SectionTitle>事件类型统计</SectionTitle>

            <Card className="mb-8">
              <div className="space-y-3">
                {stats?.eventsByType && Object.entries(stats.eventsByType).map(([eventType, count]) => (
                  <div key={eventType} className="flex justify-between items-center">
                    <span className="text-secondary">{eventType}</span>
                    <span className="text-accent font-bold">{count as number}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 用户统计 */}
          <Section className="py-12">
            <SectionLabel>USER STATISTICS</SectionLabel>
            <SectionTitle>用户统计</SectionTitle>

            <Card className="mb-8">
              <div className="space-y-3">
                {stats?.eventsByUser && Object.entries(stats.eventsByUser).map(([userName, count]) => (
                  <div key={userName} className="flex justify-between items-center">
                    <span className="text-secondary">{userName}</span>
                    <span className="text-accent font-bold">{count as number}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 日志过滤和导出 */}
          <Section className="py-12">
            <SectionLabel number="02">LOG MANAGEMENT</SectionLabel>
            <SectionTitle>日志管理</SectionTitle>

            <Card className="mb-8 p-6">
              <div className="space-y-4">
                <div>
                  <label className="label mb-2">事件类型过滤</label>
                  <select
                    value={filterEventType}
                    onChange={(e) => setFilterEventType(e.target.value)}
                    className="w-full px-4 py-2 rounded border"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-background-secondary)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <option value="all">所有事件类型</option>
                    {Object.values(AuditEventType).map(eventType => (
                      <option key={eventType} value={eventType}>{eventType}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label mb-2">用户过滤</label>
                  <select
                    value={filterUserName}
                    onChange={(e) => setFilterUserName(e.target.value)}
                    className="w-full px-4 py-2 rounded border"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-background-secondary)',
                      color: 'var(--color-text)',
                    }}
                  >
                    <option value="all">所有用户</option>
                    {allUserNames.map(userName => (
                      <option key={userName} value={userName}>{userName}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => exportAuditLogsToCSV(filteredLogs)}
                    disabled={filteredLogs.length === 0}
                  >
                    📥 导出日志
                  </Button>
                </div>
              </div>
            </Card>
          </Section>

          <Divider />

          {/* 日志列表 */}
          <Section className="py-12">
            <SectionLabel>AUDIT LOG ENTRIES</SectionLabel>
            <SectionTitle>审计日志</SectionTitle>

            {filteredLogs.length === 0 ? (
              <Card>
                <p className="text-secondary text-center py-12">暂无日志记录</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredLogs.map((log) => (
                  <Card key={log.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-lg font-bold text-accent" style={{ fontFamily: 'var(--font-display)' }}>
                            {log.eventType}
                          </h4>
                          <p className="text-secondary text-sm">
                            {new Date(log.timestamp).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-secondary text-sm">{log.userName || 'Unknown'}</p>
                          <p className="text-secondary text-xs">{log.userId || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="text-secondary text-sm">
                        <p>详情: {JSON.stringify(log.details)}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Section>
        </Section>
      </Container>
    </div>
  );
}

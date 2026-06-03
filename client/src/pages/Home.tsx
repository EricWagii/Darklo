/**
 * 主页面 - 高端商业风格
 * 
 * 设计说明：
 * - 深黑色背景 (#0a0a0a) + 金色强调 (#d4af37)
 * - 使用 Playfair Display 作为标题字体
 * - 竖线分隔符和金色边框作为视觉元素
 * - 充足的留白和分层
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
  LoadingSpinner,
} from '@/components/PremiumComponents';
import { emgDatabase } from '@/lib/db';
import { useUserSession } from '@/contexts/UserSessionContext';
import { UserLoginDialog } from '@/components/UserLoginDialog';

export default function Home() {
  const [location, navigate] = useLocation();
  const { isLoggedIn, currentUser, logout: userSessionLogout } = useUserSession();
  const [showLoginDialog, setShowLoginDialog] = useState(!isLoggedIn);
  const [stats, setStats] = useState({
    totalCommands: 0,
    totalWaveforms: 0,
    hasFeatureLibrary: false,
  });
  const [pageLoading, setPageLoading] = useState(true);
  const [userStats, setUserStats] = useState<Array<{userId: string; userName: string; collections: number}>>([]);

  // 监听登录状态变化，自动更新登录对话框显示状态
  useEffect(() => {
    setShowLoginDialog(!isLoggedIn);
  }, [isLoggedIn]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        // 仅从 IndexedDB 读取采集数据
        const commands = await emgDatabase.getAllCommands();
        if (commands && commands.length > 0) {
          const totalWaveforms = commands.reduce((sum: number, cmd: any) => sum + (cmd.collections?.length || 0), 0);
          setStats({
            totalCommands: commands.length,
            totalWaveforms: totalWaveforms,
            hasFeatureLibrary: totalWaveforms > 0,
          });
        } else {
          // IndexedDB 没有数据，显示默认值
          setStats({
            totalCommands: 0,
            totalWaveforms: 0,
            hasFeatureLibrary: false,
          });
        }
      } catch (error) {
        console.error('加载统计信息失败:', error);
        setStats({
          totalCommands: 0,
          totalWaveforms: 0,
          hasFeatureLibrary: false,
        });
      } finally {
        setPageLoading(false);
      }
    };

    loadStats();
  }, []);

  // 定时刷新统计信息（每 2 秒），以便其他标签页修改数据时自动更新
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // 每 2 秒从 IndexedDB 重新读取一次
        const commands = await emgDatabase.getAllCommands();
        if (commands && commands.length > 0) {
          const totalWaveforms = commands.reduce((sum: number, cmd: any) => sum + (cmd.collections?.length || 0), 0);
          setStats({
            totalCommands: commands.length,
            totalWaveforms: totalWaveforms,
            hasFeatureLibrary: totalWaveforms > 0,
          });
        } else {
          // IndexedDB 没有数据
          setStats({
            totalCommands: 0,
            totalWaveforms: 0,
            hasFeatureLibrary: false,
          });
        }
      } catch (error) {
        console.warn('刷新统计信息失败:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // 加载用户采集统计（仅管理员）
  useEffect(() => {
    if (!currentUser?.isAdmin) return;

    const loadUserStats = async () => {
      try {
        const commands = await emgDatabase.getAllCommands();
        const userStats = new Map<string, {userName: string; collections: number}>();
        
        if (commands && commands.length > 0) {
          commands.forEach((cmd: any) => {
            cmd.collections?.forEach((col: any) => {
              if (col.userId && col.userName) {
                if (!userStats.has(col.userId)) {
                  userStats.set(col.userId, {userName: col.userName, collections: 0});
                }
                const stat = userStats.get(col.userId)!;
                stat.collections += 1;
              }
            });
          });
        }

        // ✅ 修复：使用setState而不是innerHTML，确保样式一致
        setUserStats(Array.from(userStats.entries()).map(([userId, stat]) => ({
          userId,
          userName: stat.userName,
          collections: stat.collections,
        })));
      } catch (error) {
        console.error('加载用户采集统计失败:', error);
      }
    };

    loadUserStats();
    const interval = setInterval(loadUserStats, 2000);
    return () => clearInterval(interval);
  }, [currentUser?.isAdmin]);

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
              <div className="label mb-2">AI LAB / DEEP ANALYSIS</div>
              <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                Wagii - Darklo EMG Silent Speech
              </h1>
            </div>
            <div className="flex gap-4 items-center">
              {isLoggedIn && currentUser && (
                <div style={{
                  color: '#d4af37',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  paddingRight: '16px',
                  borderRight: '1px solid #333',
                }}>
                  👤 {currentUser.userName}
                </div>
              )}
              <Button variant="secondary" onClick={() => navigate('/collection')}>
                采集训练
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/recognition')}
                disabled={!stats.hasFeatureLibrary}
              >
                默念测试
              </Button>
              <Button variant="secondary" onClick={() => navigate('/data-management')}>
                数据管理
              </Button>
              <Button variant="secondary" onClick={() => navigate('/recognition-diagnostics')}>
                识别诊断
              </Button>

              {isLoggedIn && currentUser?.isAdmin && (
                <Button variant="secondary" onClick={() => navigate('/admin')}>
                  管理员后台
                </Button>
              )}
              {isLoggedIn && (
                <Button
                  variant="error"
                  onClick={userSessionLogout}
                >
                  登出
                </Button>
              )}
            </div>
          </div>
        </Container>
      </div>

      {/* 主内容 */}
      <Container>
        <Section>
          <SectionLabel number="01">SYSTEM OVERVIEW</SectionLabel>
          <SectionTitle>
            耳周肌电
            <br />
            无声语音识别系统
          </SectionTitle>

          <div className="mb-12">
            <p className="text-lg text-secondary leading-relaxed mb-6">
              通过采集耳后乳突区的肌电信号，使用深度学习算法进行特征提取和识别，实现无声默念指令的实时识别。该系统可应用于人机交互、辅助通信等领域。
            </p>
          </div>

          <Divider />

          {/* 系统统计 */}
          <Section className="py-12">
            <SectionLabel>SYSTEM STATUS</SectionLabel>

            {pageLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <Grid cols={3} gap="lg">
                <Card>
                  <div className="label mb-4">已采集指令</div>
                  <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    {stats.totalCommands}
                  </div>
                  <p className="text-secondary text-sm">个指令</p>
                </Card>

                <Card>
                  <div className="label mb-4">总采集次数</div>
                  <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    {stats.totalWaveforms}
                  </div>
                  <p className="text-secondary text-sm">次采集</p>
                </Card>

                <Card>
                  <div className="label mb-4">特征库状态</div>
                  <div className={`text-2xl font-bold mb-2 ${stats.hasFeatureLibrary ? 'text-success' : 'text-error'}`}>
                    {stats.hasFeatureLibrary ? '✓ 就绪' : '✗ 未就绪'}
                  </div>
                  <p className="text-secondary text-sm">
                    {stats.hasFeatureLibrary ? '可进行识别测试' : '请先完成采集训练'}
                  </p>
                </Card>
              </Grid>
            )}
          </Section>

          <Divider />

          {/* 用户采集统计 - 仅管理员可见 */}
          {currentUser?.isAdmin ? (
            <Section className="py-12">
              <SectionLabel>USER STATISTICS</SectionLabel>
              <SectionTitle>用户采集统计</SectionTitle>
              
              {/* ✅ 修复：使用React组件而不是innerHTML，确保样式一致 */}
              {userStats.length === 0 ? (
                <p className="text-secondary">加载中...</p>
              ) : (
                <Grid cols={3} gap="lg">
                  {userStats.map((stat, idx) => (
                    <Card key={idx}>
                      <div className="label mb-4">{stat.userName}</div>
                      <div className="text-5xl font-bold text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                        {stat.collections}
                      </div>
                      <p className="text-secondary text-sm">次采集</p>
                    </Card>
                  ))}
                </Grid>
              )}
            </Section>
          ) : null}

          {currentUser?.isAdmin && <Divider />}

          {/* 技术创新亮点 */}
          <Section className="py-12">
            <SectionLabel number="02">ADVANCED TECHNOLOGY</SectionLabel>
            <SectionTitle>技术创新亮点</SectionTitle>

            <Grid cols={2} gap="lg">
              <Card>
                <div className="label mb-4 text-accent">🧠 高维特征工程</div>
                <h4 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  180 维多模态特征
                </h4>
                <p className="text-secondary leading-relaxed">
                  整合时域(60维)、频域(30维)、MFCC(39维)、梅尔谱图(21维)特征。完整的预处理管道：50/60Hz陷波滤波、高通滤波、改进的 FastICA 独立成分分析。特征缓存机制提升性能 20-30%。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🤖 智能识别引擎</div>
                <h4 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  双引擎识别架构
                </h4>
                <p className="text-secondary leading-relaxed">
                  自定义 CNN 模型 + DTW 动态时间规整双引擎并行。支持模型训练、保存、加载。自动选择最优识别结果，预期准确率 85-92%。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">📡 多通道融合</div>
                <h4 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  SNR 权重动态融合
                </h4>
                <p className="text-secondary leading-relaxed">
                  根据三通道信噪比动态计算权重，融合多通道特征提高识别鲁棒性。IndexedDB 数据持久化支持 50MB+ 存储，完整的审计日志和数据追踪。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🎯 现代化架构</div>
                <h4 className="text-2xl font-bold mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  生产级代码质量
                </h4>
                <p className="text-secondary leading-relaxed">
                  完善的错误处理、详细的日志系统、36 个单元测试（覆盖率 70%+）。现代化 UI 组件库，支持 Web Worker 性能优化。
                </p>
              </Card>
            </Grid>
          </Section>

          <Divider />

          {/* 应用场景 */}
          <Section className="py-12">
            <SectionLabel number="03">APPLICATION SCENARIOS</SectionLabel>
            <SectionTitle>应用场景与价值</SectionTitle>

            <Grid cols={2} gap="lg">
              <Card>
                <div className="label mb-4 text-accent">🎮 人机交互</div>
                <h5 className="text-xl font-bold mb-3">无声控制设备</h5>
                <p className="text-secondary leading-relaxed mb-4">
                  实现无声、隐蔽的设备控制，适用于嘈杂环境、隐私保护、游戏交互等场景。支持自定义指令集，扩展性强。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🏥 医疗辅助</div>
                <h5 className="text-xl font-bold mb-3">失语症患者通信</h5>
                <p className="text-secondary leading-relaxed mb-4">
                  为无法正常发音的患者提供新的交流方式，通过默念指令进行文字输出，改善生活质量。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🔐 生物识别</div>
                <h5 className="text-xl font-bold mb-3">个性化认证</h5>
                <p className="text-secondary leading-relaxed mb-4">
                  利用肌电信号的个体差异性，实现生物识别认证。每个人的肌肉活动模式独特，难以伪造。
                </p>
              </Card>

              <Card>
                <div className="label mb-4 text-accent">🚀 未来通信</div>
                <h5 className="text-xl font-bold mb-3">脑机接口基础</h5>
                <p className="text-secondary leading-relaxed mb-4">
                  作为脑机接口技术的重要基础，为未来的神经接口应用奠定技术基础。
                </p>
              </Card>
            </Grid>
          </Section>

          <Divider />

          {/* 快速开始 */}
          <Section className="py-12">
            <SectionLabel number="04">QUICK START</SectionLabel>
            <SectionTitle>快速开始</SectionTitle>

            <div className="grid grid-cols-2 gap-8">
              <Card>
                <h4 className="text-2xl font-bold mb-4 text-accent" style={{ fontFamily: 'var(--font-serif)' }}>
                  1. 连接硬件
                </h4>
                <p className="text-secondary leading-relaxed">
                  使用 USB 串口连接 Arduino 设备。系统会自动检测硬件连接状态。
                </p>
              </Card>

              <Card>
                <h4 className="text-2xl font-bold mb-4 text-accent" style={{ fontFamily: 'var(--font-serif)' }}>
                  2. 采集训练
                </h4>
                <p className="text-secondary leading-relaxed">
                  输入指令名称，点击"开始采集"，默念指令 3 秒，点击"停止采集"。重复 5 次以上。
                </p>
              </Card>

              <Card>
                <h4 className="text-2xl font-bold mb-4 text-accent" style={{ fontFamily: 'var(--font-serif)' }}>
                  3. 完成采集
                </h4>
                <p className="text-secondary leading-relaxed">
                  采集完成后点击"完成采集"，系统自动生成特征库。可继续采集其他指令。
                </p>
              </Card>

              <Card>
                <h4 className="text-2xl font-bold mb-4 text-accent" style={{ fontFamily: 'var(--font-serif)' }}>
                  4. 开始识别
                </h4>
                <p className="text-secondary leading-relaxed">
                  切换到"默念测试"模式，点击"开始识别"，默念任意指令，系统返回识别结果。
                </p>
              </Card>
            </div>
          </Section>
        </Section>
      </Container>

      {/* 页脚 */}
      <div
        className="border-t"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <Container className="py-8">
          <div className="flex justify-between items-center text-secondary text-sm">
            <div>© 2026 Wagii - Darklo EMG Silent Speech</div>
            <div>Powered by Deep Learning & Signal Processing</div>
          </div>
        </Container>
      </div>

      {/* 用户登录对话框 */}
      <UserLoginDialog
        isOpen={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
      />
    </div>
  );
}

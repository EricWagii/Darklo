/**
 * 识别诊断页面
 *
 * 用于真实采集后快速定位准确率下降原因：旧记录污染、低 margin、高置信错误、
 * 通道权重异常和各指令准确率分布。
 */

import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Button,
  Card,
  Container,
  Divider,
  Grid,
  Section,
  SectionLabel,
  SectionTitle,
} from '@/components/PremiumComponents';
import { emgDatabase } from '@/lib/db';

type CommandRecord = {
  name?: string;
  key?: string;
  collections?: unknown[];
};

type RecognitionRecord = {
  commandName?: string;
  actualCommand?: string;
  predictedCommand?: string;
  command?: string;
  recordType?: string;
  isCorrect?: boolean;
  confidence?: number;
  similarity?: number;
  top1Score?: number;
  top2Score?: number;
  scoreMargin?: number;
  channelWeights?: { ch1?: number; ch2?: number; ch3?: number };
  channelDiagnostics?: {
    ch1?: { quality?: string };
    ch2?: { quality?: string };
    ch3?: { quality?: string };
  };
  timestamp?: number | string | Date;
};

type CommandStats = {
  command: string;
  count: number;
  correct: number;
  accuracy: number;
  avgConfidence: number;
  avgMargin: number;
  highConfidenceWrong: number;
  lowMargin: number;
};

type DiagnosticIssue = {
  level: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
};

const isUncertain = (command?: string): boolean => {
  return (command || '').startsWith('❌ 识别不确定');
};

const numberValue = (value: unknown, fallback = 0): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const percent = (value: number, total: number): string => {
  if (total <= 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
};

const formatNumber = (value: number, digits = 1): string => {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.0';
};

const actualCommandOf = (record: RecognitionRecord): string => {
  return record.actualCommand || record.commandName || 'unknown';
};

const predictedCommandOf = (record: RecognitionRecord): string => {
  return record.predictedCommand || record.command || 'unknown';
};

const timestampOf = (record: RecognitionRecord): number => {
  if (!record.timestamp) return 0;
  if (typeof record.timestamp === 'number') return record.timestamp;
  const time = new Date(record.timestamp).getTime();
  return Number.isFinite(time) ? time : 0;
};

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};

const thStyle: React.CSSProperties = {
  color: '#d4af37',
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #333',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  color: '#ddd',
  padding: '10px 8px',
  borderBottom: '1px solid #262626',
  verticalAlign: 'top',
};

export default function RecognitionDiagnostics() {
  const [, navigate] = useLocation();
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [records, setRecords] = useState<RecognitionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [commandRows, recognitionRows] = await Promise.all([
        emgDatabase.getAllCommands(),
        emgDatabase.getAllRecognitionRecords(),
      ]);
      setCommands(commandRows as CommandRecord[]);
      setRecords(recognitionRows as RecognitionRecord[]);
    } catch (err) {
      console.error('[RecognitionDiagnostics] 加载失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const validCommandNames = new Set(
    commands
      .map((command) => command.name || command.key)
      .filter((name): name is string => Boolean(name))
  );

  const validRecords = records.filter((record) => {
    return validCommandNames.has(actualCommandOf(record)) && typeof record.isCorrect === 'boolean';
  });

  const staleRecords = records.filter((record) => {
    return !validCommandNames.has(actualCommandOf(record));
  });

  const feedbackRecords = validRecords.filter((record) => {
    return (record.recordType || 'feedback') === 'feedback';
  });
  const analysisRecords = feedbackRecords;
  const uncertainRecords = analysisRecords.filter((record) => isUncertain(predictedCommandOf(record)));
  const highConfidenceWrongRecords = analysisRecords.filter((record) => {
    return record.isCorrect === false && numberValue(record.confidence ?? record.similarity) >= 80;
  });
  const lowMarginRecords = analysisRecords.filter((record) => numberValue(record.scoreMargin) > 0 && numberValue(record.scoreMargin) < 5);
  const correctRecords = analysisRecords.filter((record) => record.isCorrect === true);
  const avgMargin = average(analysisRecords.map((record) => numberValue(record.scoreMargin)).filter((value) => value > 0));
  const avgConfidence = average(analysisRecords.map((record) => numberValue(record.confidence ?? record.similarity)));

  const commandStats: CommandStats[] = Array.from(validCommandNames).map((command) => {
    const commandRecords = analysisRecords.filter((record) => actualCommandOf(record) === command);
    const correct = commandRecords.filter((record) => record.isCorrect === true).length;
    const confidences = commandRecords.map((record) => numberValue(record.confidence ?? record.similarity));
    const margins = commandRecords.map((record) => numberValue(record.scoreMargin)).filter((value) => value > 0);

    return {
      command,
      count: commandRecords.length,
      correct,
      accuracy: commandRecords.length > 0 ? (correct / commandRecords.length) * 100 : 0,
      avgConfidence: average(confidences),
      avgMargin: average(margins),
      highConfidenceWrong: commandRecords.filter((record) => {
        return record.isCorrect === false && numberValue(record.confidence ?? record.similarity) >= 80;
      }).length,
      lowMargin: commandRecords.filter((record) => {
        return numberValue(record.scoreMargin) > 0 && numberValue(record.scoreMargin) < 5;
      }).length,
    };
  }).sort((a, b) => a.accuracy - b.accuracy || b.count - a.count);

  const recordsWithWeights = analysisRecords.filter((record) => record.channelWeights);
  const avgWeights = {
    ch1: average(recordsWithWeights.map((record) => numberValue(record.channelWeights?.ch1))),
    ch2: average(recordsWithWeights.map((record) => numberValue(record.channelWeights?.ch2))),
    ch3: average(recordsWithWeights.map((record) => numberValue(record.channelWeights?.ch3))),
  };

  const qualityCounts = ['ch1', 'ch2', 'ch3'].reduce<Record<string, Record<string, number>>>((acc, channel) => {
    acc[channel] = {};
    analysisRecords.forEach((record) => {
      const quality = record.channelDiagnostics?.[channel as 'ch1' | 'ch2' | 'ch3']?.quality || 'unknown';
      acc[channel][quality] = (acc[channel][quality] || 0) + 1;
    });
    return acc;
  }, {});

  const recentRecords = [...validRecords]
    .sort((a, b) => timestampOf(b) - timestampOf(a))
    .slice(0, 20);

  const totalCollections = commands.reduce((sum, command) => sum + (command.collections?.length || 0), 0);
  const duplicateCommandNames = commands.reduce<Record<string, number>>((acc, command) => {
    const name = command.name || command.key || 'unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const duplicateCommands = Object.entries(duplicateCommandNames).filter(([, count]) => count > 1);

  const confusionPairs = analysisRecords
    .filter((record) => record.isCorrect === false && !isUncertain(predictedCommandOf(record)))
    .reduce<Record<string, { actual: string; predicted: string; count: number; avgConfidence: number; avgMargin: number }>>((acc, record) => {
      const actual = actualCommandOf(record);
      const predicted = predictedCommandOf(record);
      const key = `${actual} -> ${predicted}`;
      const existing = acc[key] || { actual, predicted, count: 0, avgConfidence: 0, avgMargin: 0 };
      const nextCount = existing.count + 1;
      acc[key] = {
        actual,
        predicted,
        count: nextCount,
        avgConfidence: ((existing.avgConfidence * existing.count) + numberValue(record.confidence ?? record.similarity)) / nextCount,
        avgMargin: ((existing.avgMargin * existing.count) + numberValue(record.scoreMargin)) / nextCount,
      };
      return acc;
    }, {});

  const topConfusions = Object.values(confusionPairs)
    .sort((a, b) => b.count - a.count || b.avgConfidence - a.avgConfidence)
    .slice(0, 10);

  const issues: DiagnosticIssue[] = [];
  if (duplicateCommands.length > 0) {
    issues.push({
      level: 'critical',
      title: '存在同名指令记录',
      detail: duplicateCommands.map(([name, count]) => `${name} x${count}`).join('，'),
    });
  }
  if (staleRecords.length > 0) {
    issues.push({
      level: 'critical',
      title: '存在旧记录污染',
      detail: `${staleRecords.length} 条识别记录不属于当前有效指令集，应在删除指令时级联清理。`,
    });
  }
  if (highConfidenceWrongRecords.length > 0) {
    issues.push({
      level: 'critical',
      title: '高置信错误偏多',
      detail: `${highConfidenceWrongRecords.length} 条记录错误但置信度 >= 80，说明评分校准或模板区分度仍有问题。`,
    });
  }
  if (lowMarginRecords.length > Math.max(2, analysisRecords.length * 0.25)) {
    issues.push({
      level: 'warning',
      title: '低 margin 记录集中',
      detail: `${lowMarginRecords.length} 条记录 top1 与 top2 差距小于 5，指令间可分性不足。`,
    });
  }
  if (recordsWithWeights.length > 0 && avgWeights.ch2 < 0.45) {
    issues.push({
      level: 'warning',
      title: 'ch2 权重偏低',
      detail: `当前平均 ch2 权重为 ${formatNumber(avgWeights.ch2 * 100)}%，低于预期主判别通道权重。`,
    });
  }
  if (feedbackRecords.length < validRecords.length) {
    issues.push({
      level: 'info',
      title: '存在非反馈记录',
      detail: `${validRecords.length - feedbackRecords.length} 条有效记录不是 feedback 类型，统计时需谨慎。`,
    });
  }
  if (issues.length === 0) {
    issues.push({
      level: 'info',
      title: '未发现结构性数据问题',
      detail: '当前记录没有明显旧数据污染、同名指令或高置信错误集中现象。',
    });
  }

  const exportDiagnostics = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadJson(`recognition-diagnostics-${timestamp}.json`, {
      exportTime: new Date().toISOString(),
      overview: {
        commandCount: commands.length,
        collectionCount: totalCollections,
        recordCount: records.length,
        validRecordCount: validRecords.length,
        staleRecordCount: staleRecords.length,
        analysisRecordCount: analysisRecords.length,
        accuracy: percent(correctRecords.length, analysisRecords.length),
        avgConfidence,
        avgMargin,
        uncertainCount: uncertainRecords.length,
        highConfidenceWrongCount: highConfidenceWrongRecords.length,
        lowMarginCount: lowMarginRecords.length,
        avgWeights,
      },
      issues,
      commandStats,
      topConfusions,
      recentRecords,
    });
  };

  return (
    <div className="min-h-screen" style={{ color: '#fff', paddingBottom: '40px' }}>
      <Container>
        <Section>
          <div className="flex justify-between items-start gap-4 mb-10">
            <div>
              <SectionLabel number="DX">RECOGNITION DIAGNOSTICS</SectionLabel>
              <SectionTitle subtitle="用于查看真实测试记录、旧数据污染、margin 风险和通道权重分布。">
                识别诊断
              </SectionTitle>
            </div>
            <div className="flex gap-3 flex-wrap justify-end">
              <Button variant="secondary" onClick={() => navigate('/')}>返回主页</Button>
              <Button variant="secondary" onClick={() => navigate('/recognition')}>默念测试</Button>
              <Button variant="secondary" onClick={() => navigate('/data-management')}>数据管理</Button>
              <Button variant="secondary" onClick={exportDiagnostics}>导出诊断</Button>
              <Button variant="primary" onClick={loadDiagnostics}>刷新</Button>
            </div>
          </div>

          {error && (
            <Card className="mb-6">
              <div style={{ color: '#ff6b6b', fontWeight: 'bold' }}>加载失败：{error}</div>
            </Card>
          )}

          {loading ? (
            <Card>
              <div style={{ color: '#aaa' }}>正在读取 IndexedDB 诊断数据...</div>
            </Card>
          ) : (
            <>
              <Grid cols={4} gap="md" className="mb-8">
                <Card className="p-6 min-h-[150px]">
                  <div className="label mb-3">当前指令 / 采集</div>
                  <div className="text-4xl font-bold">{commands.length}</div>
                  <div style={{ color: '#aaa', marginTop: '8px' }}>{totalCollections} 条采集样本</div>
                </Card>
                <Card className="p-6 min-h-[150px]">
                  <div className="label mb-3">有效识别记录</div>
                  <div className="text-4xl font-bold">{validRecords.length}</div>
                  <div style={{ color: '#aaa', marginTop: '8px' }}>原始记录 {records.length} 条</div>
                </Card>
                <Card className="p-6 min-h-[150px]">
                  <div className="label mb-3">总体准确率</div>
                  <div className="text-4xl font-bold" style={{ color: correctRecords.length === analysisRecords.length && analysisRecords.length > 0 ? '#5fd17a' : '#d4af37' }}>
                    {percent(correctRecords.length, analysisRecords.length)}
                  </div>
                  <div style={{ color: '#aaa', marginTop: '8px' }}>{correctRecords.length}/{analysisRecords.length} 正确反馈</div>
                </Card>
                <Card className="p-6 min-h-[150px]">
                  <div className="label mb-3">旧记录污染</div>
                  <div className="text-4xl font-bold" style={{ color: staleRecords.length > 0 ? '#ff6b6b' : '#5fd17a' }}>
                    {staleRecords.length}
                  </div>
                  <div style={{ color: '#aaa', marginTop: '8px' }}>不属于当前指令集</div>
                </Card>
              </Grid>

              <Grid cols={4} gap="md" className="mb-8">
                <Card className="p-6">
                  <div className="label mb-3">不确定记录</div>
                  <div className="text-3xl font-bold">{uncertainRecords.length}</div>
                  <div style={{ color: '#aaa', marginTop: '8px' }}>{percent(uncertainRecords.length, analysisRecords.length)}</div>
                </Card>
                <Card className="p-6">
                  <div className="label mb-3">低 margin</div>
                  <div className="text-3xl font-bold">{lowMarginRecords.length}</div>
                  <div style={{ color: '#aaa', marginTop: '8px' }}>scoreMargin &lt; 5</div>
                </Card>
                <Card className="p-6">
                  <div className="label mb-3">高置信错误</div>
                  <div className="text-3xl font-bold" style={{ color: highConfidenceWrongRecords.length > 0 ? '#ff6b6b' : '#ddd' }}>
                    {highConfidenceWrongRecords.length}
                  </div>
                  <div style={{ color: '#aaa', marginTop: '8px' }}>错误且置信度 >= 80</div>
                </Card>
                <Card className="p-6">
                  <div className="label mb-3">平均 margin</div>
                  <div className="text-3xl font-bold">
                    {formatNumber(avgMargin)}
                  </div>
                  <div style={{ color: '#aaa', marginTop: '8px' }}>top1 与 top2 差距</div>
                </Card>
              </Grid>

              <Divider />

              <SectionLabel number="00">AUTO FINDINGS</SectionLabel>
              <Grid cols={Math.min(3, Math.max(1, issues.length))} gap="md" className="mb-8">
                {issues.map((issue, index) => {
                  const color = issue.level === 'critical' ? '#ff6b6b' : issue.level === 'warning' ? '#fbbf24' : '#5fd17a';
                  return (
                    <Card className="p-6" key={`${issue.title}-${index}`}>
                      <div className="label mb-3" style={{ color }}>{issue.level.toUpperCase()}</div>
                      <div className="text-xl font-bold mb-3">{issue.title}</div>
                      <div style={{ color: '#aaa', lineHeight: '1.7', fontSize: '14px' }}>{issue.detail}</div>
                    </Card>
                  );
                })}
              </Grid>

              <SectionLabel number="01">COMMAND ACCURACY</SectionLabel>
              <div style={{ overflowX: 'auto', marginBottom: '36px' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>指令</th>
                      <th style={thStyle}>记录</th>
                      <th style={thStyle}>准确率</th>
                      <th style={thStyle}>平均置信度</th>
                      <th style={thStyle}>平均 margin</th>
                      <th style={thStyle}>高置信错误</th>
                      <th style={thStyle}>低 margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commandStats.map((stat) => (
                      <tr key={stat.command}>
                        <td style={tdStyle}>{stat.command}</td>
                        <td style={tdStyle}>{stat.count}</td>
                        <td style={{ ...tdStyle, color: stat.accuracy < 50 && stat.count > 0 ? '#ff6b6b' : '#ddd' }}>
                          {formatNumber(stat.accuracy)}%
                        </td>
                        <td style={tdStyle}>{formatNumber(stat.avgConfidence)}%</td>
                        <td style={tdStyle}>{formatNumber(stat.avgMargin)}</td>
                        <td style={tdStyle}>{stat.highConfidenceWrong}</td>
                        <td style={tdStyle}>{stat.lowMargin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <SectionLabel number="02">CHANNEL WEIGHTS</SectionLabel>
              <Grid cols={3} gap="md" className="mb-8">
                {(['ch1', 'ch2', 'ch3'] as const).map((channel) => (
                  <Card className="p-6" key={channel}>
                    <div className="label mb-3">{channel.toUpperCase()}</div>
                    <div className="text-3xl font-bold">
                      {formatNumber(avgWeights[channel] * 100)}%
                    </div>
                    <div style={{ color: '#aaa', marginTop: '12px', lineHeight: '1.7' }}>
                      {Object.entries(qualityCounts[channel] || {}).map(([quality, count]) => (
                        <div key={quality}>{quality}: {count}</div>
                      ))}
                    </div>
                  </Card>
                ))}
              </Grid>

              <SectionLabel number="03">CONFUSION PAIRS</SectionLabel>
              <div style={{ overflowX: 'auto', marginBottom: '36px' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>真实指令</th>
                      <th style={thStyle}>误识别为</th>
                      <th style={thStyle}>次数</th>
                      <th style={thStyle}>平均置信度</th>
                      <th style={thStyle}>平均 margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topConfusions.length === 0 ? (
                      <tr>
                        <td style={tdStyle} colSpan={5}>暂无明确误识别对</td>
                      </tr>
                    ) : (
                      topConfusions.map((pair) => (
                        <tr key={`${pair.actual}-${pair.predicted}`}>
                          <td style={tdStyle}>{pair.actual}</td>
                          <td style={tdStyle}>{pair.predicted}</td>
                          <td style={tdStyle}>{pair.count}</td>
                          <td style={tdStyle}>{formatNumber(pair.avgConfidence)}%</td>
                          <td style={tdStyle}>{formatNumber(pair.avgMargin)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <SectionLabel number="04">RECENT RECOGNITION RECORDS</SectionLabel>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>时间</th>
                      <th style={thStyle}>真实</th>
                      <th style={thStyle}>预测</th>
                      <th style={thStyle}>结果</th>
                      <th style={thStyle}>置信度</th>
                      <th style={thStyle}>top1</th>
                      <th style={thStyle}>top2</th>
                      <th style={thStyle}>margin</th>
                      <th style={thStyle}>权重 ch1/ch2/ch3</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRecords.map((record, index) => {
                      const weights = record.channelWeights;
                      const time = timestampOf(record);
                      return (
                        <tr key={`${time}-${index}`}>
                          <td style={tdStyle}>{time ? new Date(time).toLocaleTimeString() : '-'}</td>
                          <td style={tdStyle}>{actualCommandOf(record)}</td>
                          <td style={tdStyle}>{predictedCommandOf(record)}</td>
                          <td style={{ ...tdStyle, color: record.isCorrect ? '#5fd17a' : '#ff6b6b' }}>
                            {record.isCorrect ? '正确' : '错误'}
                          </td>
                          <td style={tdStyle}>{formatNumber(numberValue(record.confidence ?? record.similarity))}%</td>
                          <td style={tdStyle}>{formatNumber(numberValue(record.top1Score))}</td>
                          <td style={tdStyle}>{formatNumber(numberValue(record.top2Score))}</td>
                          <td style={tdStyle}>{formatNumber(numberValue(record.scoreMargin))}</td>
                          <td style={tdStyle}>
                            {weights
                              ? `${formatNumber(numberValue(weights.ch1) * 100, 0)}/${formatNumber(numberValue(weights.ch2) * 100, 0)}/${formatNumber(numberValue(weights.ch3) * 100, 0)}`
                              : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      </Container>
    </div>
  );
}

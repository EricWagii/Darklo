import { useEffect, useState } from 'react';
import { useSerialConnectionContext } from '@/contexts/SerialConnectionContext';
import { emgDatabase } from '@/lib/db';
import { getRestingBaselineStats } from '@/lib/resting-baseline-utils';
import { ElectrodeBaselineCapture } from '@/components/ElectrodeBaselineCapture';

interface RestingBaselineQuickPanelProps {
  contextLabel: string;
}

export function RestingBaselineQuickPanel({ contextLabel }: RestingBaselineQuickPanelProps) {
  const { isConnected } = useSerialConnectionContext();
  const [baselineSummary, setBaselineSummary] = useState('未采集');

  const loadBaselineSummary = async () => {
    try {
      const baseline = await emgDatabase.getCalibration();
      const stats = getRestingBaselineStats(baseline);
      if (!stats) {
        setBaselineSummary('未采集静息基线');
        return;
      }

      const capturedAt = stats.capturedAt ? new Date(stats.capturedAt).toLocaleString() : '未知时间';
      setBaselineSummary(
        `${capturedAt} · ${stats.samplesCollected || 0} 样本 · ch2底噪 ${stats.ch2Std.toFixed(2)}`
      );
    } catch (error) {
      console.error('[静息基线] 读取失败:', error);
      setBaselineSummary('读取失败，请重新采集');
    }
  };

  useEffect(() => {
    loadBaselineSummary();
  }, []);

  return (
    <div
      style={{
        backgroundColor: '#101010',
        border: '1px solid #d4af37',
        borderRadius: '6px',
        padding: '16px',
        marginTop: '16px',
        marginBottom: '32px',
        boxShadow: '0 0 0 1px rgba(212, 175, 55, 0.12)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '16px',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}
      >
        <div>
          <div style={{ color: '#d4af37', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>
            静息基线采集
          </div>
          <div style={{ color: '#aaa', fontSize: '13px', lineHeight: 1.6 }}>
            {contextLabel}前保持放松，采集 5 秒静息波形；后续信号会用它做底噪参考和预处理。
          </div>
        </div>
        <div
          style={{
            color: isConnected ? '#4ade80' : '#f59e0b',
            border: `1px solid ${isConnected ? '#4ade80' : '#f59e0b'}`,
            borderRadius: '4px',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {isConnected ? '硬件已连接' : '请先连接硬件'}
        </div>
      </div>

      <div
        style={{
          backgroundColor: '#050505',
          border: '1px solid #333',
          borderRadius: '4px',
          color: '#ddd',
          fontSize: '13px',
          padding: '10px 12px',
          marginBottom: '12px',
        }}
      >
        当前基线：{baselineSummary}
      </div>

      <ElectrodeBaselineCapture onComplete={loadBaselineSummary} />
    </div>
  );
}

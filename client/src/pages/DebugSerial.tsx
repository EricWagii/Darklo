/**
 * 串口数据调试页面
 * 
 * 功能：
 * - 显示原始串口数据
 * - 实时数据统计和分析
 * - 一键导出数据为 JSON 和 CSV 格式
 * - 信号质量评估
 */

import React, { useEffect, useState, useRef } from 'react';
import { useSerialConnection } from '@/hooks/useSerialConnection';
import { computeFFT } from '@/lib/fft-analysis';
import { SpectrumDisplay } from '@/components/SpectrumDisplay';
import { HARDWARE_CONFIG } from '@shared/hardware-config';

interface SerialData {
  channel1: number;
  channel2: number;
  channel3: number;
  timestamp: number;
}

interface SignalStats {
  ch1: { min: number; max: number; mean: number; std: number };
  ch2: { min: number; max: number; mean: number; std: number };
  ch3: { min: number; max: number; mean: number; std: number };
}

export default function DebugSerial() {
  const { isConnected, error, isSupported, requestPort, connect, disconnect, onDataReceived } = useSerialConnection();
  const [isConnecting, setIsConnecting] = useState(false);
  const [parsedData, setParsedData] = useState<SerialData[]>([]);
  const [stats, setStats] = useState({
    totalBytes: 0,
    totalPackets: 0,
    errorPackets: 0,
  });
  const [signalStats, setSignalStats] = useState<SignalStats | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [spectrumAnalysis, setSpectrumAnalysis] = useState<any>(null);
  const dataBufferRef = useRef<SerialData[]>([]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const port = await requestPort();
      if (port) {
        await connect(port);
        dataBufferRef.current = [];
        setParsedData([]);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setParsedData([]);
  };

  // 计算信号统计
  const calculateSignalStats = (data: SerialData[]): SignalStats => {
    if (data.length === 0) {
      return {
        ch1: { min: 0, max: 0, mean: 0, std: 0 },
        ch2: { min: 0, max: 0, mean: 0, std: 0 },
        ch3: { min: 0, max: 0, mean: 0, std: 0 },
      };
    }

    const ch1Values = data.map(d => d.channel1);
    const ch2Values = data.map(d => d.channel2);
    const ch3Values = data.map(d => d.channel3);

    const calculateStats = (values: number[]) => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);
      return { min, max, mean, std };
    };

    return {
      ch1: calculateStats(ch1Values),
      ch2: calculateStats(ch2Values),
      ch3: calculateStats(ch3Values),
    };
  };

  // 监听数据接收
  useEffect(() => {
    const handleDataReceived = (data: SerialData) => {
      dataBufferRef.current.push(data);
      setParsedData(prev => {
        const updated = [...prev, data];
        // 保留最后 500 条数据用于显示
        const trimmed = updated.slice(-500);
        // 更新信号统计
        setSignalStats(calculateSignalStats(trimmed));
        return trimmed;
      });
      setStats(prev => ({
        ...prev,
        totalPackets: prev.totalPackets + 1,
      }));
    };

    const unsubscribe = onDataReceived(handleDataReceived);
    return unsubscribe;
  }, [onDataReceived]);

  // 导出为 JSON
  const handleExportJSON = () => {
    if (dataBufferRef.current.length === 0) {
      setExportMessage('❌ 没有数据可导出');
      setTimeout(() => setExportMessage(''), 3000);
      return;
    }

    setIsExporting(true);
    try {
      const exportData = {
        exportTime: new Date().toISOString(),
        totalPackets: dataBufferRef.current.length,
        samplingRate: 250, // Hz
        duration: (dataBufferRef.current.length / HARDWARE_CONFIG.SAMPLE_RATE).toFixed(2) + 's',
        data: dataBufferRef.current,
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `emg-data-${new Date().getTime()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportMessage(`✅ 已导出 ${dataBufferRef.current.length} 个数据包 (JSON)`);
      setTimeout(() => setExportMessage(''), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  // 导出为 CSV
  const handleExportCSV = () => {
    if (dataBufferRef.current.length === 0) {
      setExportMessage('❌ 没有数据可导出');
      setTimeout(() => setExportMessage(''), 3000);
      return;
    }

    setIsExporting(true);
    try {
      let csvContent = 'Timestamp,CH1,CH2,CH3,Time\n';
      
      dataBufferRef.current.forEach((data, idx) => {
        const time = new Date(data.timestamp).toLocaleTimeString();
        csvContent += `${idx},${data.channel1},${data.channel2},${data.channel3},${time}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `emg-data-${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportMessage(`✅ 已导出 ${dataBufferRef.current.length} 个数据包 (CSV)`);
      setTimeout(() => setExportMessage(''), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  // 清空数据
  const handleClearData = () => {
    dataBufferRef.current = [];
    setParsedData([]);
    setSignalStats(null);
    setExportMessage('');
  };

  return (
    <div className="min-h-screen" style={{
      color: '#fff',
      padding: '20px',
      fontFamily: 'monospace',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* 标题 */}
        <h1 style={{ fontSize: '28px', marginBottom: '20px', color: '#d4af37' }}>
          🔧 串口数据调试工具 - 实时分析
        </h1>

        {/* 连接状态 */}
        <div style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '16px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <p style={{ margin: '0 0 8px 0', color: '#888' }}>连接状态</p>
              <p style={{
                margin: '0',
                fontSize: '18px',
                fontWeight: 'bold',
                color: isConnected ? '#22c55e' : '#ef4444',
              }}>
                {isConnected ? '✓ 已连接' : '○ 未连接'}
              </p>
              {error && <p style={{ margin: '8px 0 0 0', color: '#ef4444', fontSize: '14px' }}>错误: {error}</p>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isConnecting ? '#888' : '#d4af37',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {isConnecting ? '连接中...' : '连接设备'}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleDisconnect}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#666',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    断开连接
                  </button>
                  <button
                    onClick={handleClearData}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#666',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    清空数据
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 数据导出按钮 */}
        {isConnected && (
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p style={{ margin: '0 0 8px 0', color: '#888' }}>已采集数据</p>
                <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#4ade80' }}>
                  {dataBufferRef.current.length} 个数据包 ({(dataBufferRef.current.length / HARDWARE_CONFIG.SAMPLE_RATE).toFixed(2)}s)
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleExportJSON}
                  disabled={isExporting || dataBufferRef.current.length === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: dataBufferRef.current.length === 0 ? '#666' : '#4ade80',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: dataBufferRef.current.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {isExporting ? '导出中...' : '📥 导出 JSON'}
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting || dataBufferRef.current.length === 0}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: dataBufferRef.current.length === 0 ? '#666' : '#4ade80',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: dataBufferRef.current.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  {isExporting ? '导出中...' : '📥 导出 CSV'}
                </button>
              </div>
            </div>
            {exportMessage && (
              <p style={{ margin: '12px 0 0 0', color: exportMessage.includes('✅') ? '#4ade80' : '#ef4444', fontSize: '14px' }}>
                {exportMessage}
              </p>
            )}
          </div>
        )}

        {/* 信号统计信息 */}
        {signalStats && (
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#d4af37' }}>📊 实时信号统计</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '16px',
            }}>
              {/* CH1 统计 */}
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '12px',
              }}>
                <p style={{ margin: '0 0 8px 0', color: '#888', fontSize: '12px' }}>CH1 (原始ADC)</p>
                <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#aaa' }}>
                  <div>Min: <span style={{ color: '#60a5fa' }}>{signalStats.ch1.min.toFixed(0)}</span></div>
                  <div>Max: <span style={{ color: '#60a5fa' }}>{signalStats.ch1.max.toFixed(0)}</span></div>
                  <div>Mean: <span style={{ color: '#60a5fa' }}>{signalStats.ch1.mean.toFixed(2)}</span></div>
                  <div>Std: <span style={{ color: '#60a5fa' }}>{signalStats.ch1.std.toFixed(2)}</span></div>
                </div>
              </div>

              {/* CH2 统计 */}
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #4ade80',
                borderRadius: '4px',
                padding: '12px',
              }}>
                <p style={{ margin: '0 0 8px 0', color: '#4ade80', fontSize: '12px' }}>CH2 (主信号 - 去偏置肌电)</p>
                <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#aaa' }}>
                  <div>Min: <span style={{ color: '#4ade80' }}>{signalStats.ch2.min.toFixed(0)}</span></div>
                  <div>Max: <span style={{ color: '#4ade80' }}>{signalStats.ch2.max.toFixed(0)}</span></div>
                  <div>Mean: <span style={{ color: '#4ade80' }}>{signalStats.ch2.mean.toFixed(2)}</span></div>
                  <div>Std: <span style={{ color: '#4ade80' }}>{signalStats.ch2.std.toFixed(2)}</span></div>
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333' }}>
                    <span style={{ color: '#888' }}>幅值范围: </span>
                    <span style={{ color: '#4ade80' }}>±{Math.max(Math.abs(signalStats.ch2.min), Math.abs(signalStats.ch2.max)).toFixed(0)}</span>
                  </div>
                </div>
              </div>

              {/* CH3 统计 */}
              <div style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                padding: '12px',
              }}>
                <p style={{ margin: '0 0 8px 0', color: '#888', fontSize: '12px' }}>CH3 (包络/辅助)</p>
                <div style={{ fontSize: '12px', lineHeight: '1.8', color: '#aaa' }}>
                  <div>Min: <span style={{ color: '#ef4444' }}>{signalStats.ch3.min.toFixed(0)}</span></div>
                  <div>Max: <span style={{ color: '#ef4444' }}>{signalStats.ch3.max.toFixed(0)}</span></div>
                  <div>Mean: <span style={{ color: '#ef4444' }}>{signalStats.ch3.mean.toFixed(2)}</span></div>
                  <div>Std: <span style={{ color: '#ef4444' }}>{signalStats.ch3.std.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 频谱分析 */}
        {spectrumAnalysis && (
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '20px',
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#d4af37' }}>📈 频谱分析 (CH2)</h3>
            <SpectrumDisplay analysis={spectrumAnalysis} title="实时频谱分析" />
          </div>
        )}

        {/* 解析后的数据显示 */}
        <div style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '4px',
          padding: '16px',
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#d4af37' }}>最新数据（最后 20 条）</h3>
          <p style={{ margin: '0 0 12px 0', color: '#888', fontSize: '12px' }}>CH1: 原始ADC（含直流偏置） | CH2: 去偏置肌电信号（主信号） | CH3: 包络/辅助值</p>
          <div style={{
            backgroundColor: '#000',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '12px',
            maxHeight: '400px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: '1.6',
          }}>
            {parsedData.length === 0 ? (
              <p style={{ color: '#888' }}>等待数据...</p>
            ) : (
              parsedData.slice(-20).map((data, idx) => (
                <div key={idx} style={{ color: '#0f0', marginBottom: '4px' }}>
                  <span style={{ color: '#888' }}>#{parsedData.length - 20 + idx + 1}</span> 
                  {' '}CH1: <span style={{ color: '#60a5fa' }}>{data.channel1.toString().padStart(6)}</span>
                  {' '}| CH2: <span style={{ color: '#4ade80' }}>{data.channel2.toString().padStart(6)}</span>
                  {' '}| CH3: <span style={{ color: '#ef4444' }}>{data.channel3.toString().padStart(6)}</span>
                  {' '}| {new Date(data.timestamp).toLocaleTimeString()}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 协议信息 */}
        <div style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #d4af37',
          borderRadius: '4px',
          padding: '16px',
          marginTop: '20px',
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#d4af37' }}>📋 协议信息</h3>
          <ul style={{ margin: '0', paddingLeft: '20px', color: '#888', lineHeight: '1.8', fontSize: '12px' }}>
            <li>帧格式：CC CC 01 06 [CH1_H] [CH1_L] [CH2_H] [CH2_L] [CH3_H] [CH3_L]（10字节）</li>
            <li>数据采用大端序 int16 格式（高字节在前）</li>
            <li style={{ color: '#4ade80' }}>CH2 是主信号（去偏置肌电信号），用于波形显示和特征提取</li>
            <li>CH1 含直流偏置（约 2000），CH3 为包络/辅助值</li>
            <li>采样率：250 Hz</li>
            <li style={{ marginTop: '8px', color: '#d4af37' }}>💡 导出数据后，可发送给我进行深度分析和滤波参数优化</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

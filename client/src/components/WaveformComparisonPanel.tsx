/**
 * 波形对比分析面板组件
 * 
 * 功能：
 * - 显示两个波形的对比
 * - 显示相似度和统计特征
 * - 可视化对比结果
 */

import React, { useState } from 'react';
import {
  compareWaveforms,
  compareMultipleWaveforms,
  ComparisonResult,
  generateComparisonReport,
} from '@/lib/waveform-comparison';

interface WaveformComparisonPanelProps {
  waveforms: Array<{
    index: number;
    ch1: number[];
    ch2: number[];
    ch3: number[];
  }>;
  onClose: () => void;
}

export function WaveformComparisonPanel({
  waveforms,
  onClose,
}: WaveformComparisonPanelProps) {
  const [selectedWaveforms, setSelectedWaveforms] = useState<number[]>([]);
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult | null>(null);
  const [activeChannel, setActiveChannel] = useState<'ch1' | 'ch2' | 'ch3'>('ch2');
  const [showMatrix, setShowMatrix] = useState(false);
  const [similarityMatrix, setSimilarityMatrix] = useState<number[][] | null>(null);

  const handleSelectWaveform = (index: number) => {
    if (selectedWaveforms.includes(index)) {
      setSelectedWaveforms(selectedWaveforms.filter((i) => i !== index));
    } else {
      setSelectedWaveforms([...selectedWaveforms, index]);
    }
  };

  const handleCompare = () => {
    if (selectedWaveforms.length === 2) {
      const w1 = waveforms[selectedWaveforms[0]];
      const w2 = waveforms[selectedWaveforms[1]];

      const channelData = activeChannel as 'ch1' | 'ch2' | 'ch3';
      const result = compareWaveforms(w1[channelData], w2[channelData]);
      setComparisonResults(result);
      setShowMatrix(false);
    } else if (selectedWaveforms.length > 2) {
      // 多波形对比
      const channelData = activeChannel as 'ch1' | 'ch2' | 'ch3';
      const waveformData = selectedWaveforms.map(
        (idx) => waveforms[idx][channelData]
      );
      const { similarities, averageSimilarity } = compareMultipleWaveforms(waveformData);
      setSimilarityMatrix(similarities);
      setShowMatrix(true);
      setComparisonResults(null);
    }
  };

  const handleExportReport = () => {
    if (comparisonResults && selectedWaveforms.length === 2) {
      const report = generateComparisonReport(
        `波形 #${selectedWaveforms[0]}`,
        `波形 #${selectedWaveforms[1]}`,
        comparisonResults
      );

      const element = document.createElement('a');
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(report));
      element.setAttribute('download', `waveform_comparison_${Date.now()}.txt`);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 85) return '#4ade80'; // 绿色 - 很相似
    if (similarity >= 70) return '#fbbf24'; // 黄色 - 相似
    if (similarity >= 50) return '#f97316'; // 橙色 - 一般
    return '#ef4444'; // 红色 - 差异大
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0a0a0a',
          border: '2px solid #d4af37',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: '#e5e5e5',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ margin: 0, color: '#d4af37', fontSize: '20px' }}>
            🔍 波形对比分析
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '24px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* 波形选择 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px', fontSize: '14px', color: '#d4af37', fontWeight: 'bold' }}>
            📋 选择波形（可多选）
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
              gap: '12px',
            }}
          >
            {waveforms.map((w) => (
              <button
                key={w.index}
                onClick={() => handleSelectWaveform(w.index)}
                style={{
                  padding: '12px',
                  backgroundColor: selectedWaveforms.includes(w.index)
                    ? '#d4af37'
                    : '#1a1a1a',
                  color: selectedWaveforms.includes(w.index) ? '#000' : '#d4af37',
                  border: `2px solid ${selectedWaveforms.includes(w.index) ? '#d4af37' : '#333'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                }}
              >
                #{w.index}
              </button>
            ))}
          </div>
        </div>

        {/* 通道选择 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px', fontSize: '14px', color: '#d4af37', fontWeight: 'bold' }}>
            🎛️ 选择通道
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {(['ch1', 'ch2', 'ch3'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: activeChannel === ch ? '#4ade80' : '#1a1a1a',
                  color: activeChannel === ch ? '#000' : '#4ade80',
                  border: `2px solid ${activeChannel === ch ? '#4ade80' : '#333'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {ch.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* 对比按钮 */}
        <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
          <button
            onClick={handleCompare}
            disabled={selectedWaveforms.length < 2}
            style={{
              padding: '12px 24px',
              backgroundColor: selectedWaveforms.length >= 2 ? '#4ade80' : '#666',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: selectedWaveforms.length >= 2 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
            }}
          >
            对比分析
          </button>
          <button
            onClick={handleExportReport}
            disabled={!comparisonResults}
            style={{
              padding: '12px 24px',
              backgroundColor: comparisonResults ? '#fbbf24' : '#666',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: comparisonResults ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
            }}
          >
            导出报告
          </button>
        </div>

        {/* 对比结果 - 单波形对比 */}
        {comparisonResults && !showMatrix && (
          <div
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
                📊 相似度指标
              </div>

              {/* 相似度进度条 */}
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    fontSize: '12px',
                  }}
                >
                  <span>相似度</span>
                  <span
                    style={{
                      color: getSimilarityColor(comparisonResults.similarity),
                      fontWeight: 'bold',
                    }}
                  >
                    {comparisonResults.similarity}%
                  </span>
                </div>
                <div
                  style={{
                    backgroundColor: '#0a0a0a',
                    height: '8px',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: getSimilarityColor(comparisonResults.similarity),
                      height: '100%',
                      width: `${comparisonResults.similarity}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* 其他指标 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    backgroundColor: '#0a0a0a',
                    padding: '12px',
                    borderRadius: '4px',
                    border: '1px solid #333',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                    相关系数
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#4ade80' }}>
                    {comparisonResults.correlation}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#0a0a0a',
                    padding: '12px',
                    borderRadius: '4px',
                    border: '1px solid #333',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                    均方根差
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fbbf24' }}>
                    {comparisonResults.rmsDifference}
                  </div>
                </div>
              </div>
            </div>

            {/* 统计特征对比 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
                  波形 #{selectedWaveforms[0]} 统计特征
                </div>
                <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.8' }}>
                  <div>均值: {Math.round(comparisonResults.stats1.mean * 100) / 100}</div>
                  <div>标准差: {Math.round(comparisonResults.stats1.std * 100) / 100}</div>
                  <div>最小值: {Math.round(comparisonResults.stats1.min * 100) / 100}</div>
                  <div>最大值: {Math.round(comparisonResults.stats1.max * 100) / 100}</div>
                  <div>均方根: {Math.round(comparisonResults.stats1.rms * 100) / 100}</div>
                  <div>峰峰值: {Math.round(comparisonResults.stats1.peakToPeak * 100) / 100}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
                  波形 #{selectedWaveforms[1]} 统计特征
                </div>
                <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.8' }}>
                  <div>均值: {Math.round(comparisonResults.stats2.mean * 100) / 100}</div>
                  <div>标准差: {Math.round(comparisonResults.stats2.std * 100) / 100}</div>
                  <div>最小值: {Math.round(comparisonResults.stats2.min * 100) / 100}</div>
                  <div>最大值: {Math.round(comparisonResults.stats2.max * 100) / 100}</div>
                  <div>均方根: {Math.round(comparisonResults.stats2.rms * 100) / 100}</div>
                  <div>峰峰值: {Math.round(comparisonResults.stats2.peakToPeak * 100) / 100}</div>
                </div>
              </div>
            </div>

            {/* 差异分析 */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
                📊 差异分析
              </div>
              <div style={{ fontSize: '12px', color: '#888', lineHeight: '1.8' }}>
                <div>
                  均值差异: {comparisonResults.differences.meanDiff}
                  <span style={{ color: '#fbbf24', marginLeft: '8px' }}>
                    ({Math.round((comparisonResults.differences.meanDiff / Math.max(Math.abs(comparisonResults.stats1.mean), Math.abs(comparisonResults.stats2.mean), 1)) * 100)}%)
                  </span>
                </div>
                <div>
                  标准差差异: {comparisonResults.differences.stdDiff}
                  <span style={{ color: '#fbbf24', marginLeft: '8px' }}>
                    ({Math.round((comparisonResults.differences.stdDiff / Math.max(comparisonResults.stats1.std, comparisonResults.stats2.std, 1)) * 100)}%)
                  </span>
                </div>
                <div>
                  峰峰值差异: {comparisonResults.differences.peakDiff}
                  <span style={{ color: '#fbbf24', marginLeft: '8px' }}>
                    ({Math.round((comparisonResults.differences.peakDiff / Math.max(comparisonResults.stats1.peakToPeak, comparisonResults.stats2.peakToPeak, 1)) * 100)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 对比结果 - 多波形相似度矩阵 */}
        {showMatrix && similarityMatrix && (
          <div
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '14px', color: '#d4af37', fontWeight: 'bold', marginBottom: '12px' }}>
              📊 相似度矩阵
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        padding: '8px',
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #333',
                        color: '#d4af37',
                      }}
                    >
                      波形
                    </th>
                    {selectedWaveforms.map((idx) => (
                      <th
                        key={idx}
                        style={{
                          padding: '8px',
                          backgroundColor: '#0a0a0a',
                          border: '1px solid #333',
                          color: '#d4af37',
                        }}
                      >
                        #{idx}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {similarityMatrix.map((row, i) => (
                    <tr key={i}>
                      <td
                        style={{
                          padding: '8px',
                          backgroundColor: '#0a0a0a',
                          border: '1px solid #333',
                          color: '#d4af37',
                          fontWeight: 'bold',
                        }}
                      >
                        #{selectedWaveforms[i]}
                      </td>
                      {row.map((similarity, j) => (
                        <td
                          key={j}
                          style={{
                            padding: '8px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            color: getSimilarityColor(similarity),
                            fontWeight: 'bold',
                            textAlign: 'center',
                          }}
                        >
                          {similarity}%
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: '#0a0a0a',
                borderRadius: '4px',
                border: '1px solid #333',
              }}
            >
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                平均相似度
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: getSimilarityColor(
                    similarityMatrix.flat().reduce((a, b) => a + b, 0) /
                      (similarityMatrix.length * similarityMatrix.length)
                  ),
                }}
              >
                {Math.round(
                  similarityMatrix.flat().reduce((a, b) => a + b, 0) /
                    (similarityMatrix.length * similarityMatrix.length)
                )}
                %
              </div>
            </div>
          </div>
        )}

        {/* 提示信息 */}
        {selectedWaveforms.length < 2 && !comparisonResults && !showMatrix && (
          <div
            style={{
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '4px',
              padding: '12px',
              color: '#c4b5fd',
              fontSize: '12px',
              textAlign: 'center',
            }}
          >
            💡 请选择至少 2 条波形进行对比分析
          </div>
        )}
      </div>
    </div>
  );
}

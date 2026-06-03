import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CollectionExportData, exportCollectionToJSON, exportCollectionToCSV, generateCollectionExportData } from '@/lib/collection-export';
import { Command } from '@/lib/collection-export';

interface CollectionExportPanelProps {
  command: Command;
  collectionIndex: number;
  recognitionResult?: {
    predictedCommand: string;
    confidence: number;
    isCorrect: boolean;
    processingTimeMs: number;
  };
  onExportComplete?: () => void;
}

export default function CollectionExportPanel({
  command,
  collectionIndex,
  recognitionResult,
  onExportComplete,
}: CollectionExportPanelProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportData, setExportData] = useState<CollectionExportData | null>(null);

  const handleGenerateExportData = async () => {
    try {
      setIsExporting(true);
      const data = generateCollectionExportData(command, collectionIndex, recognitionResult);
      setExportData(data);
      toast.success('✅ 数据生成成功');
    } catch (error) {
      console.error('生成导出数据失败:', error);
      toast.error(`❌ 生成数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJSON = () => {
    if (!exportData) {
      toast.error('请先生成数据');
      return;
    }
    try {
      exportCollectionToJSON(exportData);
      toast.success('✅ JSON文件导出成功');
    } catch (error) {
      console.error('导出JSON失败:', error);
      toast.error('❌ 导出JSON失败');
    }
  };

  const handleExportCSV = () => {
    if (!exportData) {
      toast.error('请先生成数据');
      return;
    }
    try {
      exportCollectionToCSV(exportData);
      toast.success('✅ CSV文件导出成功');
    } catch (error) {
      console.error('导出CSV失败:', error);
      toast.error('❌ 导出CSV失败');
    }
  };

  const handleExportBoth = () => {
    if (!exportData) {
      toast.error('请先生成数据');
      return;
    }
    try {
      exportCollectionToJSON(exportData);
      setTimeout(() => {
        exportCollectionToCSV(exportData);
      }, 500);
      toast.success('✅ JSON和CSV文件导出成功');
      onExportComplete?.();
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('❌ 导出失败');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>💾 采集数据导出</CardTitle>
        <CardDescription>导出完整的采集数据，包含两次裁剪的所有操作数据</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!exportData ? (
          <>
            <div className="bg-blue-950 p-3 rounded-lg text-sm text-blue-200 space-y-2">
              <p><strong>📋 导出包含的内容：</strong></p>
              <ul className="space-y-1 ml-4 text-xs">
                <li>✓ 原始波形数据（CH1、CH2、CH3）</li>
                <li>✓ 第一次裁剪（能量检测）的参数和结果</li>
                <li>✓ 第二次裁剪（固定长度）的参数和结果</li>
                <li>✓ 时长统计（原始 → 第一次 → 第二次）</li>
                <li>✓ 能量分析（阈值、置信度、峰值）</li>
                <li>✓ 质量评分和自动检测的问题</li>
                <li>✓ 识别结果（如果已进行识别）</li>
              </ul>
            </div>

            <Button
              onClick={handleGenerateExportData}
              disabled={isExporting}
              className="w-full"
            >
              {isExporting ? '生成中...' : '📊 生成导出数据'}
            </Button>
          </>
        ) : (
          <>
            <div className="bg-green-950 p-3 rounded-lg text-sm text-green-200 space-y-2">
              <p><strong>✅ 数据生成成功！</strong></p>
              <div className="text-xs space-y-1">
                <p>指令: <strong>{exportData.metadata.commandName}</strong></p>
                <p>原始时长: <strong>{exportData.timingStats.rawDurationMs.toFixed(0)}ms</strong></p>
                <p>第一次裁剪: <strong>{exportData.timingStats.afterFirstCroppingMs.toFixed(0)}ms</strong></p>
                <p>第二次裁剪: <strong>{exportData.timingStats.afterSecondCroppingMs.toFixed(0)}ms</strong></p>
                <p>质量评分: <strong>{exportData.qualityScore.score}%</strong></p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={handleExportJSON}
                variant="outline"
                className="w-full text-xs"
              >
                📄 JSON
              </Button>
              <Button
                onClick={handleExportCSV}
                variant="outline"
                className="w-full text-xs"
              >
                📊 CSV
              </Button>
              <Button
                onClick={handleExportBoth}
                className="w-full text-xs"
              >
                📦 全部
              </Button>
            </div>

            <Button
              onClick={() => setExportData(null)}
              variant="ghost"
              className="w-full text-xs"
            >
              🔄 重新生成
            </Button>

            {exportData.qualityScore.issues.length > 0 && exportData.qualityScore.issues[0] !== '✅ 未检测到明显问题' && (
              <div className="bg-yellow-950 p-3 rounded-lg text-xs text-yellow-200 space-y-1">
                <p><strong>⚠️ 检测到的问题：</strong></p>
                {exportData.qualityScore.issues.map((issue, idx) => (
                  <p key={idx}>• {issue}</p>
                ))}
              </div>
            )}

            {exportData.qualityScore.recommendations.length > 0 && exportData.qualityScore.recommendations[0] !== '✅ 数据质量良好' && (
              <div className="bg-slate-900 p-3 rounded-lg text-xs text-slate-300 space-y-1">
                <p><strong>💡 建议：</strong></p>
                {exportData.qualityScore.recommendations.map((rec, idx) => (
                  <p key={idx}>• {rec}</p>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

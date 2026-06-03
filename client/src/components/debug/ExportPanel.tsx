import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DebugData } from '@/pages/DebugPage';
import { exportToJSON, exportToCSV } from '@/lib/export-utils';
import { toast } from 'sonner';

interface ExportPanelProps {
  debugData: DebugData | null;
}

export default function ExportPanel({ debugData }: ExportPanelProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportJSON = async () => {
    if (!debugData) {
      toast.error('没有数据可导出');
      return;
    }

    try {
      setIsExporting(true);
      exportToJSON(debugData);
      toast.success('✅ JSON文件导出成功');
    } catch (error) {
      console.error('导出JSON失败:', error);
      toast.error('❌ 导出JSON失败');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!debugData) {
      toast.error('没有数据可导出');
      return;
    }

    try {
      setIsExporting(true);
      exportToCSV(debugData);
      toast.success('✅ CSV文件导出成功');
    } catch (error) {
      console.error('导出CSV失败:', error);
      toast.error('❌ 导出CSV失败');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportBoth = async () => {
    if (!debugData) {
      toast.error('没有数据可导出');
      return;
    }

    try {
      setIsExporting(true);
      exportToJSON(debugData);
      // 稍微延迟一下，避免浏览器同时下载两个文件时出现问题
      await new Promise((resolve) => setTimeout(resolve, 500));
      exportToCSV(debugData);
      toast.success('✅ JSON和CSV文件导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('❌ 导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>💾 数据导出</CardTitle>
        <CardDescription>导出完整的诊断数据用于分析</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!debugData ? (
          <p className="text-sm text-muted-foreground">请先加载数据后再导出</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                📋 导出格式说明：
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>• <strong>JSON</strong> - 包含所有原始数据和详细分析结果（推荐用于深度分析）</li>
                <li>• <strong>CSV</strong> - 表格格式，便于在Excel中查看和对比（推荐用于批量分析）</li>
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                onClick={handleExportJSON}
                disabled={isExporting}
                variant="outline"
                className="w-full"
              >
                {isExporting ? '导出中...' : '📄 JSON'}
              </Button>
              <Button
                onClick={handleExportCSV}
                disabled={isExporting}
                variant="outline"
                className="w-full"
              >
                {isExporting ? '导出中...' : '📊 CSV'}
              </Button>
              <Button
                onClick={handleExportBoth}
                disabled={isExporting}
                className="w-full"
              >
                {isExporting ? '导出中...' : '📦 全部'}
              </Button>
            </div>

            <div className="bg-slate-900 p-3 rounded-lg text-xs text-slate-300 space-y-1">
              <p><strong>📌 导出包含的内容：</strong></p>
              <ul className="space-y-1 ml-4">
                <li>✓ 原始波形数据（CH1、CH2、CH3）</li>
                <li>✓ 能量分析结果（阈值、置信度、峰值）</li>
                <li>✓ 裁切参数（起点、终点、长度）</li>
                <li>✓ 时长统计（原始、裁切、归一化）</li>
                <li>✓ 质量评分和分析</li>
                <li>✓ 自动检测的问题和建议</li>
              </ul>
            </div>

            <div className="bg-blue-950 p-3 rounded-lg text-xs text-blue-200 space-y-1">
              <p><strong>💡 使用建议：</strong></p>
              <ul className="space-y-1 ml-4">
                <li>• 采集5-10条不同指令的数据</li>
                <li>• 逐条导出分析结果</li>
                <li>• 将所有CSV文件汇总到Excel中进行对比</li>
                <li>• 基于分析结果调整采集参数</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

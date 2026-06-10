/**
 * 设置页面 - 数据管理、导出、用户会话
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertCircle,
  ChevronLeft,
  Download,
  Trash2,
  Users,
  FileJson,
  FileText,
} from 'lucide-react';
import { emgDatabase } from '@/lib/db';
import { HARDWARE_CONFIG } from '@/../../shared/const';
import {
  exportAndDownloadJSON,
  exportAndDownloadCSV,
  generateReport,
  downloadFile,
} from '@/lib/export-data';
import { ElectrodeBaselineCapture } from '@/components/ElectrodeBaselineCapture';
import { getRestingBaselineStats } from '@/lib/resting-baseline-utils';

export default function Settings() {
  const [, setLocation] = useLocation();
  const [trainingCount, setTrainingCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [baselineSummary, setBaselineSummary] = useState('未采集');

  const loadBaselineSummary = async () => {
    try {
      const baseline = await emgDatabase.getCalibration();
      const stats = getRestingBaselineStats(baseline);
      if (!stats) {
        setBaselineSummary('未采集');
        return;
      }
      const capturedAt = stats.capturedAt ? new Date(stats.capturedAt).toLocaleString() : '未知时间';
      setBaselineSummary(`${capturedAt} · ${stats.samplesCollected || 0} 样本 · ch2底噪 ${stats.ch2Std.toFixed(2)}`);
    } catch (err) {
      setBaselineSummary('读取失败');
    }
  };

  // 加载统计数据
  useEffect(() => {
    const loadStats = async () => {
      try {
        const trainingData = await emgDatabase.getAllTrainingData();
        const sessions = await emgDatabase.getAllSessions();
        setTrainingCount(trainingData.length);
        setSessionCount(sessions.length);
        await loadBaselineSummary();
      } catch (err) {
        const message = err instanceof Error ? err.message : '加载失败';
        setError(message);
      }
    };

    loadStats();
  }, []);

  const handleExportJSON = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      await exportAndDownloadJSON();
      setSuccess('JSON 数据已导出');
    } catch (err) {
      const message = err instanceof Error ? err.message : '导出失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      await exportAndDownloadCSV();
      setSuccess('CSV 数据已导出');
    } catch (err) {
      const message = err instanceof Error ? err.message : '导出失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      const report = await generateReport();
      const filename = `emg-report-${new Date().toISOString().split('T')[0]}.md`;
      downloadFile(report, filename);
      setSuccess('报告已生成');
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAllData = async () => {
    if (!window.confirm('确定要清空所有数据吗？此操作不可撤销。')) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      await emgDatabase.clearAllTrainingData();
      setTrainingCount(0);
      setSuccess('所有数据已清空');
    } catch (err) {
      const message = err instanceof Error ? err.message : '清空失败';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-100 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            className="text-gray-600"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-2xl font-semibold text-gray-900">设置</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        <Card className="mb-8 p-6 bg-gray-950 text-white border-gray-800">
          <h2 className="text-lg font-semibold mb-2">静息基线</h2>
          <p className="text-sm text-gray-400 mb-4">
            连接硬件后保持放松，采集 5 秒静息信号。训练采集、默念测试和后台底噪监测会使用这份基线。
          </p>
          <div className="mb-4 rounded border border-gray-800 bg-black p-3 text-sm text-gray-300">
            当前基线：{baselineSummary}
          </div>
          <ElectrodeBaselineCapture onComplete={loadBaselineSummary} />
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Data Statistics */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Users className="w-5 h-5" />
              数据统计
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-700">训练记录数</span>
                <span className="text-2xl font-bold text-blue-600">
                  {trainingCount}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-700">会话数</span>
                <span className="text-2xl font-bold text-green-600">
                  {sessionCount}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-700">数据库大小</span>
                <span className="text-lg font-semibold text-gray-900">
                  本地存储
                </span>
              </div>
            </div>
          </Card>

          {/* Export Options */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <Download className="w-5 h-5" />
              数据导出
            </h2>

            <div className="space-y-3">
              <Button
                onClick={handleExportJSON}
                disabled={isLoading || trainingCount === 0}
                className="w-full justify-start gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                variant="outline"
              >
                <FileJson className="w-4 h-4" />
                导出为 JSON
              </Button>

              <Button
                onClick={handleExportCSV}
                disabled={isLoading || trainingCount === 0}
                className="w-full justify-start gap-2 bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
                variant="outline"
              >
                <FileText className="w-4 h-4" />
                导出为 CSV
              </Button>

              <Button
                onClick={handleGenerateReport}
                disabled={isLoading || (trainingCount === 0 && sessionCount === 0)}
                className="w-full justify-start gap-2 bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200"
                variant="outline"
              >
                <FileText className="w-4 h-4" />
                生成报告
              </Button>
            </div>

            <p className="text-xs text-gray-600 mt-4">
              💡 导出数据可用于后续分析和演示记录
            </p>
          </Card>
        </div>

        {/* Data Management */}
        <Card className="mt-8 p-6 border-red-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            数据管理
          </h2>

          <p className="text-sm text-red-700 mb-4">
            危险操作：以下操作将永久删除数据，请谨慎使用。
          </p>

          <Button
            onClick={handleClearAllData}
            disabled={isLoading || trainingCount === 0}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            清空所有训练数据
          </Button>
        </Card>

        {/* System Information */}
        <Card className="mt-8 p-6 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            系统信息
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600">数据存储</p>
              <p className="font-medium text-gray-900 mt-1">IndexedDB</p>
            </div>
            <div>
              <p className="text-gray-600">采样率</p>
              <p className="font-medium text-gray-900 mt-1">{HARDWARE_CONFIG.SAMPLE_RATE} Hz</p>
            </div>
            <div>
              <p className="text-gray-600">电极数量</p>
              <p className="font-medium text-gray-900 mt-1">3 个</p>
            </div>
            <div>
              <p className="text-gray-600">指令总数</p>
              <p className="font-medium text-gray-900 mt-1">10 条</p>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

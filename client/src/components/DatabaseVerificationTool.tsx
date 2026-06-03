/**
 * 数据库验证工具
 * 用于从UI中验证IndexedDB中的数据是否真的被删除
 */

import React, { useState } from 'react';
import { emgDatabase } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

interface DatabaseStats {
  commands: number;
  recognitionRecords: number;
  trainingData: number;
  calibrationData: number;
  userAccounts: number;
  sessions: number;
  auditLogs: number;
  total: number;
}

export function DatabaseVerificationTool() {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<any>(null);

  // 获取数据库统计信息
  const checkDatabase = async () => {
    setLoading(true);
    try {
      const [
        commands,
        recognitionRecords,
        trainingData,
        calibrationData,
        userAccounts,
        sessions,
        auditLogs,
      ] = await Promise.all([
        emgDatabase.getAllCommands(),
        emgDatabase.getAllRecognitionRecords(),
        emgDatabase.getAllTrainingData?.() || Promise.resolve([]),
        emgDatabase.getCalibration?.() || Promise.resolve([]),
        emgDatabase.getAllUserAccounts?.() || Promise.resolve([]),
        emgDatabase.getAllSessions?.() || Promise.resolve([]),
        emgDatabase.getAllAuditLogs?.() || Promise.resolve([]),
      ]);

      const newStats: DatabaseStats = {
        commands: commands?.length || 0,
        recognitionRecords: recognitionRecords?.length || 0,
        trainingData: trainingData?.length || 0,
        calibrationData: calibrationData?.length || 0,
        userAccounts: userAccounts?.length || 0,
        sessions: sessions?.length || 0,
        auditLogs: auditLogs?.length || 0,
        total: 0,
      };

      newStats.total = Object.values(newStats).reduce((a, b) => a + b, 0) - 1; // 减去total本身

      setStats(newStats);
      setDetails({
        commands,
        recognitionRecords,
        trainingData,
        calibrationData,
        userAccounts,
        sessions,
        auditLogs,
      });

      console.log('[数据库验证] 统计信息:', newStats);
      toast.success(`数据库验证完成。总共 ${newStats.total} 条记录`);
    } catch (error) {
      console.error('[数据库验证失败]', error);
      toast.error(`数据库验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 导出详细数据
  const exportDetails = () => {
    if (!details) {
      toast.error('请先检查数据库');
      return;
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      stats,
      details,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `database-verification-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('数据已导出');
  };

  // 清空所有数据（危险操作）
  const clearAllData = async () => {
    if (!window.confirm('⚠️ 确认要清空所有数据？此操作不可撤销！')) {
      return;
    }

    if (!window.confirm('⚠️⚠️ 再次确认：真的要清空所有数据吗？')) {
      return;
    }

    setLoading(true);
    try {
      await emgDatabase.clearAllData();
      toast.success('所有数据已清空');
      setStats(null);
      setDetails(null);
      await checkDatabase();
    } catch (error) {
      console.error('[清空数据失败]', error);
      toast.error(`清空数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">🔍 数据库验证工具</h3>
        <p className="text-sm text-gray-600 mb-4">
          用于验证IndexedDB中的数据是否真的被删除。点击"检查数据库"查看当前存储的数据统计。
        </p>

        <div className="flex gap-2 mb-4">
          <Button
            onClick={checkDatabase}
            disabled={loading}
            variant="default"
          >
            {loading ? '检查中...' : '检查数据库'}
          </Button>
          <Button
            onClick={exportDetails}
            disabled={!details}
            variant="outline"
          >
            导出详细数据
          </Button>
          <Button
            onClick={clearAllData}
            disabled={loading}
            variant="destructive"
          >
            ⚠️ 清空所有数据
          </Button>
        </div>

        {stats && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-100 p-2 rounded">
                <div className="font-semibold">指令</div>
                <div className="text-lg">{stats.commands}</div>
              </div>
              <div className="bg-gray-100 p-2 rounded">
                <div className="font-semibold">识别记录</div>
                <div className="text-lg">{stats.recognitionRecords}</div>
              </div>
              <div className="bg-gray-100 p-2 rounded">
                <div className="font-semibold">训练数据</div>
                <div className="text-lg">{stats.trainingData}</div>
              </div>
              <div className="bg-gray-100 p-2 rounded">
                <div className="font-semibold">校准数据</div>
                <div className="text-lg">{stats.calibrationData}</div>
              </div>
              <div className="bg-gray-100 p-2 rounded">
                <div className="font-semibold">用户账户</div>
                <div className="text-lg">{stats.userAccounts}</div>
              </div>
              <div className="bg-gray-100 p-2 rounded">
                <div className="font-semibold">会话</div>
                <div className="text-lg">{stats.sessions}</div>
              </div>
              <div className="bg-gray-100 p-2 rounded">
                <div className="font-semibold">审计日志</div>
                <div className="text-lg">{stats.auditLogs}</div>
              </div>
              <div className="bg-blue-100 p-2 rounded font-bold">
                <div className="font-semibold">总计</div>
                <div className="text-lg">{stats.total}</div>
              </div>
            </div>

            {stats.total === 0 && (
              <div className="mt-4 p-3 bg-green-100 text-green-800 rounded">
                ✅ 数据库已完全清空！所有数据都已从存储中删除。
              </div>
            )}

            {stats.total > 0 && (
              <div className="mt-4 p-3 bg-yellow-100 text-yellow-800 rounded">
                ⚠️ 数据库中仍有 {stats.total} 条记录。
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 详细数据展示 */}
      {details && (
        <Card className="p-6">
          <h4 className="font-bold mb-2">📊 详细数据</h4>
          <div className="max-h-96 overflow-y-auto bg-gray-50 p-3 rounded text-xs font-mono">
            <pre>{JSON.stringify(details, null, 2)}</pre>
          </div>
        </Card>
      )}
    </div>
  );
}

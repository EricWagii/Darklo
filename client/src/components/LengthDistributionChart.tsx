/**
 * 长度分布直方图组件
 * 
 * 显示采集时长的分布直方图，包括：
 * - 直方图条形图
 * - 规范范围标记
 * - 统计信息卡片
 * - 异常采集提示
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Card } from '@/components/PremiumComponents';
import { LengthDistributionStats, HistogramBucket } from '@/lib/length-distribution-analysis';

interface LengthDistributionChartProps {
  stats: LengthDistributionStats;
  height?: number;
}

export const LengthDistributionChart: React.FC<LengthDistributionChartProps> = ({
  stats,
  height = 400,
}) => {
  if (!stats.spec) {
    return (
      <Card className="p-6 bg-yellow-50 border border-yellow-200">
        <div className="space-y-3">
          <p className="text-yellow-800 font-semibold">⚠️ 指令规范自动生成中</p>
          <p className="text-yellow-700 text-sm">
            系统未找到该指令的预定义规范，已自动生成默认规范。
          </p>
          <p className="text-yellow-700 text-sm">
            如需自定义规范，请在 <code className="bg-yellow-100 px-2 py-1 rounded">shared/instruction-length-spec.ts</code> 中添加。
          </p>
        </div>
      </Card>
    );
  }

  const { histogram, spec, validPercentage, averageDurationMs, medianDurationMs, stdDeviation, outliers } = stats;

  // 准备直方图数据
  const chartData = histogram.map((bucket) => ({
    name: bucket.label,
    count: bucket.count,
    percentage: bucket.percentage,
    isInSpec: bucket.isInSpec,
  }));

  // 颜色映射
  const getBarColor = (isInSpec: boolean) => {
    return isInSpec ? '#10b981' : '#ef4444'; // 绿色（符合规范）或红色（不符合）
  };

  return (
    <div className="space-y-6">
      {/* 统计信息卡片 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="采集总数"
          value={stats.totalCollections}
          unit="次"
        />
        <StatCard
          label="符合规范"
          value={`${stats.validCollections}/${stats.totalCollections}`}
          unit={`(${validPercentage.toFixed(1)}%)`}
          highlight={validPercentage >= 80}
        />
        <StatCard
          label="平均时长"
          value={averageDurationMs.toFixed(0)}
          unit="ms"
        />
        <StatCard
          label="推荐时长"
          value={spec.recommendedDurationMs}
          unit="ms"
        />
      </div>

      {/* 直方图 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">采集时长分布</h3>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
              tick={{ fontSize: 12 }}
            />
            <YAxis label={{ value: '采集次数', angle: -90, position: 'insideLeft' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
              formatter={(value: any) => `${value} 次`}
            />
            <Legend />
            <Bar dataKey="count" name="采集次数" radius={[8, 8, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.isInSpec)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* 规范范围说明 */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600 mb-2">
            <span className="inline-block w-4 h-4 bg-green-500 rounded mr-2"></span>
            绿色区域：符合规范范围 ({spec.minDurationMs}-{spec.maxDurationMs}ms)
          </p>
          <p className="text-sm text-gray-600">
            <span className="inline-block w-4 h-4 bg-red-500 rounded mr-2"></span>
            红色区域：超出规范范围
          </p>
        </div>
      </Card>

      {/* 详细统计信息 */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">详细统计</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <DetailItem label="最小时长" value={`${stats.minDurationMs.toFixed(0)}ms`} />
          <DetailItem label="最大时长" value={`${stats.maxDurationMs.toFixed(0)}ms`} />
          <DetailItem label="中位数" value={`${medianDurationMs.toFixed(0)}ms`} />
          <DetailItem label="标准差" value={`${stdDeviation.toFixed(0)}ms`} />
          <DetailItem label="符合规范" value={`${validPercentage.toFixed(1)}%`} />
          <DetailItem label="异常采集" value={`${outliers.length} 个`} />
        </div>
      </Card>

      {/* 异常采集提示 */}
      {outliers.length > 0 && (
        <Card className="p-6 bg-yellow-50 border border-yellow-200">
          <h3 className="text-lg font-semibold mb-4 text-yellow-900">⚠️ 异常采集</h3>
          <div className="space-y-2">
            {outliers.slice(0, 5).map((outlier) => (
              <p key={outlier.index} className="text-sm text-yellow-800">
                采集 #{outlier.index + 1}: {outlier.durationMs.toFixed(0)}ms - {outlier.reason}
              </p>
            ))}
            {outliers.length > 5 && (
              <p className="text-sm text-yellow-800">... 还有 {outliers.length - 5} 个异常采集</p>
            )}
          </div>
        </Card>
      )}

      {/* 建议 */}
      <Card className="p-6 bg-blue-50 border border-blue-200">
        <h3 className="text-lg font-semibold mb-2 text-blue-900">💡 建议</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          {validPercentage < 80 && (
            <li>• 符合规范的采集比例较低，建议重新采集不符合规范的数据</li>
          )}
          {stdDeviation > 100 && (
            <li>• 采集时长波动较大，建议保持一致的发音速度</li>
          )}
          {validPercentage >= 80 && stdDeviation <= 100 && (
            <li>✓ 采集质量良好，数据可用于模型训练</li>
          )}
        </ul>
      </Card>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, unit, highlight }) => (
  <div className={`p-4 rounded-lg border ${highlight ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
    <p className="text-sm text-gray-600 mb-1">{label}</p>
    <p className={`text-2xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>
      {value}
      {unit && <span className="text-sm ml-1">{unit}</span>}
    </p>
  </div>
);

interface DetailItemProps {
  label: string;
  value: string;
}

const DetailItem: React.FC<DetailItemProps> = ({ label, value }) => (
  <div className="p-3 bg-gray-50 rounded-lg">
    <p className="text-sm text-gray-600 mb-1">{label}</p>
    <p className="text-lg font-semibold text-gray-900">{value}</p>
  </div>
);

export default LengthDistributionChart;

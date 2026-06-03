/**
 * 异常波形提示对话框
 * 
 * 功能：
 * - 显示检测到的异常波形列表
 * - 提供一键删除异常波形的功能
 * - 显示删除前后的波形数量对比
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, Trash2, Check } from 'lucide-react';

export interface AnomalyWaveform {
  collectionIndex: number;
  reason: string;
  qualityScore: number;
  recommendation: string;
}

interface AnomalyPromptDialogProps {
  isOpen: boolean;
  commandName: string;
  anomalies: AnomalyWaveform[];
  totalWaveforms: number;
  onConfirm: (indicesToDelete: number[]) => void;
  onCancel: () => void;
}

export function AnomalyPromptDialog({
  isOpen,
  commandName,
  anomalies,
  totalWaveforms,
  onConfirm,
  onCancel,
}: AnomalyPromptDialogProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(anomalies.map(a => a.collectionIndex))
  );

  // 当anomalies或isOpen变化时重置selectedIndices
  useEffect(() => {
    if (isOpen) {
      setSelectedIndices(new Set(anomalies.map(a => a.collectionIndex)));
    }
  }, [anomalies, isOpen]);

  const handleToggleSelection = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedIndices(new Set(anomalies.map(a => a.collectionIndex)));
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIndices).sort((a, b) => a - b));
  };

  const remainingWaveforms = totalWaveforms - selectedIndices.size;
  const deletionRate = selectedIndices.size > 0 ? ((selectedIndices.size / totalWaveforms) * 100).toFixed(1) : '0';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            检测到异常波形
          </DialogTitle>
          <DialogDescription>
            指令 "{commandName}" 中检测到 {anomalies.length} 个异常波形。
            您可以选择删除这些异常波形，或保留它们。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 统计信息 */}
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600">总采集数</div>
                <div className="text-2xl font-bold text-blue-600">{totalWaveforms}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">待删除</div>
                <div className="text-2xl font-bold text-red-600">{selectedIndices.size}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">保留数</div>
                <div className="text-2xl font-bold text-green-600">{remainingWaveforms}</div>
              </div>
            </div>
            {selectedIndices.size > 0 && (
              <div className="mt-3 text-sm text-gray-700">
                删除率: {deletionRate}% (需要至少保留 1 个波形)
              </div>
            )}
          </Card>

          {/* 异常波形列表 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm">异常波形列表</h3>
              <div className="space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAll}
                  className="text-xs"
                >
                  全选
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDeselectAll}
                  className="text-xs"
                >
                  取消选择
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3 bg-gray-50">
              {anomalies.map((anomaly) => (
                <div
                  key={anomaly.collectionIndex}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedIndices.has(anomaly.collectionIndex)
                      ? 'bg-red-100 border-red-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => handleToggleSelection(anomaly.collectionIndex)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(anomaly.collectionIndex)}
                      onChange={() => handleToggleSelection(anomaly.collectionIndex)}
                      className="mt-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">
                          采集 #{anomaly.collectionIndex + 1}
                        </div>
                        <div className="text-xs font-semibold">
                          质量评分: {(anomaly.qualityScore * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        <div>原因: {anomaly.reason}</div>
                        {anomaly.recommendation && (
                          <div className="text-blue-600 mt-1">建议: {anomaly.recommendation}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 提示信息 */}
          <Card className="p-3 bg-amber-50 border-amber-200">
            <div className="text-sm text-amber-800">
              <div className="font-semibold mb-1">⚠️ 提示</div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>删除异常波形可以提高模型的识别准确率</li>
                <li>至少需要保留 1 个波形</li>
                <li>删除操作不可撤销，请谨慎选择</li>
              </ul>
            </div>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            取消，不删除
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIndices.size === 0 || remainingWaveforms < 1}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            删除选中的 {selectedIndices.size} 个异常波形
          </Button>
          <Button
            onClick={() => onConfirm([])}
            variant="secondary"
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            保留所有波形，继续保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

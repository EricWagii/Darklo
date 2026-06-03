import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Info } from 'lucide-react';
import type { DynamicCroppingResult } from '@/lib/improved-dynamic-cropping';

interface CroppingFailureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  croppingResult: DynamicCroppingResult | null;
  onRetry: () => void;
  onIgnore: () => void;
}

export function CroppingFailureDialog({
  open,
  onOpenChange,
  croppingResult,
  onRetry,
  onIgnore,
}: CroppingFailureDialogProps) {
  if (!croppingResult) return null;

  const { diagnostics, qualityReason } = croppingResult;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            波形裁剪失败
          </DialogTitle>
          <DialogDescription>
            系统无法正确裁剪采集的波形。请查看以下诊断信息。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 失败原因 */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>失败原因：</strong> {qualityReason || '未知原因'}
            </AlertDescription>
          </Alert>

          {/* 能量统计 */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Info className="h-4 w-4" />
              能量统计信息
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">最小能量：</span>
                <span className="font-mono ml-2">
                  {diagnostics.energyStats.min.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">最大能量：</span>
                <span className="font-mono ml-2">
                  {diagnostics.energyStats.max.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">平均能量：</span>
                <span className="font-mono ml-2">
                  {diagnostics.energyStats.mean.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">标准差：</span>
                <span className="font-mono ml-2">
                  {diagnostics.energyStats.stdDev.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">中位数：</span>
                <span className="font-mono ml-2">
                  {diagnostics.energyStats.median.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">能量范围：</span>
                <span className="font-mono ml-2">
                  {(diagnostics.energyStats.max - diagnostics.energyStats.min).toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          {/* 裁剪参数 */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <h4 className="font-semibold mb-3">裁剪参数</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">使用的阈值：</span>
                <span className="font-mono ml-2">
                  {diagnostics.threshold.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">阈值计算方法：</span>
                <span className="ml-2">{diagnostics.thresholdReason}</span>
              </div>
              <div>
                <span className="text-muted-foreground">前空白长度：</span>
                <span className="font-mono ml-2">
                  {diagnostics.frontBlankLength} 样本
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">后空白长度：</span>
                <span className="font-mono ml-2">
                  {diagnostics.rearBlankLength} 样本
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">有效段长度：</span>
                <span className="font-mono ml-2">
                  {diagnostics.validSegmentLength} 样本
                </span>
              </div>
            </div>
          </div>

          {/* 中间低能量区域 */}
          {diagnostics.midLowEnergyRegions.length > 0 && (
            <div className="rounded-lg border p-4 bg-muted/50">
              <h4 className="font-semibold mb-3">
                中间低能量区域（{diagnostics.midLowEnergyRegions.length} 个）
              </h4>
              <div className="space-y-2 text-sm max-h-40 overflow-y-auto">
                {diagnostics.midLowEnergyRegions.map((region, idx) => (
                  <div key={idx} className="p-2 bg-background rounded border">
                    <div className="font-mono">
                      [{region.startIdx}, {region.endIdx}]
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {region.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 建议 */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>建议：</strong>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>检查硬件连接是否正常</li>
                <li>确保肌肉放松，然后重新采集</li>
                <li>尝试调整传感器位置</li>
                <li>如果问题持续，请联系技术支持</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onIgnore()}>
            忽略并继续
          </Button>
          <Button onClick={() => onRetry()}>
            重新采集
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

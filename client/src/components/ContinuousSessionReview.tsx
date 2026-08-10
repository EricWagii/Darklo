import React, { useMemo } from 'react';
import { Check, CircleX, FilePenLine } from 'lucide-react';
import { Button } from '@/components/PremiumComponents';
import type { StreamEvent } from '@/lib/continuous-stream-segmenter';
import { encodeMorseReference } from '@/lib/morse-code';
import type {
  ContinuousEvaluationMode,
  ContinuousEventCorrection,
  ContinuousReviewVerdict,
  ContinuousSessionEvaluation,
  EventCorrectionLabel,
} from '@/lib/continuous-session-evaluation';

interface ContinuousSessionReviewProps {
  mode: ContinuousEvaluationMode;
  targetText: string;
  predictedText: string;
  actualText: string;
  reviewOpen: boolean;
  locked: boolean;
  evaluation: ContinuousSessionEvaluation | null;
  events: readonly StreamEvent[];
  eventCorrections: readonly ContinuousEventCorrection[];
  onModeChange: (mode: ContinuousEvaluationMode) => void;
  onTargetTextChange: (value: string) => void;
  onActualTextChange: (value: string) => void;
  onSubmit: (verdict: ContinuousReviewVerdict) => void;
  onEventCorrection: (event: StreamEvent, label: EventCorrectionLabel | null) => void;
}

const correctionLabels: readonly { value: EventCorrectionLabel; label: string }[] = [
  { value: 'dot', label: '点' },
  { value: 'dash', label: '划' },
  { value: 'boundary', label: '字符边界' },
  { value: 'artifact', label: '伪迹' },
];

const formatPercent = (value: number | null) => value === null ? '无真实标签' : `${(value * 100).toFixed(1)}%`;

const eventDisplay = (event: StreamEvent) => {
  if (event.kind === 'symbol-pending') return event.symbol === '.' ? '点' : '划';
  if (event.kind === 'confirmed-boundary' || event.kind === 'candidate-boundary') return '边界';
  if (event.kind === 'discarded') return '舍弃';
  return '不确定';
};

export function ContinuousSessionReview({
  mode,
  targetText,
  predictedText,
  actualText,
  reviewOpen,
  locked,
  evaluation,
  events,
  eventCorrections,
  onModeChange,
  onTargetTextChange,
  onActualTextChange,
  onSubmit,
  onEventCorrection,
}: ContinuousSessionReviewProps) {
  const correctionByEvent = useMemo(
    () => new Map(eventCorrections.map((correction) => [correction.eventId, correction.correctedLabel])),
    [eventCorrections]
  );
  const correctableEvents = useMemo(
    () => events
      .filter((event) => ['symbol-pending', 'candidate-boundary', 'confirmed-boundary', 'uncertain', 'discarded'].includes(event.kind))
      .slice(-20)
      .reverse(),
    [events]
  );
  const targetMorseReference = useMemo(
    () => encodeMorseReference(targetText),
    [targetText]
  );

  return (
    <div className="space-y-5" data-role="continuous-session-review">
      <div>
        <div className="label mb-3">评估协议</div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === 'scripted' ? 'primary' : 'secondary'}
            disabled={locked}
            onClick={() => onModeChange('scripted')}
          >
            脚本评估
          </Button>
          <Button
            variant={mode === 'free' ? 'primary' : 'secondary'}
            disabled={locked}
            onClick={() => onModeChange('free')}
          >
            自由输入
          </Button>
        </div>
      </div>

      {mode === 'scripted' && (
        <div>
          <label className="block text-sm text-secondary">
            目标文本
            <input
              className="input mt-2 font-mono uppercase"
              style={{ letterSpacing: 0 }}
              value={targetText}
              disabled={locked}
              placeholder="例如 SOS 或 DARKLO27"
              onChange={(event) => onTargetTextChange(event.target.value)}
            />
          </label>
          {targetMorseReference.length > 0 && (
            <div className="mt-3" data-role="target-morse-reference">
              <div className="mb-2 text-xs text-secondary">目标编码</div>
              <div
                className="overflow-x-auto border px-2 py-2"
                style={{ borderColor: '#263226', backgroundColor: '#080b08' }}
                aria-label="目标文本对应的摩斯编码"
              >
                <div className="flex min-w-max items-stretch font-mono" style={{ letterSpacing: 0 }}>
                  {targetMorseReference.map((token, index) => (
                    <div
                      key={`${index}-${token.character}`}
                      className={`flex min-w-14 shrink-0 flex-col items-center justify-center border-r px-3 py-1 last:border-r-0 ${
                        token.kind === 'unsupported' ? 'text-orange-400' : token.kind === 'word-boundary' ? 'text-secondary' : 'text-lime-300'
                      }`}
                      style={{ borderColor: '#263226' }}
                      title={token.kind === 'unsupported' ? `${token.character} 暂不支持` : undefined}
                    >
                      <span className="text-xs font-semibold">{token.kind === 'word-boundary' ? '空格' : token.character}</span>
                      <span className="mt-1 text-sm">{token.code}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {reviewOpen && (
        <div className="border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: '#0b0d0c' }}>
          <div className="label mb-4">会话复核</div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs text-secondary">系统识别</div>
              <div className="mt-2 min-h-11 border px-3 py-2 font-mono uppercase text-lime-300" style={{ borderColor: '#263226', letterSpacing: 0 }}>
                {predictedText || '空结果'}
              </div>
            </div>
            {mode === 'scripted' && (
              <div>
                <div className="text-xs text-secondary">目标文本</div>
                <div className="mt-2 min-h-11 border px-3 py-2 font-mono uppercase" style={{ borderColor: 'var(--color-border)', letterSpacing: 0 }}>
                  {targetText || '尚未设置'}
                </div>
              </div>
            )}
          </div>
          <label className="mt-4 block text-sm text-secondary">
            实际文本
            <textarea
              className="input mt-2 min-h-20 w-full font-mono uppercase"
              style={{ letterSpacing: 0 }}
              value={actualText}
              placeholder="确认或填写受试者实际输入的字符"
              onChange={(event) => onActualTextChange(event.target.value)}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="success" onClick={() => onSubmit('correct')}>
              <Check size={15} className="mr-2 inline" />识别正确
            </Button>
            <Button variant="primary" disabled={!actualText.trim()} onClick={() => onSubmit('corrected')}>
              <FilePenLine size={15} className="mr-2 inline" />提交修正
            </Button>
            <Button variant="error" onClick={() => onSubmit('rejected')}>
              <CircleX size={15} className="mr-2 inline" />标记无效
            </Button>
          </div>
        </div>
      )}

      {evaluation && !evaluation.includeInAccuracy && (
        <div className="border p-3 text-sm text-orange-400" style={{ borderColor: '#713f12' }}>
          本次会话已标记无效：保留原始数据用于诊断，但不计入准确率汇总。
        </div>
      )}

      {evaluation?.includeInAccuracy && (
        <div className="grid gap-3 sm:grid-cols-3" data-role="continuous-evaluation-metrics">
          <div className="border p-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-xs text-secondary">字符准确率</div>
            <div className="mt-1 text-xl text-success">{formatPercent(evaluation.metrics.characterAccuracy)}</div>
          </div>
          <div className="border p-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-xs text-secondary">字符错误率 CER</div>
            <div className="mt-1 text-xl">{formatPercent(evaluation.metrics.cer)}</div>
          </div>
          <div className="border p-3" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-xs text-secondary">编辑距离</div>
            <div className="mt-1 text-xl">{evaluation.metrics.editDistance}</div>
          </div>
        </div>
      )}

      <details className="border p-4" style={{ borderColor: 'var(--color-border)' }}>
        <summary className="cursor-pointer text-sm text-secondary">事件级纠错（可选）</summary>
        <p className="mt-3 text-xs text-secondary">只记录真实标签，不改变当前解码输出。用于判断错误发生在事件检测还是字符解码。</p>
        <div className="mt-4 max-h-60 space-y-2 overflow-auto">
          {correctableEvents.length === 0 && <div className="text-sm text-secondary">暂无可纠正事件</div>}
          {correctableEvents.map((event) => (
            <div key={event.id} className="flex items-center justify-between gap-4 border-b pb-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
              <span>{new Date(event.at).toLocaleTimeString()} · 系统：{eventDisplay(event)}</span>
              <select
                className="input max-w-40 py-1 text-sm"
                aria-label={`纠正事件 ${event.id}`}
                value={correctionByEvent.get(event.id) ?? ''}
                onChange={(changeEvent) => onEventCorrection(event, (changeEvent.target.value || null) as EventCorrectionLabel | null)}
              >
                <option value="">不纠正</option>
                {correctionLabels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

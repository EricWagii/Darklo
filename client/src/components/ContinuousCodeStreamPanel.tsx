import React, { useEffect, useMemo, useRef } from 'react';
import '@fontsource/jetbrains-mono/400.css';
import { RotateCcw, Scissors, Undo2 } from 'lucide-react';
import { ContinuousEmgWaveform } from '@/components/ContinuousEmgWaveform';
import { Button } from '@/components/PremiumComponents';
import type { StreamEvent, StreamState } from '@/lib/continuous-stream-segmenter';

interface ContinuousWaveformView {
  rawSamples: number[];
  envelopeSamples: number[];
  startThreshold: number;
  endThreshold: number;
  isActive: boolean;
}

interface ContinuousCodeStreamPanelProps {
  decodedText: string;
  pendingSymbols: string;
  events: readonly StreamEvent[];
  status: StreamState['status'];
  standbyLabel: string;
  waveform: ContinuousWaveformView;
  onForceSplit: () => void;
  onUndo: () => void;
  onClear: () => void;
}

const fontStyle = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', letterSpacing: 0 };

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.toLocaleTimeString([], { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
};

const eventSymbol = (event: StreamEvent) => {
  if (event.kind === 'symbol-pending') return event.symbol === '.' ? '•' : '−';
  if (event.kind === 'candidate-boundary') return '¦';
  if (event.kind === 'confirmed-boundary') return '|';
  if (event.kind === 'uncertain') return '?';
  if (event.kind === 'discarded') return '×';
  return null;
};

export function ContinuousCodeStreamPanel({
  decodedText,
  pendingSymbols,
  events,
  status,
  standbyLabel,
  waveform,
  onForceSplit,
  onUndo,
  onClear,
}: ContinuousCodeStreamPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveTailRef = useRef<HTMLDivElement>(null);
  const decodedOutputRef = useRef<HTMLDivElement>(null);
  const visibleEvents = useMemo(
    () => events.filter((event) => eventSymbol(event) !== null),
    [events]
  );
  const symbolEvents = visibleEvents.filter((event) => event.kind === 'symbol-pending');
  const pendingIds = new Set(symbolEvents.slice(-pendingSymbols.length).map((event) => event.id));
  const latestPendingId = symbolEvents.at(-1)?.id;

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [events.length]);

  useEffect(() => {
    const element = liveTailRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [pendingSymbols]);

  useEffect(() => {
    const element = decodedOutputRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [decodedText]);

  return (
    <div
      className="border bg-black/80 p-4"
      style={{ borderColor: '#263226', ...fontStyle }}
      data-font="jetbrains-mono"
    >
      <style>{`
        @keyframes terminal-caret { 0%, 46% { opacity: 1; } 47%, 100% { opacity: .12; } }
        @keyframes pending-glow { 0%,100% { text-shadow: 0 0 4px rgba(132,255,80,.45); } 50% { text-shadow: 0 0 11px rgba(132,255,80,.95); } }
      `}</style>

      <div className="mb-3 text-[11px] uppercase text-lime-300/65">Biomedical · continuous EMG Morse input</div>
      <div className="border px-4 py-3" style={{ borderColor: '#263226', backgroundColor: '#030704' }}>
        <div className="text-[11px] uppercase text-lime-300/70">Decoded output</div>
        <div className="mt-3 flex min-h-14 min-w-0 items-center overflow-hidden">
          <div
            ref={decodedOutputRef}
            className="min-w-0 overflow-x-auto whitespace-nowrap"
            data-role="decoded-output-strip"
          >
            <div className="flex w-max min-w-0 items-center text-2xl font-normal uppercase text-lime-300 md:text-3xl" style={fontStyle}>
              <span>{decodedText.toUpperCase() || standbyLabel}</span>
              <span
                className="ml-1 inline-block h-8 w-[2px] shrink-0 bg-lime-300 shadow-[0_0_9px_rgba(132,255,80,.9)] md:h-9"
                style={{ animation: 'terminal-caret 1.05s steps(1, end) infinite' }}
                data-role="typing-caret"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3" data-role="integrated-emg-waveform">
        <ContinuousEmgWaveform {...waveform} />
      </div>

      <div
        className="mt-3 flex h-24 min-w-0 items-stretch border"
        style={{ borderColor: '#263226' }}
        data-layout="compact-single-line"
      >
        <div className="w-[38%] min-w-0 max-w-[34rem] shrink-0 border-r px-3 py-2" style={{ borderColor: '#263226' }}>
          <div className="text-[10px] uppercase text-lime-300/65">Live tail</div>
          <div
            ref={liveTailRef}
            className="mt-3 overflow-x-auto whitespace-nowrap text-lg text-lime-300"
            aria-label="当前未决点划"
            data-role="live-tail-strip"
          >
            {pendingSymbols || '—'}
          </div>
          <div className="mt-2 text-[9px] uppercase text-lime-300/45">{status}</div>
        </div>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto px-3 py-2" aria-label="完整点划输入流">
          <div className="mb-2 flex items-center justify-between gap-4 whitespace-nowrap">
            <span className="text-[10px] uppercase text-lime-300/65">Event history</span>
            <span className="text-[9px] text-lime-300/45">● pending · white committed · ? uncertain · × discarded</span>
          </div>
          <div className="flex min-w-max items-start gap-2 whitespace-nowrap">
            {visibleEvents.length === 0 && <span className="text-xs text-slate-500">等待肌电事件</span>}
            {visibleEvents.map((streamEvent) => {
              const pending = streamEvent.kind === 'symbol-pending' && pendingIds.has(streamEvent.id);
              const committed = streamEvent.kind === 'symbol-pending' && !pending;
              const state = pending
                ? 'pending'
                : committed
                  ? 'committed'
                  : streamEvent.kind === 'uncertain'
                    ? 'uncertain'
                    : streamEvent.kind === 'discarded'
                      ? 'discarded'
                      : streamEvent.kind;
              const color = pending
                ? 'text-lime-300'
                : committed || streamEvent.kind === 'confirmed-boundary'
                  ? 'text-slate-100'
                  : streamEvent.kind === 'uncertain'
                    ? 'text-amber-300'
                    : streamEvent.kind === 'discarded'
                      ? 'text-orange-500'
                      : 'text-emerald-200/45';
              const latest = pending && streamEvent.id === latestPendingId;
              return (
                <span key={streamEvent.id} className="inline-flex w-12 shrink-0 flex-col items-center" data-state={state} data-latest={latest || undefined}>
                  <span
                    className={`h-5 text-sm leading-5 ${color}`}
                    style={latest ? { animation: 'pending-glow 1s ease-in-out infinite' } : undefined}
                  >
                    {eventSymbol(streamEvent)}
                  </span>
                  <span className="mt-1 text-[8px] text-emerald-200/35">{formatTime(streamEvent.at)}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <span title="强制结束当前未决尾段">
          <Button onClick={onForceSplit} disabled={!pendingSymbols}>
            <Scissors size={15} aria-hidden="true" /><span className="ml-2">强制分隔</span>
          </Button>
        </span>
        <span title="撤销最近输入">
          <Button onClick={onUndo}>
            <Undo2 size={15} aria-hidden="true" /><span className="ml-2">撤销</span>
          </Button>
        </span>
        <span title="清空本次输出">
          <Button variant="error" onClick={onClear}>
            <RotateCcw size={15} aria-hidden="true" /><span className="ml-2">清空</span>
          </Button>
        </span>
      </div>
    </div>
  );
}

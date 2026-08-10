import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContinuousCodeStreamPanel } from '../client/src/components/ContinuousCodeStreamPanel';
import type { StreamEvent } from '../client/src/lib/continuous-stream-segmenter';

const events: StreamEvent[] = [
  { id: '1', kind: 'symbol-pending', at: 100, symbol: '.' },
  { id: '2', kind: 'symbol-pending', at: 200, symbol: '-' },
  { id: '3', kind: 'character-committed', at: 900, character: 'A', code: '.-' },
  { id: '4', kind: 'confirmed-boundary', at: 900 },
  { id: '5', kind: 'symbol-pending', at: 1_000, symbol: '.' },
  { id: '6', kind: 'uncertain', at: 1_200, reason: 'uncertain-pulse' },
  { id: '7', kind: 'discarded', at: 1_300, code: '--.', reason: 'ambiguous-tail' },
];

const renderPanel = (
  decodedText: string,
  status: 'collecting' | 'uncertain',
  standbyLabel = ''
) =>
  renderToStaticMarkup(
    React.createElement(ContinuousCodeStreamPanel, {
      decodedText,
      tentativeText: decodedText ? 'O' : '',
      pendingSymbols: '.',
      events,
      status,
      standbyLabel,
      waveform: {
        rawSamples: [0, 12, -8, 4],
        envelopeSamples: [0, 5, 9, 3],
        startThreshold: 8,
        endThreshold: 4,
        isActive: false,
      },
      onForceSplit: () => undefined,
      onUndo: () => undefined,
      onClear: () => undefined,
    })
  );

describe('continuous code stream panel', () => {
  it('renders uppercase decoded output in the bundled code font', () => {
    const html = renderPanel('Darklo 27', 'collecting');
    expect(html).toContain('DARKLO 27');
    expect(html).toContain('data-font="jetbrains-mono"');
    expect(html).toContain('aria-label="完整点划输入流"');
    expect(html).toContain('data-role="live-tail-strip"');
    expect(html).toContain('data-role="decoded-output-strip"');
    expect(html).toContain('data-role="typing-caret"');
    expect(html).toContain('data-role="confirmed-output"');
    expect(html).toContain('data-role="tentative-output"');
    expect(html).toContain('text-slate-100');
    expect(html).toContain('text-lime-300');
    expect(html).toContain('data-role="integrated-emg-waveform"');
    expect(html).toContain('aria-label="CH2 实时肌电波形"');
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('whitespace-nowrap');
    expect(html).not.toContain('code-thread');
    expect(html).not.toContain('code-dot');
  });

  it('shows the standby label supplied by the real session phase', () => {
    expect(renderPanel('', 'collecting', 'CALIBRATE')).toContain('CALIBRATE');
    expect(renderPanel('', 'collecting', 'READY')).toContain('READY');
    expect(renderPanel('', 'collecting')).not.toContain('READY');
  });

  it('distinguishes pending, committed, uncertain, and discarded events', () => {
    const html = renderPanel('A', 'uncertain');
    expect(html).toContain('data-state="pending"');
    expect(html).toContain('data-latest="true"');
    expect(html).toContain('data-state="committed"');
    expect(html).toContain('text-slate-100');
    expect(html).toContain('data-state="uncertain"');
    expect(html).toContain('data-state="discarded"');
    expect(html).toContain('data-layout="compact-single-line"');
  });
});

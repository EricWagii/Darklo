import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContinuousSessionReview } from '../client/src/components/ContinuousSessionReview';

const baseProps = {
  mode: 'scripted' as const,
  targetText: 'SOS',
  predictedText: 'S0S',
  actualText: 'SOS',
  reviewOpen: true,
  locked: false,
  evaluation: null,
  events: [
    { id: 'event-1', kind: 'symbol-pending' as const, at: 100, symbol: '.' as const },
  ],
  eventCorrections: [],
  onModeChange: () => undefined,
  onTargetTextChange: () => undefined,
  onActualTextChange: () => undefined,
  onSubmit: () => undefined,
  onEventCorrection: () => undefined,
};

describe('continuous session review', () => {
  it('renders scripted target, prediction, and non-blocking session actions', () => {
    const html = renderToStaticMarkup(React.createElement(ContinuousSessionReview, baseProps));

    expect(html).toContain('脚本评估');
    expect(html).toContain('自由输入');
    expect(html).toContain('目标文本');
    expect(html).toContain('系统识别');
    expect(html).toContain('实际文本');
    expect(html).toContain('识别正确');
    expect(html).toContain('提交修正');
    expect(html).toContain('标记无效');
    expect(html).toContain('目标编码');
    expect(html).toContain('data-role="target-morse-reference"');
    expect(html).toContain('...');
    expect(html).toContain('---');
  });

  it('offers optional event-level correction labels', () => {
    const html = renderToStaticMarkup(React.createElement(ContinuousSessionReview, baseProps));

    expect(html).toContain('事件级纠错');
    expect(html).toContain('点');
    expect(html).toContain('划');
    expect(html).toContain('字符边界');
    expect(html).toContain('伪迹');
  });

  it('renders measured results after feedback submission', () => {
    const evaluation = {
      mode: 'scripted' as const,
      targetText: 'SOS',
      predictedText: 'S0S',
      actualText: 'SOS',
      verdict: 'corrected' as const,
      includeInAccuracy: true,
      submittedAt: 123,
      metrics: {
        referenceLength: 3,
        predictedLength: 3,
        editDistance: 1,
        cer: 1 / 3,
        characterAccuracy: 2 / 3,
        exactMatch: false,
      },
      alignment: [],
      eventCorrections: [],
    };
    const html = renderToStaticMarkup(
      React.createElement(ContinuousSessionReview, { ...baseProps, reviewOpen: false, evaluation })
    );

    expect(html).toContain('66.7%');
    expect(html).toContain('33.3%');
    expect(html).toContain('编辑距离');
  });

  it('marks rejected sessions as excluded from accuracy', () => {
    const evaluation = {
      mode: 'scripted' as const,
      targetText: 'SOS',
      predictedText: 'SOS',
      actualText: 'SOS',
      verdict: 'rejected' as const,
      includeInAccuracy: false,
      submittedAt: 123,
      metrics: {
        referenceLength: 3,
        predictedLength: 3,
        editDistance: 0,
        cer: 0,
        characterAccuracy: 1,
        exactMatch: true,
      },
      alignment: [],
      eventCorrections: [],
    };
    const html = renderToStaticMarkup(
      React.createElement(ContinuousSessionReview, { ...baseProps, reviewOpen: false, evaluation })
    );

    expect(html).toContain('不计入准确率');
    expect(html).not.toContain('字符准确率');
  });
});

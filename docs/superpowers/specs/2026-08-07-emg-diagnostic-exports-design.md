# EMG Complete Diagnostic Exports Design

## Goal

Provide a visible, reliable complete-diagnostic export on both the silent-recognition page and the continuous neuromuscular timing-decoder page. Each export must preserve enough evidence to replay the path from acquired samples through processing and classification to the displayed result.

## Silent-recognition export

Each recognition attempt is retained as one trial, including failed and uncertain attempts. A trial contains:

- start and end timestamps;
- original CH1, CH2, and CH3 serial samples;
- processed CH1, CH2, and CH3 waveforms when processing completed;
- cropping, normalization, resting-baseline, startup-artifact, and processing-status metadata;
- recognition mode, thresholds, all command scores, score margin, channel diagnostics, and temporal-burst features;
- predicted command and subsequent user correction.

The export also contains the complete saved training commands and collections used by the page so test-to-template comparisons can be reproduced. The existing summary statistics remain, but no waveform field is removed when the page maps its state into the export schema.

## Continuous timing-decoder export

The page records a column-oriented session capture beginning with baseline acquisition. It contains timestamps and raw ADC values for CH1, CH2, and CH3, plus CH2 envelope, detector thresholds, detector-active/blocked state, and session phase. The package also includes:

- resting-baseline samples and statistics;
- short-event and long-event calibration durations and resulting calibration;
- every detected pulse, blocked event, decoder event, boundary decision, discarded tail, and committed character;
- pace settings, decoder configuration, final decoded text, pending symbols, and session timeline.

The capture has an explicit maximum length. If the limit is reached, the package records `captureTruncated: true` and the configured limit; data loss is never silent.

## Interaction and copy

Both pages show a clearly labelled `导出完整诊断包` button. The button is disabled until relevant test data exists and explains the reason in its tooltip. The continuous page uses the title `连续神经肌电时序解码` and the subtitle `基于个体化生物电校准，实现实时事件分割、时序编码与流式字符输出。` Direct descriptions of jaw actions are removed from the page's main presentation copy, while calibration controls remain understandable enough to operate.

## Format

Exports are UTF-8 JSON with a versioned envelope, source-page identifier, export timestamp, hardware/sample-rate metadata, and a diagnostic payload. High-frequency samples use parallel arrays rather than one object per sample to control file size.

## Verification

Unit tests verify required fields, preservation of waveforms, column alignment, and explicit truncation metadata. Page integration tests verify both visible export controls and the revised technical copy. The full test suite, TypeScript check, production build, and browser download behavior must pass before release.

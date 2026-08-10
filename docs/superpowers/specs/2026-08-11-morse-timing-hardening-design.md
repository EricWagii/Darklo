# Morse Timing Hardening Design

## Goal

Prevent natural long-contraction sequences from being split into multiple characters while keeping scripted targets completely outside recognition.

## Approved constraints

- Scripted target text is display and ground truth only. It never enters pulse classification, pause scoring, segmentation, candidate ranking, or commit timing.
- The existing calibration order remains rest baseline, short events, long events, then three accepted `SOS` rhythm attempts.
- A normal character boundary must not wait for the emergency force-split timeout.
- One sustained contraction must tolerate a short envelope dropout, without merging deliberately separated contractions.

## Design

1. Rhythm calibration records within-character gaps after dots and after dashes separately. The general within-character distribution remains available for old diagnostics and fallback behavior.
2. Pause scoring selects the matching within-character distribution from the preceding pending Morse symbol. Dash recovery can therefore be longer than dot recovery without being treated as a character boundary.
3. A calibrated pause model may influence normal commit timing only when its separation confidence is usable. Low-confidence or fallback models use the configured character boundary. Every model is bounded by the normal character boundary ceiling; force split remains only an emergency recovery path.
4. Detector release debounce is calibrated from the participant's short-event duration and clamped to a conservative range. Brief internal envelope dips remain one contraction, while intentional release gaps remain separate events.
5. Regression tests prove target independence, `---` preservation with longer dash recovery, bounded low-confidence commits, and short-dropout pulse continuity.


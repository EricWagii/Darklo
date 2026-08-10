# Streaming Morse Boundary and Live Output Design

## Goal

Make continuous neuromuscular Morse decoding usable during input rather than only after a session ends. The decoder must tolerate naturally long pauses between long contractions, commit characters incrementally, expose dot/dash and boundary decisions in real time, and keep scripted target text completely outside recognition scoring.

## Non-negotiable evaluation rule

Scripted target text is display and ground truth only. It may be shown to the participant and used after capture to calculate accuracy, but it must never influence pulse classification, segmentation candidates, candidate scores, character selection, or character commit timing. This prevents target leakage and preserves the validity of measured recognition accuracy.

## Root causes addressed

1. The page advances serial event time using a configured 500 Hz interval while the observed stream is approximately 1000 Hz, but idle commits and session completion use wall-clock time. The resulting clock divergence prevents normal idle commits and can timestamp a completed session before its detected events.
2. The standard fixed 700 ms character boundary treats natural pauses between long contractions as character boundaries. In the captured `SOS` session, pauses within the three dashes were 1032 ms and 1088 ms, so `---` became `T T T`.
3. A single fixed pause threshold cannot reliably separate this participant's within-character and between-character pauses when their distributions overlap.
4. The interface exposes committed output, but incorrect or absent boundary commits mean the participant receives no useful character-by-character pacing feedback.

## Architecture

### 1. Monotonic session clock

All detector, segmenter, idle-tick, force-split, timeline, and session-finish operations use one session-relative monotonic clock in milliseconds.

- Serial samples retain their arrival order but do not synthesize elapsed time from a configured sample rate.
- A session clock starts at baseline capture and resets whenever a new baseline or new evaluation session starts.
- Idle processing and explicit finish use the same clock adapter as pulse events.
- Wall-clock timestamps remain available only as export metadata and user-facing time labels.

This separates signal timing from nominal sample rate and removes negative idle durations.

### 2. Pause calibration

Calibration expands from only short/long contraction durations to include timing examples from a known multi-character practice sequence.

The calibration records:

- within-character release intervals;
- between-character release intervals;
- robust center and spread for each interval class;
- overlap between the two distributions;
- a separation confidence score.

The participant performs the practice sequence naturally. If the two pause distributions overlap too heavily, the interface reports that character boundaries are not distinguishable and asks the participant to use a slightly longer character pause. It does not silently invent a high-confidence threshold.

The existing standard, slow, and custom presets remain as initial priors and fallback values. User calibration updates the timing likelihoods rather than replacing them with one hard cutoff.

### 3. Candidate-based streaming segmentation

The segmenter keeps a bounded beam of candidate interpretations. Each candidate contains:

- confirmed character prefix;
- current pending dot/dash sequence;
- timing likelihood based on calibrated pause distributions;
- pulse classification likelihood;
- Morse-prefix validity;
- latest event time.

For every new pulse, the segmenter considers both interpretations when valid:

1. continue the current character;
2. close the current character and begin the next one.

Candidates with invalid Morse prefixes are removed. Remaining candidates are ranked by calibrated timing and pulse evidence. No target text, target length, or target character is available to this module.

An uncertain pulse is retained as weighted dot/dash alternatives instead of being immediately discarded. A low-confidence pulse may therefore be resolved by later legal Morse structure, while its uncertainty remains visible in diagnostics.

### 4. Incremental character commitment

The decoder commits only the longest character prefix shared by all sufficiently competitive candidates. This makes committed characters stable: once displayed as confirmed, later input cannot rewrite them.

Before stability is reached, the best candidate may be shown as tentative without being included in measured decoded output.

A calibrated between-character pause may commit the current character immediately. A longer force-split pause closes the current candidate, discards an invalid tail, and starts a fresh character. Ending the session performs the same finalization but is not the normal mechanism for producing output.

## Live interface

### Decoded output

The decoded output area updates continuously:

- confirmed characters: solid white monospace text;
- tentative character: green monospace text;
- active position: blinking cursor immediately after the latest character;
- empty ready state: `READY` disappears as soon as decoding starts.

For a successful `SOS` input, the participant should see `S|`, then `SO|`, then `SOS|` as characters become stable.

### Event history

The compact event history appends events in real time:

- detected dot or dash;
- uncertain pulse;
- candidate boundary;
- confirmed character boundary;
- committed character;
- discarded invalid tail.

Pending events remain green, committed dot/dash events become white, and uncertain or discarded events keep their warning colors. Event history is diagnostic evidence and is never regenerated only from final text.

### Session review

`End and review` stops capture and opens the existing review panel. It displays the text already produced by the streaming decoder. Review actions record correct, corrected, or invalid ground truth; they do not run a second recognition pass or replace live output.

## Data and export

Each exported session includes:

- monotonic event timestamps and wall-clock session metadata;
- detected pulse durations and dot/dash likelihoods;
- calibrated within-character and between-character pause models;
- candidate boundary decisions and confidence;
- tentative and committed character events;
- final committed output and discarded tail;
- scripted target or corrected actual text strictly under evaluation metadata;
- session identifier so repeated attempts are not overwritten.

## Error handling

- Clock regression: reject the affected timing transition, log a diagnostic event, and retain signal samples.
- Insufficient pause calibration: use a clearly marked fallback preset and report low boundary confidence.
- Overlapping pause distributions: warn before evaluation and preserve multiple candidates longer.
- Invalid Morse tail at force split: discard only the unresolved tail; previously committed characters remain unchanged.
- Candidate overflow: prune by score while preserving every distinct stable prefix represented in the beam.

## Compatibility

- Existing collection training and silent-recognition pages are unchanged.
- Existing continuous-session feedback and diagnostic exports remain available.
- Existing saved sessions remain readable; new calibration and timing fields are optional when importing older data.
- Target text display and target Morse reference remain available but stay outside decoder dependencies.

## Verification

Automated tests must cover:

1. one monotonic clock across pulse, idle, force-split, and finish operations;
2. a 1000 Hz input stream without synthetic clock drift;
3. `SOS` with 1000-1100 ms pauses between dashes and a longer learned character pause;
4. incremental commits producing `S`, then `SO`, then `SOS` before session finish;
5. overlapping pause distributions preserving candidates instead of premature commits;
6. uncertain final dot retained as a candidate and resolved by legal Morse structure;
7. target text changes having no effect on decoder output;
8. invalid trailing input being discarded without removing committed text;
9. real-time event history distinguishing pending, committed, uncertain, and discarded events;
10. multiple exported attempts retaining independent session ids and evaluation records.

Browser verification must confirm that live waveform, decoded output, cursor, and event history update together on desktop viewports without requiring session completion.

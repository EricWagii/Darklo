import { describe, expect, it } from 'vitest';
import { createMonotonicSessionClock } from '../client/src/lib/monotonic-session-clock';

describe('monotonic session clock', () => {
  it('starts at zero and advances from one shared monotonic source', () => {
    let now = 1_000;
    const clock = createMonotonicSessionClock(() => now);

    clock.reset();
    expect(clock.now()).toBe(0);

    now = 1_012.5;
    expect(clock.now()).toBe(12.5);

    now = 1_735;
    expect(clock.now()).toBe(735);
  });

  it('never regresses when the underlying timestamp moves backwards', () => {
    let now = 500;
    const clock = createMonotonicSessionClock(() => now);

    clock.reset();
    now = 620;
    expect(clock.now()).toBe(120);

    now = 590;
    expect(clock.now()).toBe(120);

    now = 700;
    expect(clock.now()).toBe(200);
  });

  it('resets elapsed time for a new calibration or evaluation session', () => {
    let now = 4_000;
    const clock = createMonotonicSessionClock(() => now);

    clock.reset();
    now = 4_800;
    expect(clock.now()).toBe(800);

    clock.reset();
    expect(clock.now()).toBe(0);
    now = 4_950;
    expect(clock.now()).toBe(150);
  });
});

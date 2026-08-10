export interface MonotonicSessionClock {
  now(): number;
  reset(): void;
}

const defaultTimeSource = (): number => performance.now();

export const createMonotonicSessionClock = (
  timeSource: () => number = defaultTimeSource
): MonotonicSessionClock => {
  let origin = timeSource();
  let lastElapsed = 0;

  return {
    now() {
      const elapsed = Math.max(0, timeSource() - origin);
      lastElapsed = Math.max(lastElapsed, elapsed);
      return lastElapsed;
    },
    reset() {
      origin = timeSource();
      lastElapsed = 0;
    },
  };
};

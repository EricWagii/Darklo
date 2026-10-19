import { expect, it } from 'vitest';
import { retainEmergencyCapture, pendingEmergencyCaptures, subscribeEmergencyCaptures } from '../client/src/lib/gesture-emergency';

it('keeps every failed recording outside component lifetime, isolated by owner', () => {
  retainEmergencyCapture('test-emergency-owner', 'first', '{"raw":[1]}');
  retainEmergencyCapture('test-emergency-owner', 'second', '{"raw":[2]}');
  expect(pendingEmergencyCaptures('test-emergency-owner').map(r => r.id)).toEqual(['first', 'second']);
  expect(pendingEmergencyCaptures('another-owner')).toEqual([]);
  expect(pendingEmergencyCaptures('test-emergency-owner')[0].payload).toContain('[1]');
});

it('notifies a newly mounted owner view when a previous run fails after navigation', () => {
  let count = 0;
  const unsubscribe = subscribeEmergencyCaptures('late-failure-owner', records => { count = records.length; });
  retainEmergencyCapture('late-failure-owner', 'late', 'data');
  expect(count).toBe(1);
  unsubscribe();
  retainEmergencyCapture('late-failure-owner', 'later', 'data');
  expect(count).toBe(1);
});

it('replays the current snapshot on subscription so a pre-effect failure is not missed', () => {
  retainEmergencyCapture('before-effect-owner', 'saved-first', 'data');
  let count = 0;
  const unsubscribe = subscribeEmergencyCaptures('before-effect-owner', records => { count = records.length; });
  expect(count).toBe(1);
  unsubscribe();
});

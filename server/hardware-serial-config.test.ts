import { describe, expect, it } from 'vitest';
import { HARDWARE_CONFIG as canonicalHardwareConfig } from '../shared/hardware-config';
import { HARDWARE_CONFIG as legacyHardwareConfig } from '../shared/const';

describe('hardware serial configuration', () => {
  it('uses the verified STM32 baud rate from one shared configuration', () => {
    expect(canonicalHardwareConfig.BAUD_RATE).toBe(115_200);
    expect(legacyHardwareConfig).toBe(canonicalHardwareConfig);
  });
});

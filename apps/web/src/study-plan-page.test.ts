import { describe, expect, it } from 'vitest';

import { dailyAvailabilityMinutesSchema } from './study-plan-page.js';

describe('dailyAvailabilityMinutesSchema', () => {
  it('accepts integer minutes within the supported range', () => {
    expect(dailyAvailabilityMinutesSchema.parse('20')).toBe(20);
    expect(dailyAvailabilityMinutesSchema.parse('1')).toBe(1);
    expect(dailyAvailabilityMinutesSchema.parse('720')).toBe(720);
  });

  it.each(['', '0', '-1', '1.5', '721', 'hai mươi'])('rejects invalid value %s', (value) => {
    expect(dailyAvailabilityMinutesSchema.safeParse(value).success).toBe(false);
  });
});

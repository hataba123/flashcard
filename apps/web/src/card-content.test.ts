import { describe, expect, it } from 'vitest';

import { formatCardTextForDisplay } from './card-content.js';

describe('formatCardTextForDisplay', () => {
  it('places an example introduced by an em dash on the next line', () => {
    expect(
      formatCardTextForDisplay(
        'be a major contributing factor — Social inequality can be a major contributing factor to urban crime.'
      )
    ).toBe(
      'be a major contributing factor\n— Social inequality can be a major contributing factor to urban crime.'
    );
  });

  it('does not alter hyphens inside words', () => {
    expect(formatCardTextForDisplay('long-term planning')).toBe('long-term planning');
  });
});

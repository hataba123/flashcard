import { createElement } from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCardSpeechText, SpeechControl } from './speech-control.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCardSpeechText', () => {
  it('reads only the front content before the answer is revealed', () => {
    expect(getCardSpeechText({ front: 'Hello', back: 'Xin chào' }, false)).toBe('Hello');
    expect(getCardSpeechText({ text: 'Cloze content', back: 'Answer' }, false)).toBe(
      'Cloze content'
    );
  });

  it('reads all answer fields without media metadata or duplicate values', () => {
    expect(
      getCardSpeechText(
        {
          front: 'Hello',
          back: 'Xin chào',
          example: 'Hello, how are you?',
          duplicate: 'Xin chào',
          audioMediaId: 'media-id'
        },
        true
      )
    ).toBe('Xin chào. Hello, how are you?');
  });
});

describe('SpeechControl', () => {
  it('cancels the previous utterance before reading the newly revealed face', () => {
    class FakeUtterance {
      lang = '';
      rate = 1;
      voice = null;

      constructor(readonly text: string) {}
    }

    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel,
      speak,
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    const view = render(
      createElement(SpeechControl, { contentKey: 'card-1:front', text: 'Hello' })
    );
    expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Hello' }));

    view.rerender(createElement(SpeechControl, { contentKey: 'card-1:back', text: 'Xin chào' }));
    expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Xin chào' }));
    view.unmount();
  });
});

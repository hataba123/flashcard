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

  it('reads English answer content without media metadata, duplicates, or Vietnamese text', () => {
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
    ).toBe('Hello, how are you?');
  });

  it('skips Vietnamese text on either face of the card', () => {
    expect(getCardSpeechText({ front: 'Xin chào', back: 'Hello' }, false)).toBe('');
    expect(getCardSpeechText({ front: 'Toi dang hoc tieng Anh', back: 'Hello' }, false)).toBe('');
    expect(
      getCardSpeechText(
        { front: 'achieve', back: 'Nghĩa: đạt được\n\nVí dụ: achieve a goal' },
        true
      )
    ).toBe('achieve a goal');
    expect(
      getCardSpeechText(
        { front: 'achieve', back: 'Nghia: dat duoc\n\nVi du: achieve a goal' },
        true
      )
    ).toBe('achieve a goal');
  });

  it('keeps English words that are also valid unaccented Vietnamese words', () => {
    expect(getCardSpeechText({ front: 'A productive day', back: '' }, false)).toBe(
      'A productive day'
    );
    expect(getCardSpeechText({ front: 'They ban unsafe products', back: '' }, false)).toBe(
      'They ban unsafe products'
    );
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

    view.rerender(createElement(SpeechControl, { contentKey: 'card-1:back', text: '' }));
    expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(speak).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

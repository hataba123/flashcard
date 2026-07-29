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
    ).toBe('Hello how are you');
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

  it('prefers English answer content over pronunciation on the back of a card', () => {
    expect(
      getCardSpeechText(
        {
          front: 'resume',
          back:
            "lấy lại, chiếm lại; lại tiếp tục\n\nPhiên âm: /ri'zju:m/\n\nVí dụ: to resume one's spirits"
        },
        true
      )
    ).toBe("to resume one's spirits");
  });

  it('does not read unaccented Vietnamese words surrounding an English example', () => {
    expect(
      getCardSpeechText(
        {
          front: 'resume',
          back:
            "lấy lại, chiếm lại, hồi phục lại; lại bắt đầu, lại tiếp tục (sau khi nghỉ, dừng); tóm tắt lại, nêu điểm chính\n\nPhiên âm: /ri'zju:m/\n\nVí dụ: to resume one's spirits — lấy lại tinh thần, lấy lại can đảm"
        },
        true
      )
    ).toBe("to resume one's spirits");
  });

  it('does not read pronunciation when the back has no English answer content', () => {
    expect(getCardSpeechText({ front: 'resume', phonetic: "/ri'zju:m/" }, true)).toBe('');
    expect(
      getCardSpeechText({ front: 'resume', back: "Phiên âm: (/ri'zju:m/)." }, true)
    ).toBe('');
  });

  it('removes punctuation from regular card content', () => {
    expect(getCardSpeechText({ front: 'hello, world!', back: '' }, false)).toBe('hello world');
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

import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCardSpeechText, SpeechControl, SpeechReplayButton } from './speech-control.js';

afterEach(() => {
  vi.useRealTimers();
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

  it('reads Vietnamese text on the front of a card', () => {
    expect(getCardSpeechText({ front: 'Xin chào', back: 'Hello' }, false)).toBe('Xin chào');
    expect(getCardSpeechText({ front: 'Toi dang hoc tieng Anh', back: 'Hello' }, false)).toBe(
      'Toi dang hoc tieng Anh'
    );
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

  it('reads Vietnamese answer content when the back has no English example', () => {
    expect(getCardSpeechText({ front: 'Hello', back: 'Xin chào' }, true)).toBe('Xin chào');
    expect(getCardSpeechText({ front: 'Hello', back: 'Toi dang hoc tieng Viet' }, true)).toBe(
      'Toi dang hoc tieng Viet'
    );
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
          back: "lấy lại, chiếm lại; lại tiếp tục\n\nPhiên âm: /ri'zju:m/\n\nVí dụ: to resume one's spirits"
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
          back: "lấy lại, chiếm lại, hồi phục lại; lại bắt đầu, lại tiếp tục (sau khi nghỉ, dừng); tóm tắt lại, nêu điểm chính\n\nPhiên âm: /ri'zju:m/\n\nVí dụ: to resume one's spirits — lấy lại tinh thần, lấy lại can đảm"
        },
        true
      )
    ).toBe("to resume one's spirits");
  });

  it('does not read pronunciation when the back has no English answer content', () => {
    expect(getCardSpeechText({ front: 'resume', phonetic: "/ri'zju:m/" }, true)).toBe('');
    expect(getCardSpeechText({ front: 'resume', back: "Phiên âm: (/ri'zju:m/)." }, true)).toBe('');
  });

  it('removes punctuation from regular card content', () => {
    expect(getCardSpeechText({ front: 'hello, world!', back: '' }, false)).toBe('hello world');
  });
});

describe('SpeechControl', () => {
  it('keeps the speech repeat setting visible when speech synthesis is unavailable', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    const onRepeatCountChange = vi.fn();

    render(
      createElement(SpeechControl, {
        contentKey: 'card-1:front',
        text: 'Hello',
        isBack: true,
        repeatCount: 2,
        onRepeatCountChange
      })
    );

    const repeatSelect = screen.getByLabelText('Số lần đọc mặt sau');
    expect((repeatSelect as HTMLSelectElement).value).toBe('2');
    fireEvent.change(repeatSelect, { target: { value: '4' } });
    expect(onRepeatCountChange).toHaveBeenCalledWith(4);
  });

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

  it('reveals the card after the front utterance ends when auto reveal is enabled', () => {
    class FakeUtterance {
      lang = '';
      rate = 1;
      voice = null;
      onend: (() => void) | null = null;

      constructor(readonly text: string) {}
    }

    const utterances: FakeUtterance[] = [];
    const onFrontSpeechComplete = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: (utterance: FakeUtterance) => utterances.push(utterance),
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    const view = render(
      createElement(SpeechControl, {
        contentKey: 'card-1:front',
        text: 'Hello',
        onFrontSpeechComplete
      })
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Tự động chuyển sang mặt sau/i }));
    fireEvent.change(screen.getByLabelText('Thời gian chờ trước khi lật'), {
      target: { value: '0' }
    });
    view.rerender(
      createElement(SpeechControl, {
        contentKey: 'card-2:front',
        text: 'Good morning',
        onFrontSpeechComplete
      })
    );

    expect(utterances).toHaveLength(2);
    utterances[1]?.onend?.();
    expect(onFrontSpeechComplete).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('waits for the configured delay after the front utterance ends', () => {
    vi.useFakeTimers();

    class FakeUtterance {
      lang = '';
      rate = 1;
      voice = null;
      onend: (() => void) | null = null;

      constructor(readonly text: string) {}
    }

    const utterances: FakeUtterance[] = [];
    const onFrontSpeechComplete = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: (utterance: FakeUtterance) => utterances.push(utterance),
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    const view = render(
      createElement(SpeechControl, {
        contentKey: 'card-1:front',
        text: 'Hello',
        onFrontSpeechComplete
      })
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Tự động chuyển sang mặt sau/i }));
    fireEvent.change(screen.getByLabelText('Thời gian chờ trước khi lật'), {
      target: { value: '2000' }
    });
    view.rerender(
      createElement(SpeechControl, {
        contentKey: 'card-2:front',
        text: 'Good morning',
        onFrontSpeechComplete
      })
    );

    utterances[1]?.onend?.();
    vi.advanceTimersByTime(1_999);
    expect(onFrontSpeechComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFrontSpeechComplete).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('notifies after the last repeated back utterance finishes', () => {
    class FakeUtterance {
      lang = '';
      rate = 1;
      voice = null;
      onend: (() => void) | null = null;

      constructor(readonly text: string) {}
    }

    const utterances: FakeUtterance[] = [];
    const onBackSpeechComplete = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: (utterance: FakeUtterance) => utterances.push(utterance),
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    render(
      createElement(SpeechControl, {
        contentKey: 'card-1:back',
        text: 'Answer',
        isBack: true,
        repeatCount: 3,
        onBackSpeechComplete
      })
    );

    expect(utterances).toHaveLength(3);
    utterances[0]?.onend?.();
    utterances[1]?.onend?.();
    expect(onBackSpeechComplete).not.toHaveBeenCalled();
    utterances[2]?.onend?.();
    expect(onBackSpeechComplete).toHaveBeenCalledOnce();
  });

  it('reads the text of the face whose replay button was selected', () => {
    class FakeUtterance {
      lang = '';
      rate = 1;
      voice = null;

      constructor(readonly text: string) {}
    }

    const speak = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak,
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    const view = render(
      createElement(SpeechReplayButton, { text: 'Front content', side: 'front' })
    );
    const replayButton = view.container.querySelector<HTMLButtonElement>('button');
    if (replayButton === null) throw new Error('Không tìm thấy nút đọc lại.');
    replayButton.click();

    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Front content' }));
  });

  it('uses a Vietnamese voice locale for Vietnamese card content', () => {
    class FakeUtterance {
      lang = '';
      rate = 1;
      voice = null;

      constructor(readonly text: string) {}
    }

    const speak = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak,
      getVoices: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });

    const view = render(
      createElement(SpeechReplayButton, {
        text: 'là nguyên nhân chính gây ra một vấn đề',
        side: 'front'
      })
    );
    const replayButton = view.container.querySelector<HTMLButtonElement>('button');
    if (replayButton === null) throw new Error('Không tìm thấy nút đọc lại.');
    replayButton.click();

    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ lang: 'vi-VN' }));
  });
});

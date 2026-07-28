import { useEffect, useState } from 'react';

export type ReviewFontSize = 'small' | 'medium' | 'large';
export type ReviewCardWidth = 'compact' | 'balanced' | 'wide';

const themeStorageKey = 'flashcard:theme';
const fontSizeStorageKey = 'flashcard:review-font-size';
const cardWidthStorageKey = 'flashcard:review-card-width';

function storedValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#171a20' : '#f9f4df');
  }, [theme]);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className={compact ? 'theme-toggle compact' : 'theme-toggle secondary'}
      type="button"
      aria-label={`Chuyển sang giao diện ${nextTheme === 'dark' ? 'tối' : 'sáng'}`}
      aria-pressed={theme === 'dark'}
      onClick={() => setTheme(nextTheme)}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span>
      {!compact && <span>{theme === 'dark' ? 'Tối' : 'Sáng'}</span>}
    </button>
  );
}

export function useReviewDisplayPreferences() {
  const [fontSize, setFontSizeState] = useState<ReviewFontSize>(() =>
    storedValue(fontSizeStorageKey, ['small', 'medium', 'large'] as const, 'medium')
  );
  const [cardWidth, setCardWidthState] = useState<ReviewCardWidth>(() =>
    storedValue(cardWidthStorageKey, ['compact', 'balanced', 'wide'] as const, 'balanced')
  );

  const setFontSize = (value: ReviewFontSize) => {
    setFontSizeState(value);
    localStorage.setItem(fontSizeStorageKey, value);
  };
  const setCardWidth = (value: ReviewCardWidth) => {
    setCardWidthState(value);
    localStorage.setItem(cardWidthStorageKey, value);
  };

  return { fontSize, setFontSize, cardWidth, setCardWidth };
}

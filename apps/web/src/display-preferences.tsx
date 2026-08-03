import { useEffect, useState } from 'react';
import type { DisplayPreferences } from '@flashcard/contracts';

export type ReviewFontSize = 'small' | 'medium' | 'large';
export type ReviewCardWidth = 'compact' | 'balanced' | 'wide';

const themeStorageKey = 'flashcard:theme';
const fontSizeStorageKey = 'flashcard:review-font-size';
const cardWidthStorageKey = 'flashcard:review-card-width';

function storedValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function readDisplayPreferences(): DisplayPreferences {
  return {
    theme: storedValue(themeStorageKey, ['light', 'dark'] as const, 'light'),
    reviewFontSize: storedValue(
      fontSizeStorageKey,
      ['small', 'medium', 'large'] as const,
      'medium'
    ),
    reviewCardWidth: storedValue(
      cardWidthStorageKey,
      ['compact', 'balanced', 'wide'] as const,
      'balanced'
    )
  };
}

export function applyDisplayPreferences(preferences: DisplayPreferences): void {
  localStorage.setItem(themeStorageKey, preferences.theme);
  localStorage.setItem(fontSizeStorageKey, preferences.reviewFontSize);
  localStorage.setItem(cardWidthStorageKey, preferences.reviewCardWidth);
  document.documentElement.dataset.theme = preferences.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', preferences.theme === 'dark' ? '#171a20' : '#f9f4df');
  window.dispatchEvent(new Event('flashcard-display-preferences-applied'));
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

  useEffect(() => {
    const onPreferencesApplied = () => setTheme(readDisplayPreferences().theme);
    window.addEventListener('flashcard-display-preferences-applied', onPreferencesApplied);
    return () =>
      window.removeEventListener('flashcard-display-preferences-applied', onPreferencesApplied);
  }, []);

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

  useEffect(() => {
    const onPreferencesApplied = () => {
      const preferences = readDisplayPreferences();
      setFontSizeState(preferences.reviewFontSize);
      setCardWidthState(preferences.reviewCardWidth);
    };
    window.addEventListener('flashcard-display-preferences-applied', onPreferencesApplied);
    return () =>
      window.removeEventListener('flashcard-display-preferences-applied', onPreferencesApplied);
  }, []);

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

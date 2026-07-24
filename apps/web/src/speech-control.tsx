import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'flashcard:speech-settings';

const languageOptions = [
  { value: 'en-US', label: 'Tiếng Anh (Mỹ)' },
  { value: 'en-GB', label: 'Tiếng Anh (Anh)' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'fr-FR', label: 'Tiếng Pháp' },
  { value: 'de-DE', label: 'Tiếng Đức' },
  { value: 'es-ES', label: 'Tiếng Tây Ban Nha' },
  { value: 'ja-JP', label: 'Tiếng Nhật' },
  { value: 'ko-KR', label: 'Tiếng Hàn' },
  { value: 'zh-CN', label: 'Tiếng Trung (Giản thể)' }
] as const;

interface SpeechSettings {
  autoRead: boolean;
  language: string;
  voiceUri: string;
  rate: number;
}

const defaultSettings: SpeechSettings = {
  autoRead: true,
  language: 'en-US',
  voiceUri: '',
  rate: 1
};

function loadSettings(): SpeechSettings {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return defaultSettings;
    const parsed = JSON.parse(saved) as Partial<SpeechSettings>;
    return {
      autoRead: typeof parsed.autoRead === 'boolean' ? parsed.autoRead : defaultSettings.autoRead,
      language: typeof parsed.language === 'string' ? parsed.language : defaultSettings.language,
      voiceUri: typeof parsed.voiceUri === 'string' ? parsed.voiceUri : defaultSettings.voiceUri,
      rate:
        typeof parsed.rate === 'number' && parsed.rate >= 0.5 && parsed.rate <= 2
          ? parsed.rate
          : defaultSettings.rate
    };
  } catch {
    return defaultSettings;
  }
}

export function getCardSpeechText(fields: Record<string, string>, revealed: boolean): string {
  if (!revealed) return (fields.front ?? fields.text ?? '').trim();

  const frontKeys = new Set(['front', 'text', 'audioMediaId']);
  return [
    ...new Set(
      Object.entries(fields)
        .filter(([key, value]) => !frontKeys.has(key) && value.trim().length > 0)
        .map(([, value]) => value.trim())
    )
  ].join('. ');
}

interface SpeechControlProps {
  contentKey: string;
  text: string;
}

export function SpeechControl({ contentKey, text }: SpeechControlProps) {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';
  const [settings, setSettings] = useState<SpeechSettings>(loadSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const speechState = useRef({ settings, text, voices });
  speechState.current = { settings, text, voices };

  useEffect(() => {
    if (!supported) return;
    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, [supported]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Cài đặt chỉ là tiện ích cục bộ; chức năng đọc vẫn hoạt động nếu bộ nhớ bị chặn.
    }
  }, [settings]);

  const matchingVoices = useMemo(
    () =>
      voices.filter((voice) =>
        voice.lang.toLowerCase().startsWith(settings.language.toLowerCase())
      ),
    [settings.language, voices]
  );

  const speak = useCallback(() => {
    const current = speechState.current;
    if (!supported || current.text.trim().length === 0) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(current.text);
    utterance.lang = current.settings.language;
    utterance.rate = current.settings.rate;
    utterance.voice =
      current.voices.find((voice) => voice.voiceURI === current.settings.voiceUri) ?? null;
    window.speechSynthesis.speak(utterance);
  }, [supported]);

  useEffect(() => {
    if (settings.autoRead) speak();
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [contentKey, settings.autoRead, speak, supported]);

  if (!supported)
    return <p className="muted">Trình duyệt này không hỗ trợ đọc thẻ bằng Web Speech API.</p>;

  return (
    <details className="speech-control">
      <summary>Âm thanh đọc thẻ</summary>
      <div className="speech-settings">
        <label className="speech-toggle">
          <input
            type="checkbox"
            checked={settings.autoRead}
            onChange={(event) =>
              setSettings((current) => ({ ...current, autoRead: event.target.checked }))
            }
          />
          Tự động đọc khi hiện mặt thẻ
        </label>
        <label>
          Ngôn ngữ
          <select
            value={settings.language}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                language: event.target.value,
                voiceUri: ''
              }))
            }
          >
            {languageOptions.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Giọng đọc
          <select
            value={settings.voiceUri}
            onChange={(event) =>
              setSettings((current) => ({ ...current, voiceUri: event.target.value }))
            }
          >
            <option value="">Mặc định của thiết bị</option>
            {matchingVoices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tốc độ: {settings.rate.toFixed(1)}×
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={settings.rate}
            onChange={(event) =>
              setSettings((current) => ({ ...current, rate: Number(event.target.value) }))
            }
          />
        </label>
        <button
          className="secondary"
          type="button"
          onClick={speak}
          disabled={text.trim().length === 0}
        >
          Đọc lại
        </button>
      </div>
    </details>
  );
}

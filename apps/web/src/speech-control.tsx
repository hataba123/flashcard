import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'flashcard:speech-settings';

const languageOptions = [
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'en-US', label: 'Tiếng Anh (Mỹ)' },
  { value: 'en-GB', label: 'Tiếng Anh (Anh)' },
  { value: 'fr-FR', label: 'Tiếng Pháp' },
  { value: 'de-DE', label: 'Tiếng Đức' },
  { value: 'es-ES', label: 'Tiếng Tây Ban Nha' },
  { value: 'ja-JP', label: 'Tiếng Nhật' },
  { value: 'ko-KR', label: 'Tiếng Hàn' },
  { value: 'zh-CN', label: 'Tiếng Trung (Giản thể)' }
] as const;

interface SpeechSettings {
  autoRead: boolean;
  autoReveal: boolean;
  autoRevealDelayMs: number;
  language: string;
  voiceUri: string;
  rate: number;
}

const defaultSettings: SpeechSettings = {
  autoRead: true,
  autoReveal: false,
  autoRevealDelayMs: 1_000,
  language: 'en-US',
  voiceUri: '',
  rate: 1
};

const vietnameseWords = new Set([
  'anh',
  'ban',
  'chao',
  'chung',
  'cua',
  'dat',
  'dang',
  'day',
  'dich',
  'du',
  'duoc',
  'giai',
  'hoc',
  'khong',
  'la',
  'loai',
  'muc',
  'nghia',
  'ngu',
  'nhung',
  'phien',
  'tieng',
  'toi',
  'tranh',
  'vi',
  'viet',
  'xin'
]);

const strongVietnameseWords = new Set(['chao', 'xin', 'tieng', 'viet', 'nghia', 'ngu', 'phien']);
const vietnameseCharacterPattern =
  /[\u00e0-\u00e3\u00e8-\u00ea\u00ec\u00ed\u00f2-\u00f5\u00f9\u00fa\u00fd\u0103\u0111\u0129\u0169\u01a1\u01b0\u1ea0-\u1ef9]/iu;
const wordPattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const pronunciationFieldKeys = new Set(['phonetic', 'phonetics', 'pronunciation', 'ipa']);
const pronunciationLinePattern = /(?:phiên\s*âm|phien\s*am)\s*:\s*[^\r\n]*/giu;
const exampleLinePattern = /^\s*(?:ví\s*dụ|vi\s*du)\s*:\s*/iu;
const translationSeparatorPattern = /\s[—–]\s/u;

function isVietnameseWord(word: string): boolean {
  if (vietnameseCharacterPattern.test(word)) return true;
  const normalized = word
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd');
  return vietnameseWords.has(normalized);
}

function isVietnameseText(text: string): boolean {
  if (vietnameseCharacterPattern.test(text)) return true;
  const words = text.match(wordPattern) ?? [];
  const vietnameseWordCount = words.filter(isVietnameseWord).length;
  return (
    vietnameseWordCount >= 2 ||
    (words.length === 1 && strongVietnameseWords.has(words[0]?.toLocaleLowerCase('vi') ?? ''))
  );
}

function getEnglishSpeechText(text: string): string {
  return text
    .split(/\r?\n/u)
    .map(getEnglishSpeechLine)
    .filter((line) => line.length > 0)
    .join(' ');
}

function getEnglishSpeechLine(text: string): string {
  const words = text.match(wordPattern) ?? [];
  const vietnameseWordCount = words.filter(isVietnameseWord).length;
  const vietnameseCharacterCount = words.filter((word) =>
    vietnameseCharacterPattern.test(word)
  ).length;

  if (vietnameseCharacterCount >= 2) {
    const lineWithoutExampleLabel = text.replace(exampleLinePattern, '');
    const [englishBeforeTranslation] = lineWithoutExampleLabel.split(translationSeparatorPattern);
    if (
      englishBeforeTranslation !== undefined &&
      !vietnameseCharacterPattern.test(englishBeforeTranslation)
    )
      return getEnglishSpeechLine(englishBeforeTranslation);
    return '';
  }

  return text
    .replace(wordPattern, (word) => {
      if (vietnameseCharacterPattern.test(word)) return '';
      return vietnameseWordCount >= 2 && isVietnameseWord(word) ? '' : word;
    })
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[,.;:!?\-+]+\s*/, '')
    .replace(/[,:;\-+]+\s*$/g, '')
    .trim();
}

function removeSpeechMarks(text: string): string {
  return text
    .replace(/[\p{P}\p{S}\u02c8\u02cc\u02d0\u02d1]/gu, (mark) =>
      mark === "'" || mark === '’' ? mark : ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function loadSettings(): SpeechSettings {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return defaultSettings;
    const parsed = JSON.parse(saved) as Partial<SpeechSettings>;
    return {
      autoRead: typeof parsed.autoRead === 'boolean' ? parsed.autoRead : defaultSettings.autoRead,
      autoReveal:
        typeof parsed.autoReveal === 'boolean' ? parsed.autoReveal : defaultSettings.autoReveal,
      autoRevealDelayMs:
        typeof parsed.autoRevealDelayMs === 'number' &&
        Number.isFinite(parsed.autoRevealDelayMs) &&
        parsed.autoRevealDelayMs >= 0 &&
        parsed.autoRevealDelayMs <= 10_000
          ? parsed.autoRevealDelayMs
          : defaultSettings.autoRevealDelayMs,
      language: languageOptions.some((option) => option.value === parsed.language)
        ? (parsed.language ?? defaultSettings.language)
        : defaultSettings.language,
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
  if (!revealed) {
    const front = fields.front ?? fields.text ?? '';
    return removeSpeechMarks(isVietnameseText(front) ? front : getEnglishSpeechText(front));
  }

  const frontKeys = new Set(['front', 'text', 'audioMediaId']);
  const answerValues = [
    ...new Set(
      Object.entries(fields)
        .filter(
          ([key, value]) =>
            !frontKeys.has(key) &&
            !pronunciationFieldKeys.has(key.toLocaleLowerCase('en')) &&
            value.trim().length > 0
        )
        .map(([, value]) => value.replace(pronunciationLinePattern, '').trim())
    )
  ];
  const englishAnswerText = answerValues
    .map(getEnglishSpeechText)
    .filter((value) => value.length > 0)
    .join('. ');
  if (englishAnswerText.length > 0) return removeSpeechMarks(englishAnswerText);

  const vietnameseAnswerText = answerValues
    .filter(isVietnameseText)
    .map(removeSpeechMarks)
    .filter((value) => value.length > 0)
    .join('. ');
  return removeSpeechMarks(vietnameseAnswerText);
}

interface SpeechControlProps {
  contentKey: string;
  text: string;
  isBack?: boolean;
  isPaused?: boolean;
  allowAutoReveal?: boolean;
  repeatCount?: number;
  onRepeatCountChange?: (value: number) => void;
  onFrontSpeechComplete?: () => void;
  onBackSpeechComplete?: () => void;
}

interface SpeechReplayButtonProps {
  text: string;
  side: 'front' | 'back';
  repeatCount?: number;
}

interface SpeechRepeatSettingProps {
  repeatCount: number;
  onRepeatCountChange(value: number): void;
  disabled?: boolean;
}

function SpeechRepeatSetting({
  repeatCount,
  onRepeatCountChange,
  disabled = false
}: SpeechRepeatSettingProps) {
  return (
    <label>
      Số lần đọc mặt sau
      <select
        value={repeatCount}
        disabled={disabled}
        onChange={(event) => onRepeatCountChange(Number(event.target.value))}
      >
        <option value={1}>1 lần</option>
        <option value={2}>2 lần</option>
        <option value={3}>3 lần</option>
        <option value={4}>4 lần</option>
        <option value={5}>5 lần</option>
      </select>
    </label>
  );
}

function formatAutoRevealDelay(delayMs: number): string {
  if (delayMs === 0) return 'ngay lập tức';
  return `${(delayMs / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giây`;
}

function speakText(
  text: string,
  settings: SpeechSettings,
  voices: SpeechSynthesisVoice[],
  repeatCount = 1,
  onComplete?: () => void
): void {
  if (text.trim().length === 0) return;
  window.speechSynthesis.cancel();
  const language = isVietnameseText(text) ? 'vi-VN' : settings.language;
  const selectedVoice = voices.find((voice) => voice.voiceURI === settings.voiceUri);
  const voice =
    selectedVoice?.lang.toLowerCase().startsWith(language.toLowerCase()) === true
      ? selectedVoice
      : (voices.find((item) => item.lang.toLowerCase().startsWith(language.toLowerCase())) ?? null);
  const totalUtterances = Math.max(1, repeatCount);
  for (let index = 0; index < totalUtterances; index += 1) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = settings.rate;
    utterance.voice = voice;
    if (onComplete !== undefined && index === totalUtterances - 1)
      utterance.onend = () => onComplete();
    window.speechSynthesis.speak(utterance);
  }
}

export function SpeechReplayButton({ text, side, repeatCount = 1 }: SpeechReplayButtonProps) {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';
  const sideLabel = side === 'front' ? 'mặt trước' : 'mặt sau';

  if (!supported) return null;

  return (
    <button
      className="review-speech-button"
      type="button"
      aria-label={`Đọc lại ${sideLabel}`}
      title={`Đọc lại ${sideLabel}`}
      disabled={text.trim().length === 0}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      onClick={() =>
        speakText(
          text,
          loadSettings(),
          window.speechSynthesis.getVoices(),
          side === 'back' ? repeatCount : 1
        )
      }
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
        <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
      </svg>
    </button>
  );
}

export function SpeechControl({
  contentKey,
  text,
  isBack = false,
  isPaused = false,
  allowAutoReveal = true,
  repeatCount = 1,
  onRepeatCountChange,
  onFrontSpeechComplete,
  onBackSpeechComplete
}: SpeechControlProps) {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';
  const [settings, setSettings] = useState<SpeechSettings>(loadSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const autoRevealTimer = useRef<number | null>(null);
  const speechState = useRef({
    settings,
    text,
    voices,
    isBack,
    isPaused,
    allowAutoReveal,
    repeatCount,
    contentKey,
    onFrontSpeechComplete,
    onBackSpeechComplete
  });
  speechState.current = {
    settings,
    text,
    voices,
    isBack,
    isPaused,
    allowAutoReveal,
    repeatCount,
    contentKey,
    onFrontSpeechComplete,
    onBackSpeechComplete
  };

  const clearAutoRevealTimer = useCallback(() => {
    if (autoRevealTimer.current === null) return;
    window.clearTimeout(autoRevealTimer.current);
    autoRevealTimer.current = null;
  }, []);

  const scheduleAutoReveal = useCallback(
    (speechContentKey: string) => {
      const current = speechState.current;
      if (
        !current.settings.autoReveal ||
        !current.allowAutoReveal ||
        current.isBack ||
        current.isPaused ||
        current.onFrontSpeechComplete === undefined
      )
        return;

      clearAutoRevealTimer();
      const reveal = () => {
        autoRevealTimer.current = null;
        const latest = speechState.current;
        if (
          latest.contentKey !== speechContentKey ||
          latest.settings.autoReveal === false ||
          latest.allowAutoReveal === false ||
          latest.isBack ||
          latest.isPaused
        )
          return;
        latest.onFrontSpeechComplete?.();
      };

      if (current.settings.autoRevealDelayMs === 0) reveal();
      else autoRevealTimer.current = window.setTimeout(reveal, current.settings.autoRevealDelayMs);
    },
    [clearAutoRevealTimer]
  );

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
    speakText(
      current.text,
      current.settings,
      current.voices,
      current.isBack ? current.repeatCount : 1,
      current.isBack
        ? current.onBackSpeechComplete
        : current.allowAutoReveal && current.settings.autoReveal
          ? () => scheduleAutoReveal(current.contentKey)
          : undefined
    );
  }, [scheduleAutoReveal, supported]);

  useEffect(() => {
    if (
      !allowAutoReveal ||
      settings.autoRead === false ||
      settings.autoReveal === false ||
      isPaused
    )
      clearAutoRevealTimer();
  }, [allowAutoReveal, clearAutoRevealTimer, isPaused, settings.autoRead, settings.autoReveal]);

  useEffect(() => {
    if (settings.autoRead) speak();
    return () => {
      clearAutoRevealTimer();
      if (supported) window.speechSynthesis.cancel();
    };
  }, [clearAutoRevealTimer, contentKey, settings.autoRead, speak, supported]);

  if (!supported)
    return (
      <details className="speech-control">
        <summary>Âm thanh đọc thẻ</summary>
        <div className="speech-settings">
          <p className="muted">Trình duyệt này không hỗ trợ đọc thẻ bằng Web Speech API.</p>
          <SpeechRepeatSetting
            repeatCount={repeatCount}
            onRepeatCountChange={onRepeatCountChange ?? (() => undefined)}
            disabled
          />
        </div>
      </details>
    );

  return (
    <details className="speech-control">
      <summary>Âm thanh đọc thẻ</summary>
      <div className="speech-settings">
        <p className="speech-language-hint">
          Tự động nhận diện tiếng Việt và dùng giọng Việt Nam khi nội dung là tiếng Việt.
        </p>
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
        {allowAutoReveal && (
          <>
            <label className="speech-toggle">
              <input
                type="checkbox"
                checked={settings.autoReveal}
                disabled={!settings.autoRead}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, autoReveal: event.target.checked }))
                }
              />
              Tự động chuyển sang mặt sau sau khi đọc xong mặt trước
            </label>
            <label className="speech-delay-setting">
              <span>
                Thời gian chờ trước khi lật:{' '}
                <strong>{formatAutoRevealDelay(settings.autoRevealDelayMs)}</strong>
              </span>
              <input
                aria-label="Thời gian chờ trước khi lật"
                type="range"
                min="0"
                max="10000"
                step="500"
                value={settings.autoRevealDelayMs}
                disabled={!settings.autoRead || !settings.autoReveal}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    autoRevealDelayMs: Number(event.target.value)
                  }))
                }
              />
              <small className="speech-auto-reveal-hint">
                Thời gian được tính từ lúc đọc xong nội dung mặt trước.
              </small>
            </label>
          </>
        )}
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
        <SpeechRepeatSetting
          repeatCount={repeatCount}
          onRepeatCountChange={onRepeatCountChange ?? (() => undefined)}
        />
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

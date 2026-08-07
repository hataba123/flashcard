import { useEffect, useState } from 'react';

interface ReviewScratchpadValue {
  text: string;
  enabled: boolean;
}

interface ReviewScratchpadProps {
  value: string;
  onChange(value: string): void;
}

const storagePrefix = 'flashcard:review-scratchpad:';

function storagePart(value: string | null | undefined): string {
  return encodeURIComponent(value ?? 'all');
}

export function reviewScratchpadStorageKey(
  userId: string | undefined,
  studyGoalId: string | null,
  studyDate: string | null
): string {
  return `${storagePrefix}${storagePart(userId)}:${storagePart(studyGoalId)}:${storagePart(studyDate)}`;
}

function readValue(key: string): ReviewScratchpadValue {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return { text: '', enabled: false };
    const parsed = JSON.parse(saved) as Partial<ReviewScratchpadValue>;
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      enabled: parsed.enabled === true
    };
  } catch {
    return { text: '', enabled: false };
  }
}

export function useReviewScratchpad(
  userId: string | undefined,
  studyGoalId: string | null,
  studyDate: string | null
) {
  const storageKey = reviewScratchpadStorageKey(userId, studyGoalId, studyDate);
  const [text, setText] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  useEffect(() => {
    const saved = readValue(storageKey);
    setText(saved.text);
    setEnabled(saved.enabled);
    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (hydratedKey !== storageKey) return;
    try {
      const value: ReviewScratchpadValue = { text, enabled };
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ghi chú vẫn hoạt động trong bộ nhớ nếu trình duyệt chặn localStorage.
    }
  }, [enabled, hydratedKey, storageKey, text]);

  return { text, setText, enabled, setEnabled };
}

export function ReviewScratchpad({ value, onChange }: ReviewScratchpadProps) {
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  useEffect(() => {
    setSaveStatus('saving');
    const timer = window.setTimeout(() => setSaveStatus('saved'), 250);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <aside className="review-scratchpad" aria-label="Ghi chú phiên học">
      <header className="review-scratchpad-header">
        <div>
          <span className="review-scratchpad-kicker">Góc ghi nhanh</span>
          <h2>Ghi chú phiên học</h2>
        </div>
        <span className="review-scratchpad-status" aria-live="polite">
          {saveStatus === 'saving' ? 'Đang lưu…' : 'Đã lưu tạm'}
        </span>
      </header>
      <textarea
        value={value}
        aria-label="Nội dung ghi chú phiên học"
        placeholder="Viết điều cần nhớ, ví dụ, hoặc câu hỏi…"
        spellCheck
        onChange={(event) => onChange(event.target.value)}
      />
      <footer className="review-scratchpad-footer">
        <span>{value.length.toLocaleString('vi-VN')} ký tự</span>
        <span>Chỉ lưu tạm trên thiết bị này</span>
      </footer>
    </aside>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

import { ApiError, api } from './api.js';

interface Deck {
  id: string;
  name: string;
  isArchived: boolean;
}

export interface DailyStudyProjection {
  date: string;
  dueCards: number;
  newCards: number;
  totalReviews: number;
  estimatedMinutes: number;
  backlog: number;
  status: 'Rest' | 'Planned' | 'Overloaded' | 'Completed';
}

export interface ForecastSnapshot {
  id: string;
  studyGoalId: string;
  calculatedAtUtc: string;
  predictedNewCardsCompletedDate: string | null;
  predictedCompletionP50Date: string | null;
  predictedCompletionP80Date: string | null;
  predictedCompletionP90Date: string | null;
  probabilityBeforeTarget: number;
  requiredDailyMinutes: number;
  averageNewCardsPerDay: number;
  averageReviewsPerDay: number;
  overloadDays: number;
  confidenceLevel: 'Low' | 'Medium' | 'High';
  feasibility: 'OnTrack' | 'AtRisk' | 'Unrealistic' | 'Completed';
  totalCards: number;
  newCards: number;
  learningCards: number;
  stableCards: number;
  daysRemaining: number;
  dailyProjection: DailyStudyProjection[];
  recommendations: string[];
  scenarios: Array<{
    kind: 'CurrentHabits' | 'TargetDate' | 'SafePlan';
    label: string;
    dailyMinutes: number;
    completionDate: string | null;
    probability: number;
  }>;
}

export interface StudyGoal {
  id: string;
  name: string;
  goalType: 'IELTS' | 'TOEIC' | 'Exam' | 'Interview' | 'Custom';
  targetDate: string;
  dailyStudyMinutes: number;
  studyDaysOfWeek: number[];
  desiredRetention: number;
  finalReviewDays: number;
  maxNewCardsPerDay: number;
  timeZone: string;
  status: 'Active' | 'Paused' | 'Completed' | 'Archived';
  decks: Array<{ deckId: string; deckName: string; priorityWeight: number }>;
  createdAtUtc: string;
  updatedAtUtc: string;
  latestForecast?: ForecastSnapshot | null;
}

interface StudyGoalList {
  items: StudyGoal[];
  total: number;
}

const goalSchema = z.object({
  name: z.string().trim().min(1, 'Hãy nhập tên mục tiêu.').max(200),
  goalType: z.enum(['IELTS', 'TOEIC', 'Exam', 'Interview', 'Custom']),
  targetDate: z.string().refine((date) => date >= today(), 'Ngày mục tiêu không được ở quá khứ.'),
  dailyStudyMinutes: z.coerce.number().int().min(1, 'Thời gian học phải từ 1 phút.').max(1440),
  desiredRetention: z.coerce.number().min(0.7).max(0.97),
  finalReviewDays: z.coerce.number().int().min(0).max(90),
  maxNewCardsPerDay: z.coerce.number().int().min(0).max(1000),
  timeZone: z.string().min(1, 'Hãy nhập múi giờ.')
});

type GoalForm = z.infer<typeof goalSchema>;

const WEEK_DAYS = [
  [1, 'Thứ 2'],
  [2, 'Thứ 3'],
  [3, 'Thứ 4'],
  [4, 'Thứ 5'],
  [5, 'Thứ 6'],
  [6, 'Thứ 7'],
  [0, 'Chủ nhật']
] as const;

export function StudyPlanPage() {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<StudyGoal | null | undefined>();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const goals = useQuery({
    queryKey: ['study-goals'],
    queryFn: () => api.get<StudyGoalList>('/study-goals?page=1&pageSize=100')
  });
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api.get<Deck[]>('/decks') });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/study-goals/${id}`),
    onSuccess: async () => {
      setSelectedGoalId(null);
      await client.invalidateQueries({ queryKey: ['study-goals'] });
    }
  });

  useEffect(() => {
    const deckId = params.get('deckId');
    if (deckId !== null && decks.data?.some((deck) => deck.id === deckId)) setEditing(null);
  }, [decks.data, params]);

  const finish = async (goal: StudyGoal) => {
    setEditing(undefined);
    setParams({});
    setSelectedGoalId(goal.id);
    await client.invalidateQueries({ queryKey: ['study-goals'] });
  };

  return (
    <main className="study-plan-page">
      <header className="study-plan-header">
        <div>
          <h1>Kế hoạch học tập</h1>
          <p>Dự báo dựa trên lịch sử học và dữ liệu hiện tại.</p>
        </div>
        <button type="button" onClick={() => setEditing(null)}>
          Tạo mục tiêu
        </button>
      </header>

      {editing !== undefined && (
        <GoalEditor
          goal={editing}
          decks={decks.data ?? []}
          initialDeckId={params.get('deckId')}
          onDone={finish}
          onCancel={() => {
            setEditing(undefined);
            setParams({});
          }}
        />
      )}

      <section className="study-goal-workbench" aria-label="Danh sách và chi tiết mục tiêu">
        <div className="study-goal-list-panel">
          <div className="study-section-heading">
            <h2>Mục tiêu của bạn</h2>
            <span>{goals.data?.total ?? 0} mục tiêu</span>
          </div>
          {goals.isLoading ? (
            <GoalListSkeleton />
          ) : goals.isError ? (
            <QueryFailure onRetry={() => void goals.refetch()} />
          ) : goals.data?.items.length === 0 ? (
            <div className="study-empty-state">
              <h3>Bạn chưa có kế hoạch học tập.</h3>
              <p>Tạo mục tiêu để hệ thống dự đoán khối lượng học và ngày hoàn thành.</p>
              <button type="button" onClick={() => setEditing(null)}>
                Tạo mục tiêu
              </button>
            </div>
          ) : (
            <div className="study-goal-list">
              {goals.data?.items.map((goal) => (
                <GoalListItem
                  key={goal.id}
                  goal={goal}
                  selected={selectedGoalId === goal.id}
                  onSelect={() => setSelectedGoalId(goal.id)}
                  onEdit={() => setEditing(goal)}
                  onArchive={() => archive.mutate(goal.id)}
                  archivePending={archive.isPending}
                />
              ))}
            </div>
          )}
        </div>
        <aside className="study-plan-placeholder">
          <h2>Chọn một mục tiêu</h2>
          <p>Chọn mục tiêu trong danh sách để xem dự báo, tải học và lịch từng ngày.</p>
        </aside>
      </section>
    </main>
  );
}

function GoalEditor({
  goal,
  decks,
  initialDeckId,
  onDone,
  onCancel
}: {
  goal: StudyGoal | null;
  decks: Deck[];
  initialDeckId: string | null;
  onDone(goal: StudyGoal): Promise<void>;
  onCancel(): void;
}) {
  const [studyDays, setStudyDays] = useState(goal?.studyDaysOfWeek ?? [1, 2, 3, 4, 5, 6]);
  const [priorities, setPriorities] = useState<Record<string, number>>(() => {
    const selected = Object.fromEntries(
      (goal?.decks ?? []).map((deck) => [deck.deckId, deck.priorityWeight])
    );
    if (initialDeckId !== null) selected[initialDeckId] = selected[initialDeckId] ?? 1;
    return selected;
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<GoalForm>({
    defaultValues: {
      name: goal?.name ?? '',
      goalType: goal?.goalType ?? 'IELTS',
      targetDate: goal?.targetDate ?? addDays(today(), 90),
      dailyStudyMinutes: goal?.dailyStudyMinutes ?? 45,
      desiredRetention: goal?.desiredRetention ?? 0.9,
      finalReviewDays: goal?.finalReviewDays ?? 10,
      maxNewCardsPerDay: goal?.maxNewCardsPerDay ?? 50,
      timeZone: goal?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  });
  const save = useMutation({
    mutationFn: async (values: GoalForm) => {
      const parsed = goalSchema.parse(values);
      if (studyDays.length === 0) throw new Error('Hãy chọn ít nhất một ngày học trong tuần.');
      const payload = {
        ...parsed,
        studyDaysOfWeek: studyDays,
        decks: Object.entries(priorities).map(([deckId, priorityWeight]) => ({
          deckId,
          priorityWeight
        }))
      };
      return goal === null
        ? api.post<StudyGoal>('/study-goals', payload)
        : api.patch<StudyGoal>(`/study-goals/${goal.id}`, payload);
    },
    onSuccess: (saved) => void onDone(saved),
    onError: (error) => setSubmitError(messageFor(error))
  });

  return (
    <section className="study-goal-editor" aria-labelledby="goal-editor-title">
      <div className="study-section-heading">
        <h2 id="goal-editor-title">{goal === null ? 'Tạo mục tiêu' : 'Sửa mục tiêu'}</h2>
        <span>Các trường có dấu * là bắt buộc</span>
      </div>
      <form onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate>
        <div className="study-form-grid">
          <Field label="Tên mục tiêu *">
            <input aria-required="true" {...form.register('name')} />
          </Field>
          <Field label="Loại mục tiêu *">
            <select {...form.register('goalType')}>
              <option value="IELTS">IELTS</option>
              <option value="TOEIC">TOEIC</option>
              <option value="Exam">Kỳ thi</option>
              <option value="Interview">Phỏng vấn</option>
              <option value="Custom">Tùy chỉnh</option>
            </select>
          </Field>
          <Field label="Ngày mục tiêu *">
            <input type="date" min={today()} {...form.register('targetDate')} />
          </Field>
          <Field label="Múi giờ *">
            <input {...form.register('timeZone')} />
          </Field>
          <Field label="Phút học mỗi ngày *">
            <input type="number" min="1" max="1440" {...form.register('dailyStudyMinutes')} />
          </Field>
          <Field label="Desired retention *">
            <input
              type="number"
              min="0.7"
              max="0.97"
              step="0.01"
              {...form.register('desiredRetention')}
            />
          </Field>
          <Field label="Ngày ôn tổng hợp">
            <input type="number" min="0" max="90" {...form.register('finalReviewDays')} />
          </Field>
          <Field label="Thẻ mới tối đa/ngày">
            <input type="number" min="0" max="1000" {...form.register('maxNewCardsPerDay')} />
          </Field>
        </div>
        <fieldset>
          <legend>Ngày học trong tuần *</legend>
          <div className="study-choice-row">
            {WEEK_DAYS.map(([value, label]) => (
              <label className="study-choice" key={value}>
                <input
                  type="checkbox"
                  checked={studyDays.includes(value)}
                  onChange={(event) =>
                    setStudyDays((current) =>
                      event.target.checked
                        ? [...current, value]
                        : current.filter((day) => day !== value)
                    )
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Bộ thẻ và mức ưu tiên</legend>
          <div className="study-deck-picker">
            {decks
              .filter((deck) => !deck.isArchived)
              .map((deck) => {
                const selected = priorities[deck.id] !== undefined;
                return (
                  <div className="study-deck-option" key={deck.id}>
                    <label className="study-choice">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          setPriorities((current) => {
                            if (event.target.checked) return { ...current, [deck.id]: 1 };
                            const next = { ...current };
                            delete next[deck.id];
                            return next;
                          })
                        }
                      />
                      <span>{deck.name}</span>
                    </label>
                    <input
                      aria-label={`Mức ưu tiên của ${deck.name}`}
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.25"
                      disabled={!selected}
                      value={priorities[deck.id] ?? 1}
                      onChange={(event) =>
                        setPriorities((current) => ({
                          ...current,
                          [deck.id]: Number(event.target.value)
                        }))
                      }
                    />
                  </div>
                );
              })}
          </div>
        </fieldset>
        {submitError !== null && (
          <p className="study-form-error" role="alert">
            {submitError}
          </p>
        )}
        <div className="actions">
          <button type="submit" disabled={save.isPending} aria-busy={save.isPending}>
            {save.isPending ? 'Đang lưu…' : goal === null ? 'Tạo mục tiêu' : 'Lưu thay đổi'}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Hủy
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function GoalListItem({
  goal,
  selected,
  onSelect,
  onEdit,
  onArchive,
  archivePending
}: {
  goal: StudyGoal;
  selected: boolean;
  onSelect(): void;
  onEdit(): void;
  onArchive(): void;
  archivePending: boolean;
}) {
  const forecast = goal.latestForecast;
  return (
    <article className={selected ? 'study-goal-row selected' : 'study-goal-row'}>
      <button className="study-goal-main" type="button" onClick={onSelect}>
        <span>
          <strong>{goal.name}</strong>
          <small>
            {formatDate(goal.targetDate)} · {daysUntil(goal.targetDate)} ngày còn lại
          </small>
        </span>
        <span className={`study-status ${forecast?.feasibility ?? 'pending'}`}>
          {forecast === undefined || forecast === null
            ? 'Chưa dự báo'
            : feasibilityLabel(forecast.feasibility)}
        </span>
        <span className="study-goal-numbers">
          <b>
            {forecast === undefined || forecast === null
              ? '—'
              : `${Math.round(forecast.probabilityBeforeTarget * 100)}%`}
          </b>
          <small>P50 {formatDate(forecast?.predictedCompletionP50Date ?? null)}</small>
          <small>P80 {formatDate(forecast?.predictedCompletionP80Date ?? null)}</small>
        </span>
      </button>
      <div className="study-row-actions">
        <button type="button" className="secondary" onClick={onEdit}>
          Sửa
        </button>
        <button type="button" className="danger" disabled={archivePending} onClick={onArchive}>
          Lưu trữ
        </button>
      </div>
    </article>
  );
}

function GoalListSkeleton() {
  return (
    <div className="study-list-skeleton" aria-label="Đang tải mục tiêu" aria-busy="true">
      {[1, 2, 3].map((item) => (
        <span key={item} />
      ))}
    </div>
  );
}

function QueryFailure({ onRetry }: { onRetry(): void }) {
  return (
    <div className="study-query-error" role="alert">
      <h3>Không thể tải kế hoạch học tập.</h3>
      <p>Kiểm tra kết nối rồi thử lại.</p>
      <button type="button" className="secondary" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Dữ liệu chưa hợp lệ.';
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Không thể lưu mục tiêu. Hãy thử lại.';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(date: string, days: number) {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
function daysUntil(date: string) {
  return Math.max(
    0,
    Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000)
  );
}
export function formatDate(date: string | null) {
  return date === null
    ? '—'
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'UTC' }).format(
        new Date(`${date.slice(0, 10)}T00:00:00Z`)
      );
}
export function feasibilityLabel(value: ForecastSnapshot['feasibility']) {
  return {
    OnTrack: 'Đúng tiến độ',
    AtRisk: 'Có rủi ro',
    Unrealistic: 'Chưa khả thi',
    Completed: 'Đã hoàn thành'
  }[value];
}

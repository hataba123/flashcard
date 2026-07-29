import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StudyGoalDailyAvailabilityModel, TimeBoxedDailyPlan } from '@flashcard/contracts';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';

import { ApiError, api } from './api.js';
import { offlineDb } from './offline-db.js';
import { useOffline } from './offline-provider.js';

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
  maxNewCardsPerDay: z.coerce.number().int().min(0).max(10_000),
  timeZone: z.string().min(1, 'Hãy nhập múi giờ.')
});

export const dailyAvailabilityMinutesSchema = z
  .string()
  .trim()
  .min(1, 'Hãy nhập số phút bạn có thể học hôm nay.')
  .regex(/^\d+$/, 'Thời gian phải là số nguyên, không chứa dấu hoặc ký tự khác.')
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .min(1, 'Thời gian tối thiểu là 1 phút.')
      .max(720, 'Thời gian tối đa là 720 phút.')
  );

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
  const offline = useOffline();
  const [goalsCachedAtUtc, setGoalsCachedAtUtc] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<StudyGoal | null | undefined>();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const goals = useQuery({
    queryKey: ['study-goals'],
    queryFn: async () => {
      try {
        const data = await api.get<StudyGoalList>('/study-goals?page=1&pageSize=100');
        const cachedAtUtc = new Date().toISOString();
        await offlineDb.studyGoals.put({ id: 'current', data, cachedAtUtc });
        setGoalsCachedAtUtc(null);
        return data;
      } catch (error) {
        const cached = await offlineDb.studyGoals.get('current');
        if (cached === undefined) throw error;
        setGoalsCachedAtUtc(cached.cachedAtUtc);
        return cached.data as StudyGoalList;
      }
    },
    retry: false
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
  const selectedGoal = goals.data?.items.find((goal) => goal.id === selectedGoalId);

  return (
    <main className="study-plan-page">
      <header className="study-plan-header">
        <div>
          <h1>Kế hoạch học tập</h1>
          <p>Dự báo dựa trên lịch sử học và dữ liệu hiện tại.</p>
        </div>
        <button type="button" disabled={!offline.online} onClick={() => setEditing(null)}>
          Tạo mục tiêu
        </button>
      </header>

      {goalsCachedAtUtc !== null && (
        <p className="study-offline-notice" role="status">
          Đang hiển thị danh sách đã lưu lúc {formatDateTime(goalsCachedAtUtc)}.
          {!offline.online && ' Các thay đổi cần kết nối mạng.'}
        </p>
      )}

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
              <button type="button" disabled={!offline.online} onClick={() => setEditing(null)}>
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
                  mutationDisabled={!offline.online}
                />
              ))}
            </div>
          )}
        </div>
        {selectedGoal === undefined ? (
          <aside className="study-plan-placeholder">
            <h2>Chọn một mục tiêu</h2>
            <p>Chọn mục tiêu trong danh sách để xem dự báo, tải học và lịch từng ngày.</p>
          </aside>
        ) : (
          <ForecastDashboard goal={selectedGoal} />
        )}
      </section>
    </main>
  );
}

function ForecastDashboard({ goal }: { goal: StudyGoal }) {
  return (
    <div className="study-goal-detail">
      <DailyAvailabilityPanel goal={goal} />
      <ForecastPanel goal={goal} />
    </div>
  );
}

function DailyAvailabilityPanel({ goal }: { goal: StudyGoal }) {
  const client = useQueryClient();
  const offline = useOffline();
  const studyDate = dateInTimeZone(goal.timeZone);
  const [minutes, setMinutes] = useState(String(goal.dailyStudyMinutes));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const availability = useQuery({
    queryKey: ['study-goal-daily-availability', goal.id, studyDate],
    queryFn: () =>
      api.get<StudyGoalDailyAvailabilityModel>(
        `/study-goals/${goal.id}/daily-availability?date=${studyDate}`
      ),
    enabled: offline.online,
    retry: false
  });
  const dailyPlan = useQuery({
    queryKey: ['study-goal-time-boxed-plan', goal.id, studyDate],
    queryFn: () =>
      api.get<TimeBoxedDailyPlan>(`/study-goals/${goal.id}/daily-plan?date=${studyDate}`),
    enabled: offline.online && availability.isSuccess,
    retry: false
  });

  useEffect(() => {
    if (availability.data !== undefined) {
      setMinutes(String(availability.data.availableMinutes ?? availability.data.effectiveMinutes));
    }
  }, [availability.data]);

  const save = useMutation({
    mutationFn: (availableMinutes: number) =>
      api.put<StudyGoalDailyAvailabilityModel>(`/study-goals/${goal.id}/daily-availability`, {
        date: studyDate,
        availableMinutes
      }),
    onSuccess: async (data) => {
      client.setQueryData(['study-goal-daily-availability', goal.id, studyDate], data);
      setSuccessMessage(`Đã lưu ${data.effectiveMinutes} phút cho hôm nay.`);
      await dailyPlan.refetch();
    }
  });
  const clear = useMutation({
    mutationFn: () => api.delete(`/study-goals/${goal.id}/daily-availability?date=${studyDate}`),
    onSuccess: async () => {
      const data: StudyGoalDailyAvailabilityModel = {
        date: studyDate,
        availableMinutes: null,
        defaultDailyMinutes: goal.dailyStudyMinutes,
        effectiveMinutes: goal.dailyStudyMinutes
      };
      client.setQueryData(['study-goal-daily-availability', goal.id, studyDate], data);
      setMinutes(String(goal.dailyStudyMinutes));
      setSuccessMessage(`Đã dùng lại ngân sách mặc định ${goal.dailyStudyMinutes} phút.`);
      await dailyPlan.refetch();
    }
  });
  const pending = save.isPending || clear.isPending || dailyPlan.isFetching;
  const submit = () => {
    setValidationError(null);
    setSuccessMessage(null);
    const parsed = dailyAvailabilityMinutesSchema.safeParse(minutes);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Số phút chưa hợp lệ.');
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <section className="study-availability-panel" aria-labelledby="daily-availability-title">
      <div className="study-availability-heading">
        <div>
          <p className="eyebrow">Phiên hôm nay</p>
          <h2 id="daily-availability-title">Bạn rảnh bao nhiêu phút để học hôm nay?</h2>
        </div>
        <span className="study-default-budget">Mặc định {goal.dailyStudyMinutes} phút/ngày</span>
      </div>

      {!offline.online && (
        <p className="study-offline-notice" role="status">
          Bạn đang offline. Kết nối mạng để lưu thời gian và tạo kế hoạch hôm nay.
        </p>
      )}
      {availability.isLoading && <AvailabilitySkeleton />}
      {availability.isError && (
        <div className="study-query-error">
          <p>Không thể tải thời gian học hôm nay.</p>
          <button className="secondary" type="button" onClick={() => void availability.refetch()}>
            Thử lại
          </button>
        </div>
      )}
      {!availability.isLoading && !availability.isError && (
        <>
          <div className="study-minute-presets" role="group" aria-label="Chọn nhanh số phút">
            {[5, 10, 20, 30].map((value) => (
              <button
                key={value}
                type="button"
                className={minutes === String(value) ? 'active' : 'secondary'}
                disabled={pending || !offline.online}
                onClick={() => {
                  setMinutes(String(value));
                  setValidationError(null);
                  setSuccessMessage(null);
                }}
              >
                {value} phút
              </button>
            ))}
          </div>
          <label className="study-custom-minutes">
            <span>Hoặc nhập số phút khác</span>
            <div>
              <input
                value={minutes}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-invalid={validationError !== null}
                aria-describedby={validationError === null ? undefined : 'availability-error'}
                disabled={pending || !offline.online}
                onChange={(event) => {
                  setMinutes(event.target.value);
                  setValidationError(null);
                  setSuccessMessage(null);
                }}
              />
              <span>phút</span>
            </div>
          </label>
          <div className="study-availability-actions">
            <button
              type="button"
              disabled={pending || !offline.online}
              aria-busy={pending}
              onClick={submit}
            >
              {save.isPending || dailyPlan.isFetching
                ? 'Đang tạo kế hoạch…'
                : 'Tạo kế hoạch hôm nay'}
            </button>
            {availability.data?.availableMinutes !== null &&
              availability.data?.availableMinutes !== undefined && (
                <button
                  className="secondary"
                  type="button"
                  disabled={pending || !offline.online}
                  onClick={() => clear.mutate()}
                >
                  Dùng thời gian mặc định
                </button>
              )}
          </div>
          {validationError !== null && (
            <p id="availability-error" className="study-form-error" role="alert">
              {validationError}
            </p>
          )}
          {(save.isError || clear.isError) && (
            <p className="study-form-error" role="alert">
              {messageFor(save.error ?? clear.error)}
            </p>
          )}
          {successMessage !== null && (
            <p className="study-save-success" role="status">
              {successMessage}
            </p>
          )}
        </>
      )}

      {dailyPlan.isLoading ? (
        <AvailabilitySkeleton />
      ) : dailyPlan.isError ? (
        <div className="study-query-error">
          <p>Không thể tạo kế hoạch hôm nay.</p>
          <button className="secondary" type="button" onClick={() => void dailyPlan.refetch()}>
            Thử lại
          </button>
        </div>
      ) : dailyPlan.data !== undefined ? (
        <TimeBoxedPlanView plan={dailyPlan.data} />
      ) : null}
    </section>
  );
}

function TimeBoxedPlanView({ plan }: { plan: TimeBoxedDailyPlan }) {
  const plannedCards = plan.sections
    .filter((section) => section.type !== 'QUICK_CHECK')
    .reduce((total, section) => total + section.estimatedCardCount, 0);
  return (
    <section
      className="study-time-box"
      aria-label={`Kế hoạch hôm nay ${plan.requestedMinutes} phút`}
    >
      <div className="study-time-box-title">
        <div>
          <p className="eyebrow">Kế hoạch hôm nay</p>
          <h3>{plan.requestedMinutes} phút đã dành</h3>
        </div>
        <strong>{plan.estimatedTotalMinutes} phút dự kiến</strong>
      </div>
      {plan.sections.length === 0 ? (
        <div className="study-plan-empty">
          <h3>Hôm nay không có thẻ cần học trong mục tiêu này.</h3>
          <p>Bạn đã xử lý hết khối lượng hiện tại. Hãy quay lại khi có thẻ đến hạn mới.</p>
        </div>
      ) : (
        <>
          <div className="study-time-ruler" aria-hidden="true">
            {plan.sections.map((section) => (
              <span
                key={section.type}
                data-section={section.type}
                style={{ flexGrow: section.allocatedMinutes }}
              />
            ))}
          </div>
          <div className="study-time-sections">
            {plan.sections.map((section) => (
              <article key={section.type}>
                <span className="study-time-dot" data-section={section.type} aria-hidden="true" />
                <div>
                  <strong>{section.title}</strong>
                  <small>{section.reason}</small>
                </div>
                <b>{section.allocatedMinutes} phút</b>
                <span>{section.estimatedCardCount} lượt dự kiến</span>
              </article>
            ))}
          </div>
        </>
      )}
      {plan.adjustmentReason !== undefined && (
        <p className="study-adjustment-note">{plan.adjustmentReason}</p>
      )}
      {plannedCards > 0 && (
        <Link
          className="button-link study-start-session"
          to={`/review?studyGoalId=${plan.studyGoalId}&date=${plan.date}`}
        >
          Bắt đầu phiên {plan.requestedMinutes} phút
        </Link>
      )}
    </section>
  );
}

function AvailabilitySkeleton() {
  return (
    <div className="study-availability-skeleton" aria-busy="true" aria-label="Đang tải kế hoạch">
      <span />
      <span />
    </div>
  );
}

function ForecastPanel({ goal }: { goal: StudyGoal }) {
  const client = useQueryClient();
  const offline = useOffline();
  const [cachedAtUtc, setCachedAtUtc] = useState<string | null>(null);
  const [range, setRange] = useState<'7' | '30' | 'all'>('30');
  const [page, setPage] = useState(1);
  const forecast = useQuery({
    queryKey: ['study-goal-forecast', goal.id],
    queryFn: async () => {
      try {
        const data = await api.get<ForecastSnapshot>(`/study-goals/${goal.id}/forecast/latest`);
        const storedAtUtc = new Date().toISOString();
        await offlineDb.transaction(
          'rw',
          offlineDb.studyGoalForecasts,
          offlineDb.studyGoalDailyPlans,
          async () => {
            await offlineDb.studyGoalForecasts.put({
              studyGoalId: goal.id,
              data,
              cachedAtUtc: storedAtUtc
            });
            await offlineDb.studyGoalDailyPlans.put({
              studyGoalId: goal.id,
              data: data.dailyProjection,
              cachedAtUtc: storedAtUtc
            });
          }
        );
        setCachedAtUtc(null);
        return data;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) throw error;
        const cached = await offlineDb.studyGoalForecasts.get(goal.id);
        if (cached === undefined) throw error;
        setCachedAtUtc(cached.cachedAtUtc);
        return cached.data as ForecastSnapshot;
      }
    },
    retry: false
  });
  const calculate = useMutation({
    mutationFn: () => api.post<ForecastSnapshot>(`/study-goals/${goal.id}/forecast`, {}),
    onSuccess: async (snapshot) => {
      client.setQueryData(['study-goal-forecast', goal.id], snapshot);
      await client.invalidateQueries({ queryKey: ['study-goals'] });
    }
  });
  const missing = forecast.error instanceof ApiError && forecast.error.status === 404;

  if (forecast.isLoading) return <ForecastSkeleton />;
  if (forecast.isError && !missing) {
    return (
      <aside className="study-forecast-panel">
        <QueryFailure onRetry={() => void forecast.refetch()} />
      </aside>
    );
  }
  if (forecast.data === undefined) {
    return (
      <aside className="study-forecast-panel study-forecast-empty">
        <h2>Chưa có dự báo</h2>
        <p>Chạy dự báo để mô phỏng lịch học từ trạng thái FSRS và lịch sử ôn tập hiện tại.</p>
        <button
          type="button"
          disabled={calculate.isPending || !offline.online}
          aria-busy={calculate.isPending}
          onClick={() => calculate.mutate()}
        >
          {calculate.isPending ? 'Đang mô phỏng…' : 'Chạy dự báo'}
        </button>
        {calculate.isError && (
          <p className="study-form-error" role="alert">
            {messageFor(calculate.error)}
          </p>
        )}
      </aside>
    );
  }

  const data = forecast.data;
  const rangedDays =
    range === 'all' ? data.dailyProjection : data.dailyProjection.slice(0, Number(range));
  const chartDays = aggregateProjection(rangedDays, 60);
  const pageSize = 14;
  const pageCount = Math.max(1, Math.ceil(data.dailyProjection.length / pageSize));
  const visibleDays = data.dailyProjection.slice((page - 1) * pageSize, page * pageSize);
  return (
    <aside className="study-forecast-panel">
      <div className="study-forecast-title">
        <div>
          <h2>{goal.name}</h2>
          <p>Cập nhật {formatDateTime(data.calculatedAtUtc)}</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={calculate.isPending || !offline.online}
          aria-busy={calculate.isPending}
          onClick={() => calculate.mutate()}
        >
          {calculate.isPending ? 'Đang tính…' : 'Tính lại'}
        </button>
      </div>

      {cachedAtUtc !== null && (
        <p className="study-offline-notice" role="status">
          Đang hiển thị dự báo đã lưu lúc {formatDateTime(cachedAtUtc)}.
          {!offline.online && ' Kết nối mạng để tính lại.'}
        </p>
      )}

      <div className={`study-track-banner ${data.feasibility}`}>
        <strong>{feasibilityLabel(data.feasibility)}</strong>
        <span>
          {Math.round(data.probabilityBeforeTarget * 100)}% khả năng hoàn thành đúng hạn · độ tin
          cậy {confidenceLabel(data.confidenceLevel)}
        </span>
      </div>
      {data.confidenceLevel === 'Low' && (
        <p className="study-confidence-note">Độ tin cậy thấp – chưa đủ dữ liệu học thực tế.</p>
      )}

      <section className="study-summary-grid" aria-label="Tổng quan dự báo">
        <ForecastMetric
          label="Ngày học hết thẻ mới"
          value={formatDate(data.predictedNewCardsCompletedDate)}
        />
        <ForecastMetric
          label="Ngày hoàn thành dự kiến (P50)"
          value={formatDate(data.predictedCompletionP50Date)}
        />
        <ForecastMetric
          label="Ngày hoàn thành an toàn (P80)"
          value={formatDate(data.predictedCompletionP80Date)}
        />
        <ForecastMetric
          label="Xác suất đúng hạn"
          value={`${Math.round(data.probabilityBeforeTarget * 100)}%`}
        />
        <ForecastMetric
          label="Thời gian cần học/ngày"
          value={`${Math.round(data.requiredDailyMinutes)} phút`}
        />
        <ForecastMetric
          label="Tải ôn trung bình"
          value={`${Math.round(data.averageReviewsPerDay)} lượt/ngày`}
        />
      </section>

      <section className="study-card-counts" aria-label="Trạng thái thẻ">
        <span>
          <b>{data.totalCards}</b>Tổng thẻ
        </span>
        <span>
          <b>{data.newCards}</b>Chưa học
        </span>
        <span>
          <b>{data.learningCards}</b>Đang học
        </span>
        <span>
          <b>{data.stableCards}</b>Ổn định
        </span>
      </section>

      {data.recommendations.length > 0 && (
        <section className="study-warnings">
          <h3>Cảnh báo và điều chỉnh</h3>
          <p>Kế hoạch có {data.overloadDays} ngày dự kiến quá tải.</p>
          <ul>
            {data.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="study-scenarios">
        <h3>Ba phương án</h3>
        <div>
          {data.scenarios.map((scenario) => (
            <article key={scenario.kind}>
              <strong>{scenario.label}</strong>
              <span>{scenario.dailyMinutes} phút/ngày</span>
              <small>
                {formatDate(scenario.completionDate)} · {Math.round(scenario.probability * 100)}%
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="study-chart-section">
        <div className="study-section-heading">
          <h3>Biểu đồ tải học</h3>
          <div className="study-range-tabs" role="group" aria-label="Khoảng thời gian biểu đồ">
            {(['7', '30', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={range === value ? 'active' : 'secondary'}
                onClick={() => setRange(value)}
              >
                {value === 'all' ? 'Toàn bộ' : `${value} ngày`}
              </button>
            ))}
          </div>
        </div>
        <ProjectionChart days={chartDays} />
      </section>

      <section className="study-daily-section">
        <div className="study-section-heading">
          <h3>Kế hoạch từng ngày</h3>
          <span>
            Trang {page}/{pageCount}
          </span>
        </div>
        <div className="study-daily-table-wrap">
          <table className="study-daily-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Đến hạn</th>
                <th>Thẻ mới</th>
                <th>Tổng lượt</th>
                <th>Phút</th>
                <th>Backlog</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((day) => (
                <tr key={day.date}>
                  <td data-label="Ngày">{formatDate(day.date)}</td>
                  <td data-label="Đến hạn">{day.dueCards}</td>
                  <td data-label="Thẻ mới">{day.newCards}</td>
                  <td data-label="Tổng lượt">{day.totalReviews}</td>
                  <td data-label="Phút">{day.estimatedMinutes}</td>
                  <td data-label="Backlog">{day.backlog}</td>
                  <td data-label="Trạng thái">
                    <span className={`study-day-status ${day.status}`}>
                      {dayStatusLabel(day.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="study-pagination">
          <button
            type="button"
            className="secondary"
            disabled={page === 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Trang trước
          </button>
          <button
            type="button"
            className="secondary"
            disabled={page === pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            Trang sau
          </button>
        </div>
      </section>
    </aside>
  );
}

function ForecastMetric({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function ProjectionChart({ days }: { days: DailyStudyProjection[] }) {
  const maximum = Math.max(
    1,
    ...days.map((day) => Math.max(day.dueCards, day.newCards, day.estimatedMinutes))
  );
  if (days.length === 0) return <p className="study-helper">Chưa có dữ liệu lịch học.</p>;
  return (
    <div
      className="study-chart"
      role="img"
      aria-label="Biểu đồ thẻ mới, thẻ ôn và phút học dự kiến"
    >
      {days.map((day) => (
        <div
          className="study-chart-column"
          key={day.date}
          title={`${formatDate(day.date)}: ${day.newCards} mới, ${day.dueCards} ôn, ${day.estimatedMinutes} phút`}
        >
          <span
            className="review"
            style={{ height: `${Math.max(2, (day.dueCards / maximum) * 100)}%` }}
          />
          <span
            className="new"
            style={{ height: `${Math.max(2, (day.newCards / maximum) * 100)}%` }}
          />
          <span
            className="minutes"
            style={{ height: `${Math.max(2, (day.estimatedMinutes / maximum) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function ForecastSkeleton() {
  return (
    <aside
      className="study-forecast-panel study-forecast-skeleton"
      aria-label="Đang tải dự báo"
      aria-busy="true"
    >
      <span />
      <span />
      <span />
    </aside>
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
  const offline = useOffline();
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
            <input type="number" min="0" max="10000" {...form.register('maxNewCardsPerDay')} />
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
          <button
            type="submit"
            disabled={save.isPending || !offline.online}
            aria-busy={save.isPending}
          >
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
  archivePending,
  mutationDisabled
}: {
  goal: StudyGoal;
  selected: boolean;
  onSelect(): void;
  onEdit(): void;
  onArchive(): void;
  archivePending: boolean;
  mutationDisabled: boolean;
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
        <button type="button" className="secondary" disabled={mutationDisabled} onClick={onEdit}>
          Sửa
        </button>
        <button
          type="button"
          className="danger"
          disabled={archivePending || mutationDisabled}
          onClick={onArchive}
        >
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
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
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

function confidenceLabel(value: ForecastSnapshot['confidenceLevel']) {
  return { Low: 'thấp', Medium: 'trung bình', High: 'cao' }[value];
}

function dayStatusLabel(value: DailyStudyProjection['status']) {
  return { Rest: 'Nghỉ', Planned: 'Đã lên lịch', Overloaded: 'Quá tải', Completed: 'Hoàn thành' }[
    value
  ];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function aggregateProjection(days: DailyStudyProjection[], limit: number): DailyStudyProjection[] {
  if (days.length <= limit) return days;
  const size = Math.ceil(days.length / limit);
  const result: DailyStudyProjection[] = [];
  for (let index = 0; index < days.length; index += size) {
    const group = days.slice(index, index + size);
    const first = group[0];
    if (first === undefined) continue;
    result.push({
      date: first.date,
      dueCards: group.reduce((sum, day) => sum + day.dueCards, 0),
      newCards: group.reduce((sum, day) => sum + day.newCards, 0),
      totalReviews: group.reduce((sum, day) => sum + day.totalReviews, 0),
      estimatedMinutes: group.reduce((sum, day) => sum + day.estimatedMinutes, 0),
      backlog: Math.max(...group.map((day) => day.backlog)),
      status: group.some((day) => day.status === 'Overloaded') ? 'Overloaded' : first.status
    });
  }
  return result;
}

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type TouchEvent
} from 'react';
import { useForm } from 'react-hook-form';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useSearchParams
} from 'react-router';
import { z } from 'zod';
import { schedulingService } from '@flashcard/scheduling';
import type {
  DailyBrowseResponse,
  DailyBrowseScope,
  DailyBrowseSummary,
  DataTransferExport,
  DataTransferImportSummary,
  TimeBoxedDailyPlan
} from '@flashcard/contracts';

import { ApiError, api } from './api.js';
import {
  offlineDb,
  getDeviceId,
  resetAfterDataTransfer,
  setDeviceId as persistDeviceId,
  dailyBrowseCompletionId,
  type CachedReviewCard
} from './offline-db.js';
import {
  cacheDailyBrowseResponse,
  currentDailyBrowseContext,
  loadOfflineDailyBrowse,
  recordDailyBrowseExposure
} from './daily-browse.js';
import { OfflineProvider, useOffline } from './offline-provider.js';
import { prepareForDataTransfer } from './offline-sync.js';
import { loadMediaBlob, mediaQueryKey, mediaQueryStaleTimeMs } from './media-cache.js';
import { ReviewControls } from './review-controls.js';
import { ratingForShortcut, reviewSessionTimeProgress, type ReviewRating } from './review-utils.js';
import { useSession, type User } from './session.js';
import { getCardSpeechText, SpeechControl } from './speech-control.js';
import { NotesPage } from './notes-page.js';
import { StudyPlanPage } from './study-plan-page.js';
import { WeaknessAnalysis, type WeaknessAnalysisData } from './weakness-analysis.js';
import {
  ThemeToggle,
  applyDisplayPreferences,
  readDisplayPreferences,
  useReviewDisplayPreferences,
  type ReviewCardWidth,
  type ReviewFontSize
} from './display-preferences.js';
import './styles.css';
import './hallmark.css';
import './study-plan.css';

interface Deck {
  id: string;
  name: string;
  description: string | null;
  desiredRetention: number;
  dailyNewCardLimit: number;
  isCore: boolean;
  isArchived: boolean;
}
interface Note {
  id: string;
  deckId: string;
  noteType: 'Basic' | 'BasicAndReverse' | 'Cloze';
  fieldsJson: string;
  tagsJson: string;
}
interface ReviewCard {
  id: string;
  noteId: string;
  deckId: string;
  templateOrdinal: number;
  version: number;
  state: 'New' | 'Learning' | 'Review' | 'Relearning';
  dueAtUtc: string;
  lastReviewAtUtc: string | null;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningStep: number;
  reviewCount: number;
  lapseCount: number;
}
interface ReviewQueue {
  cards: ReviewCard[];
  totalDueCards: number;
  totalEstimatedSeconds: number;
  budgetSeconds: number;
  sessionPlan?: TimeBoxedDailyPlan;
}
interface ReviewPreview {
  rating: ReviewRating;
  dueAtUtc: string;
  scheduledDays: number;
}
interface ReviewSubmission {
  reviewLog: { id: string };
  offline?: boolean;
}
interface DashboardToday {
  dueCount: number;
  estimatedReviewSeconds: number;
  remainingBudgetSeconds: number;
  reviewTimeSeconds: number;
}
interface DashboardRetention {
  reviewCount: number;
  averageRetrievability: number;
  lapseCount: number;
}
interface DashboardBacklog {
  status: string;
  count: number;
}
interface DashboardActivity {
  day: string;
  reviews: number;
}
const loginSchema = z.object({
  email: z.email('Email không hợp lệ.'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.')
});
const registerSchema = z.object({
  email: z.email('Email không hợp lệ.'),
  password: z.string().min(12, 'Mật khẩu cần có ít nhất 12 ký tự.')
});
const deckSchema = z.object({
  name: z.string().trim().min(1, 'Tên bộ thẻ là bắt buộc.').max(200),
  description: z.string().max(2_000),
  desiredRetention: z.coerce.number().min(0.7).max(0.97),
  dailyNewCardLimit: z.coerce.number().int().min(0).max(1_000),
  isCore: z.boolean()
});
type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;
type DeckForm = z.infer<typeof deckSchema>;
const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.status === 401
      ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      : error.status === 403
        ? 'Bạn không có quyền thực hiện thao tác này.'
        : error.status === 404
          ? 'Không tìm thấy dữ liệu bạn yêu cầu.'
          : error.status >= 500
            ? 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
            : error.message
    : error instanceof z.ZodError
      ? (error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.')
      : 'Đã xảy ra lỗi. Vui lòng thử lại.';

function transferErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : errorMessage(error);
}

function downloadDataTransfer(snapshot: DataTransferExport): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `flashcard-data-${new Date().toISOString().replace(/[:.]/gu, '-')}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const authErrorMessage = (error: unknown) =>
  error instanceof ApiError && error.status === 401
    ? 'Email hoặc mật khẩu không đúng.'
    : errorMessage(error);

function ButtonContent({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <>
      {loading && <span className="button-spinner" aria-hidden="true" />}
      <span>{children}</span>
    </>
  );
}

const FormError = ({ message }: { message?: string | undefined }) => (
  <span
    className="form-error"
    role={message === undefined ? undefined : 'alert'}
    aria-hidden={message === undefined}
  >
    {message ?? '\u00a0'}
  </span>
);

function ListSkeleton() {
  return (
    <div className="card-list" aria-label="Đang tải dữ liệu" aria-busy="true">
      {[1, 2, 3].map((item) => (
        <div className="skeleton-card" key={item}>
          <span className="skeleton" style={{ width: '42%', height: 24 }} />
          <span className="skeleton" style={{ width: '88%', height: 16, marginTop: 20 }} />
          <span className="skeleton" style={{ width: '60%', height: 16, marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

function QueryError({ title, onRetry }: { title: string; onRetry(): void }) {
  return (
    <section className="page-state error" role="alert">
      <h2>{title}</h2>
      <p>Vui lòng kiểm tra kết nối và thử lại.</p>
      <button className="secondary" onClick={onRetry}>
        Thử lại
      </button>
    </section>
  );
}

function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="page-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function SessionBootstrap({ children }: { children: ReactNode }) {
  const setSession = useSession((state) => state.setSession);
  const setInitialized = useSession((state) => state.setInitialized);
  useEffect(() => {
    void (async () => {
      try {
        const auth = await api.refresh();
        api.setAccessToken(auth.accessToken);
        if (auth.deviceId !== undefined) await persistDeviceId(auth.deviceId);
        setSession(auth.accessToken, await api.get<User>('/auth/me'));
      } catch {
        api.setAccessToken(null);
        setSession(null, null);
      } finally {
        setInitialized();
      }
    })();
  }, [setInitialized, setSession]);
  return <>{children}</>;
}
function Protected({ children }: { children: ReactNode }) {
  const initialized = useSession((state) => state.initialized);
  const token = useSession((state) => state.accessToken);
  return !initialized ? (
    <main className="loading">Đang khôi phục phiên đăng nhập…</main>
  ) : token === null ? (
    <Navigate to="/login" replace />
  ) : (
    <>{children}</>
  );
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const setSession = useSession((state) => state.setSession);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isRegister = mode === 'register';
  const form = useForm<LoginForm | RegisterForm>({ defaultValues: { email: '', password: '' } });
  const login = useMutation({
    mutationFn: async (values: LoginForm | RegisterForm) => {
      const input = (isRegister ? registerSchema : loginSchema).parse(values);
      const result = await api.post<{ accessToken: string }>(
        isRegister ? '/auth/register' : '/auth/login',
        {
          ...input,
          deviceId: await getDeviceId(),
          deviceName: 'Web browser',
          platform: navigator.userAgent.slice(0, 100)
        }
      );
      api.setAccessToken(result.accessToken);
      return { ...result, user: await api.get<User>('/auth/me') };
    },
    onSuccess: ({ accessToken, user }) => {
      setSession(accessToken, user);
      navigate('/');
    },
    onError: (error) => setSubmitError(authErrorMessage(error))
  });
  return (
    <main className="auth">
      <form onSubmit={form.handleSubmit((values) => login.mutate(values))} noValidate>
        <header className="auth-header">
          <div className="auth-brand" aria-label="Flashcard">
            <img className="auth-logo" src="/icon.svg" alt="" aria-hidden="true" />
            <span>Flashcard</span>
          </div>
          <h1>{isRegister ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h1>
          <p className="muted">
            {isRegister
              ? 'Tạo tài khoản để lưu bộ thẻ và tiến độ học của bạn.'
              : 'Đăng nhập để tiếp tục nhịp học hôm nay.'}
          </p>
        </header>
        <label>
          Email
          <input type="email" autoComplete="email" {...form.register('email')} />
        </label>
        <FormError message={form.formState.errors.email?.message} />
        <label>
          Mật khẩu
          <input
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            {...form.register('password')}
          />
        </label>
        <FormError message={form.formState.errors.password?.message} />
        {submitError !== null && (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        )}
        <button disabled={login.isPending} aria-busy={login.isPending}>
          <ButtonContent loading={login.isPending}>
            {login.isPending
              ? isRegister
                ? 'Đang tạo tài khoản…'
                : 'Đang đăng nhập…'
              : isRegister
                ? 'Đăng ký'
                : 'Đăng nhập'}
          </ButtonContent>
        </button>
        <p className="auth-switch">
          {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
          <Link to={isRegister ? '/login' : '/register'}>
            {isRegister ? 'Đăng nhập' : 'Đăng ký'}
          </Link>
        </p>
      </form>
    </main>
  );
}

function Shell({ children, focus = false }: { children: ReactNode; focus?: boolean }) {
  const user = useSession((state) => state.user);
  const setSession = useSession((state) => state.setSession);
  const offline = useOffline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [transferNotice, setTransferNotice] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const accountInitial = user?.email.charAt(0).toUpperCase() ?? '?';
  const syncLabel = !offline.online
    ? 'Ngoại tuyến'
    : offline.syncing
      ? 'Đang đồng bộ'
      : offline.pendingCount > 0
        ? `Chờ đồng bộ ${offline.pendingCount} mục`
        : 'Đã đồng bộ';
  const exportData = useMutation({
    mutationFn: async () => {
      await prepareForDataTransfer();
      return api.post<DataTransferExport>('/data-transfer/export', {
        displayPreferences: readDisplayPreferences()
      });
    },
    onSuccess: (snapshot) => {
      downloadDataTransfer(snapshot);
      setTransferNotice({ tone: 'success', message: 'Đã tải tệp dữ liệu học tập xuống.' });
    },
    onError: (error) => setTransferNotice({ tone: 'error', message: transferErrorMessage(error) })
  });
  const importData = useMutation({
    mutationFn: async (file: File) => {
      await prepareForDataTransfer();
      const form = new FormData();
      form.append('file', file, file.name);
      return api.postForm<DataTransferImportSummary>('/data-transfer/import', form);
    },
    onSuccess: async (summary) => {
      await resetAfterDataTransfer(summary.syncCursor);
      applyDisplayPreferences(summary.displayPreferences);
      await queryClient.invalidateQueries();
      window.dispatchEvent(new Event('flashcard-sync-applied'));
      const imported = Object.values(summary.imported).reduce((sum, value) => sum + value, 0);
      const updated = Object.values(summary.updated).reduce((sum, value) => sum + value, 0);
      const skipped = Object.values(summary.skipped).reduce((sum, value) => sum + value, 0);
      const mediaNotice =
        summary.missingMediaIds.length === 0
          ? ''
          : ` Thiếu ${summary.missingMediaIds.length} media tham chiếu.`;
      setTransferNotice({
        tone: 'success',
        message: `Đã nhập dữ liệu: thêm ${imported}, cập nhật ${updated}, bỏ qua ${skipped}.${mediaNotice}`
      });
    },
    onError: (error) => setTransferNotice({ tone: 'error', message: transferErrorMessage(error) })
  });
  const selectImportFile = () => {
    setTransferNotice(null);
    importInputRef.current?.click();
  };
  const onImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    if (
      !window.confirm(
        'Tệp sẽ được hợp nhất vào tài khoản hiện tại. Dữ liệu học tập và cài đặt tài khoản có thể được cập nhật. Bạn có muốn tiếp tục không?'
      )
    ) {
      return;
    }
    importData.mutate(file);
  };
  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } finally {
      api.setAccessToken(null);
      setSession(null, null);
      navigate('/login');
    }
  };
  return (
    <div className={focus ? 'app-shell focus-shell' : 'app-shell'}>
      <button
        className="mobile-menu"
        aria-label={navigationOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
        aria-expanded={navigationOpen}
        onClick={() => setNavigationOpen((isOpen) => !isOpen)}
      >
        Menu
      </button>
      {navigationOpen && (
        <button
          className="navigation-scrim"
          aria-label="Đóng menu bằng vùng nền"
          onClick={() => setNavigationOpen(false)}
        />
      )}
      <header className="app-topbar">
        <Link className="brand" to="/" aria-label="Flashcard — về trang tổng quan">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <strong>Flashcard</strong>
            <small>Học đều, nhớ lâu</small>
          </span>
        </Link>
        <nav aria-label="Điều hướng chính">
          <NavLink to="/" end onClick={() => setNavigationOpen(false)}>
            Tổng quan
          </NavLink>
          <NavLink to="/study-plan" onClick={() => setNavigationOpen(false)}>
            Kế hoạch học tập
          </NavLink>
          <NavLink to="/decks" onClick={() => setNavigationOpen(false)}>
            Bộ thẻ
          </NavLink>
          <NavLink to="/notes" onClick={() => setNavigationOpen(false)}>
            Thẻ
          </NavLink>
          <NavLink to="/review" onClick={() => setNavigationOpen(false)}>
            Ôn tập
          </NavLink>
        </nav>
        <div className="account">
          <ThemeToggle compact />
          <div className="account-menu">
            <button
              className="account-menu-trigger"
              type="button"
              aria-label={accountMenuOpen ? 'Đóng menu tài khoản' : 'Mở menu tài khoản'}
              aria-expanded={accountMenuOpen}
              aria-controls="account-menu"
              onClick={() => setAccountMenuOpen((isOpen) => !isOpen)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setAccountMenuOpen(false);
              }}
            >
              <span className="account-avatar" aria-hidden="true">
                {accountInitial}
              </span>
            </button>
            {accountMenuOpen && (
              <div id="account-menu" className="account-menu-content">
                <div className="account-menu-details">
                  <span className="account-label">Tài khoản</span>
                  <span className="account-email" title={user?.email}>
                    {user?.email}
                  </span>
                  <span className={offline.online ? 'sync-state' : 'sync-state offline'}>
                    {syncLabel}
                  </span>
                </div>
                {transferNotice !== null && (
                  <span
                    className={`account-transfer-notice ${transferNotice.tone}`}
                    role={transferNotice.tone === 'error' ? 'alert' : 'status'}
                  >
                    {transferNotice.message}
                  </span>
                )}
                <button
                  className="account-menu-item account-menu-transfer"
                  type="button"
                  disabled={exportData.isPending || !offline.online}
                  aria-busy={exportData.isPending}
                  onClick={() => exportData.mutate()}
                >
                  <ButtonContent loading={exportData.isPending}>Xuất dữ liệu học tập</ButtonContent>
                </button>
                <button
                  className="account-menu-item account-menu-transfer"
                  type="button"
                  disabled={importData.isPending || !offline.online}
                  aria-busy={importData.isPending}
                  onClick={selectImportFile}
                >
                  <ButtonContent loading={importData.isPending}>Nhập dữ liệu học tập</ButtonContent>
                </button>
                <input
                  ref={importInputRef}
                  className="sr-only"
                  type="file"
                  accept=".json,application/json"
                  onChange={onImportFileChange}
                />
                <button
                  className="account-menu-item"
                  type="button"
                  disabled={exportData.isPending || importData.isPending}
                  onClick={() => {
                    setAccountMenuOpen(false);
                    void logout();
                  }}
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <section className="page-content">{children}</section>
    </div>
  );
}
function formatDashboardCount(value: number): string {
  return value.toLocaleString('vi-VN');
}

function formatDashboardDuration(seconds: number): string {
  if (seconds <= 0) return '0 phút';
  const minutes = Math.round(seconds / 60);
  return minutes === 0 ? '<1 phút' : `${minutes} phút`;
}

function dashboardActivityWindow(rows: DashboardActivity[]): DashboardActivity[] {
  const byDay = new Map(rows.map((row) => [row.day, row.reviews]));
  const now = new Date();
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (13 - index), 12)
    );
    const day = date.toISOString().slice(0, 10);
    return { day, reviews: byDay.get(day) ?? 0 };
  });
}

function dashboardDayLabel(day: string): string {
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'short' })
    .format(new Date(`${day}T12:00:00Z`))
    .replace('.', '');
}

function dashboardBacklogLabel(status: string): string {
  switch (status) {
    case 'Pending':
      return 'Đang chờ';
    case 'Candidate':
      return 'Ứng viên';
    case 'Backlog':
      return 'Tồn đọng';
    default:
      return status;
  }
}

function DashboardStat({
  label,
  value,
  note,
  tone
}: {
  label: string;
  value: string;
  note: string;
  tone: 'accent' | 'blue' | 'green' | 'coral';
}) {
  return (
    <article className={`dashboard-stat dashboard-stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Dashboard() {
  const userId = useSession((state) => state.user?.id);
  const dailyBrowseContext = currentDailyBrowseContext();
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api.get<Deck[]>('/decks') });
  const notes = useQuery({ queryKey: ['notes'], queryFn: () => api.get<Note[]>('/notes') });
  const today = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => api.get<DashboardToday>('/dashboard/today')
  });
  const retention = useQuery({
    queryKey: ['dashboard', 'retention'],
    queryFn: () => api.get<DashboardRetention>('/dashboard/retention')
  });
  const backlog = useQuery({
    queryKey: ['dashboard', 'backlog'],
    queryFn: () => api.get<DashboardBacklog[]>('/dashboard/backlog')
  });
  const activity = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => api.get<DashboardActivity[]>('/dashboard/activity')
  });
  const weaknesses = useQuery({
    queryKey: ['dashboard', 'weaknesses'],
    queryFn: () => api.get<WeaknessAnalysisData>('/dashboard/weaknesses')
  });
  const dailyBrowse = useQuery({
    queryKey: ['daily-browse-summary', dailyBrowseContext.date, dailyBrowseContext.timeZone],
    queryFn: () =>
      api.get<DailyBrowseSummary>(
        `/daily-browse/today/summary?date=${encodeURIComponent(dailyBrowseContext.date)}&timeZone=${encodeURIComponent(dailyBrowseContext.timeZone)}`
      ),
    enabled: userId !== undefined
  });
  const offline = useOffline();
  const queries = [decks, notes, today, retention, backlog, activity, weaknesses, dailyBrowse];
  const isLoading = queries.some((query) => query.isLoading);
  const hasError = queries.some((query) => query.isError);
  const hasTodayData = today.data !== undefined;
  const retry = () => {
    void Promise.all(queries.map((query) => query.refetch()));
  };
  const activeDecks = decks.data?.filter((deck) => !deck.isArchived) ?? [];
  const dueCount = today.data?.dueCount ?? 0;
  const estimatedReviewSeconds = today.data?.estimatedReviewSeconds ?? 0;
  const remainingBudgetSeconds = today.data?.remainingBudgetSeconds ?? 0;
  const reviewTimeSeconds = today.data?.reviewTimeSeconds ?? 0;
  const budgetBaseSeconds = estimatedReviewSeconds + remainingBudgetSeconds;
  const workloadPercent =
    budgetBaseSeconds === 0
      ? 0
      : Math.min(100, Math.round((estimatedReviewSeconds / budgetBaseSeconds) * 100));
  const retentionPercent =
    retention.data === undefined ? null : Math.round(retention.data.averageRetrievability * 100);
  const lapseRate =
    retention.data === undefined || retention.data.reviewCount === 0
      ? null
      : Math.round((retention.data.lapseCount / retention.data.reviewCount) * 100);
  const activityDays = dashboardActivityWindow(activity.data ?? []);
  const activityTotal = activityDays.reduce((total, item) => total + item.reviews, 0);
  const activityPeak = Math.max(0, ...activityDays.map((item) => item.reviews));
  const activeActivityDays = activityDays.filter((item) => item.reviews > 0).length;
  const backlogRows = [...(backlog.data ?? [])].sort((left, right) => right.count - left.count);
  const backlogTotal = backlogRows.reduce((total, item) => total + item.count, 0);
  const backlogPeak = Math.max(0, ...backlogRows.map((item) => item.count));
  return (
    <Shell>
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Phòng điều khiển học tập</p>
          <h1>Nhìn thấy nhịp học, biết học gì tiếp.</h1>
          <p>
            Một cái nhìn nhanh về khối lượng hôm nay, độ ghi nhớ và những nhóm thẻ đang cần bạn quay
            lại.
          </p>
          <div className="dashboard-hero-actions">
            <Link className="button" to="/review">
              Ôn tập ngay <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button secondary" to="/study-plan">
              Xem kế hoạch
            </Link>
          </div>
        </div>
        <aside className="dashboard-today-card" aria-label="Tóm tắt học tập hôm nay">
          <div className="dashboard-today-header">
            <span>Hôm nay</span>
            <span
              className={`dashboard-today-status${hasTodayData && dueCount === 0 ? ' is-clear' : ''}`}
            >
              {!hasTodayData ? 'Đang tải' : dueCount === 0 ? 'Đã nhẹ' : 'Có việc'}
            </span>
          </div>
          <div className="dashboard-today-count">
            <strong>{hasTodayData ? formatDashboardCount(dueCount) : '—'}</strong>
            <span>thẻ cần ôn</span>
          </div>
          <div className="dashboard-today-meta">
            <span>Khối lượng ước tính</span>
            <strong>{hasTodayData ? formatDashboardDuration(estimatedReviewSeconds) : '—'}</strong>
          </div>
          <div
            className="dashboard-workload-track"
            role="progressbar"
            aria-label="Khối lượng ôn tập so với ngân sách hôm nay"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={hasTodayData ? workloadPercent : undefined}
          >
            <span style={{ width: `${hasTodayData ? workloadPercent : 0}%` }} />
          </div>
          <p>
            {!hasTodayData
              ? 'Đang cập nhật lịch ôn hôm nay.'
              : dueCount === 0
                ? 'Không còn thẻ đến hạn trong hàng đợi hiện tại.'
                : `Còn ${formatDashboardDuration(remainingBudgetSeconds)} ngân sách dự phòng.`}
          </p>
        </aside>
      </header>
      {isLoading ? (
        <ListSkeleton />
      ) : hasError ? (
        <QueryError title="Không thể tải tổng quan." onRetry={retry} />
      ) : (
        <>
          <section className="dashboard-stat-grid" aria-label="Các chỉ số chính">
            <DashboardStat
              label="Cần ôn hôm nay"
              value={formatDashboardCount(dueCount)}
              note={dueCount === 0 ? 'Hàng đợi đang trống' : 'Thẻ đang chờ bạn'}
              tone="accent"
            />
            <DashboardStat
              label="Thời lượng còn lại"
              value={formatDashboardDuration(estimatedReviewSeconds)}
              note="Ước tính cho thẻ đến hạn"
              tone="blue"
            />
            <DashboardStat
              label="Đã học hôm nay"
              value={formatDashboardDuration(reviewTimeSeconds)}
              note="Thời gian trả lời thực tế"
              tone="green"
            />
            <DashboardStat
              label="Bộ thẻ đang dùng"
              value={formatDashboardCount(activeDecks.length)}
              note={`${formatDashboardCount(notes.data?.length ?? 0)} thẻ trong kho`}
              tone="coral"
            />
          </section>
          <section className="dashboard-main-grid">
            <section
              className="dashboard-panel dashboard-activity-panel"
              aria-labelledby="activity-title"
            >
              <header className="dashboard-panel-header">
                <div>
                  <p className="eyebrow">14 ngày gần nhất</p>
                  <h2 id="activity-title">Nhịp học của bạn</h2>
                </div>
                <strong className="dashboard-panel-badge">{activeActivityDays}/14 ngày</strong>
              </header>
              <p className="dashboard-panel-intro">
                {activityTotal === 0
                  ? 'Chưa có lượt ôn nào để vẽ nhịp học.'
                  : `${formatDashboardCount(activityTotal)} lượt ôn — đều đặn quan trọng hơn một ngày học quá sức.`}
              </p>
              {activityTotal === 0 ? (
                <div className="dashboard-empty-chart">
                  Bắt đầu một phiên để tạo dấu mốc đầu tiên.
                </div>
              ) : (
                <div
                  className="dashboard-activity-chart"
                  role="img"
                  aria-label="Biểu đồ lượt ôn trong 14 ngày"
                >
                  {activityDays.map((item) => (
                    <div
                      className="dashboard-activity-day"
                      key={item.day}
                      aria-label={`${item.day}: ${item.reviews} lượt ôn`}
                    >
                      <span className="dashboard-activity-value">
                        {item.reviews === 0 ? '' : item.reviews}
                      </span>
                      <div className="dashboard-activity-track">
                        <span
                          className="dashboard-activity-bar"
                          style={{
                            height: `${Math.max(8, (item.reviews / Math.max(1, activityPeak)) * 100)}%`
                          }}
                        />
                      </div>
                      <span className="dashboard-activity-label">
                        {dashboardDayLabel(item.day)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="dashboard-activity-footer">
                <span>{formatDashboardCount(activityPeak)} lượt là mức cao nhất/ngày</span>
                <span>{formatDashboardCount(activeDecks.length)} bộ thẻ đang hoạt động</span>
              </div>
            </section>
            <section
              className="dashboard-panel dashboard-retention-panel"
              aria-labelledby="retention-title"
            >
              <header className="dashboard-panel-header">
                <div>
                  <p className="eyebrow">Sức khỏe ghi nhớ</p>
                  <h2 id="retention-title">Bạn đang nhớ đến đâu?</h2>
                </div>
                <span className="dashboard-panel-caption">Tích lũy</span>
              </header>
              <div className="dashboard-retention-layout">
                <div
                  className="dashboard-retention-ring"
                  style={{
                    background: `conic-gradient(var(--color-accent-2) ${retentionPercent ?? 0}%, var(--color-paper-3) 0)`
                  }}
                >
                  <div>
                    <strong>{retentionPercent === null ? '—' : `${retentionPercent}%`}</strong>
                    <span>ghi nhớ</span>
                  </div>
                </div>
                <dl className="dashboard-retention-list">
                  <div>
                    <dt>Lượt ôn</dt>
                    <dd>{formatDashboardCount(retention.data?.reviewCount ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>Tỷ lệ Again</dt>
                    <dd>{lapseRate === null ? '—' : `${lapseRate}%`}</dd>
                  </div>
                  <div>
                    <dt>Đồng bộ</dt>
                    <dd>{offline.pendingCount === 0 ? 'Ổn' : `${offline.pendingCount} chờ`}</dd>
                  </div>
                </dl>
              </div>
              <p className="dashboard-panel-footnote">
                Tỷ lệ Again cao là tín hiệu nên viết lại câu hỏi hoặc giảm thẻ mới.
              </p>
            </section>
          </section>

          <section className="dashboard-secondary-grid">
            <section className="dashboard-panel dashboard-next-panel" aria-labelledby="next-title">
              <header className="dashboard-panel-header">
                <div>
                  <p className="eyebrow">Bước tiếp theo</p>
                  <h2 id="next-title">Giữ nhịp học đơn giản</h2>
                </div>
              </header>
              <div className="dashboard-next-list">
                <Link className="dashboard-next-item" to="/review">
                  <span className="dashboard-next-icon" aria-hidden="true">
                    →
                  </span>
                  <span>
                    <strong>{dueCount === 0 ? 'Kiểm tra hàng đợi' : 'Ôn thẻ đến hạn'}</strong>
                    <small>
                      {dueCount === 0
                        ? 'Xem lại khi có thẻ mới đến hạn.'
                        : `${formatDashboardCount(dueCount)} thẻ đang chờ.`}
                    </small>
                  </span>
                  <span className="dashboard-next-arrow" aria-hidden="true">
                    ↗
                  </span>
                </Link>
                <Link className="dashboard-next-item" to="/study-plan">
                  <span className="dashboard-next-icon" aria-hidden="true">
                    ◷
                  </span>
                  <span>
                    <strong>Mở kế hoạch hôm nay</strong>
                    <small>Phân bổ thời gian giữa thẻ đến hạn, thẻ yếu và thẻ mới.</small>
                  </span>
                  <span className="dashboard-next-arrow" aria-hidden="true">
                    ↗
                  </span>
                </Link>
                <Link className="dashboard-next-item" to="/daily-browse?scope=new">
                  <span className="dashboard-next-icon" aria-hidden="true">
                    ✦
                  </span>
                  <span>
                    <strong>Lướt thẻ mới hôm nay</strong>
                    <small>
                      {dailyBrowse.data === undefined
                        ? 'Đang kiểm tra thẻ đã học hôm nay.'
                        : `${formatDashboardCount(dailyBrowse.data.newCardCount)} thẻ, tự lật và tự chuyển.`}
                    </small>
                  </span>
                  <span className="dashboard-next-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                <Link className="dashboard-next-item" to="/daily-browse?scope=all">
                  <span className="dashboard-next-icon" aria-hidden="true">
                    ↺
                  </span>
                  <span>
                    <strong>Lướt tất cả thẻ đã học</strong>
                    <small>
                      {dailyBrowse.data === undefined
                        ? 'Đang kiểm tra thẻ đã học hôm nay.'
                        : `${formatDashboardCount(dailyBrowse.data.allCardCount)} thẻ, không chấm điểm.`}
                    </small>
                  </span>
                  <span className="dashboard-next-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                <Link className="dashboard-next-item" to="/decks">
                  <span className="dashboard-next-icon" aria-hidden="true">
                    +
                  </span>
                  <span>
                    <strong>Chỉnh lại bộ thẻ</strong>
                    <small>Giữ câu hỏi rõ và nhịp thẻ mới vừa sức.</small>
                  </span>
                  <span className="dashboard-next-arrow" aria-hidden="true">
                    ↗
                  </span>
                </Link>
              </div>
            </section>
            <section
              className="dashboard-panel dashboard-backlog-panel"
              aria-labelledby="backlog-title"
            >
              <header className="dashboard-panel-header">
                <div>
                  <p className="eyebrow">Nguồn học</p>
                  <h2 id="backlog-title">Hàng đợi nội dung</h2>
                </div>
                <strong className="dashboard-panel-badge">
                  {formatDashboardCount(backlogTotal)}
                </strong>
              </header>
              {backlogRows.length === 0 ? (
                <div className="dashboard-backlog-empty">Không có nguồn nội dung tồn đọng.</div>
              ) : (
                <div className="dashboard-backlog-list">
                  {backlogRows.map((item) => (
                    <div className="dashboard-backlog-row" key={item.status}>
                      <div>
                        <span>{dashboardBacklogLabel(item.status)}</span>
                        <strong>{formatDashboardCount(item.count)}</strong>
                      </div>
                      <div className="dashboard-backlog-track">
                        <span
                          style={{
                            width: `${Math.max(4, (item.count / Math.max(1, backlogPeak)) * 100)}%`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>

          {weaknesses.data !== undefined && <WeaknessAnalysis data={weaknesses.data} />}
          {activeDecks.length > 0 && (
            <section className="dashboard-decks-section" aria-labelledby="decks-title">
              <header className="dashboard-section-heading">
                <div>
                  <p className="eyebrow">Kho học tập</p>
                  <h2 id="decks-title">Bộ thẻ đang dùng</h2>
                </div>
                <Link className="button-link" to="/decks">
                  Quản lý bộ thẻ ↗
                </Link>
              </header>
              <div className="dashboard-deck-grid">
                {activeDecks.slice(0, 3).map((deck) => (
                  <Link className="dashboard-deck" to="/decks" key={deck.id}>
                    <span className="dashboard-deck-marker" aria-hidden="true">
                      {deck.isCore ? 'CORE' : 'DECK'}
                    </span>
                    <h3>{deck.name}</h3>
                    <p>{deck.description || 'Chưa có mô tả.'}</p>
                    <small>
                      Giữ nhớ {Math.round(deck.desiredRetention * 100)}% · {deck.dailyNewCardLimit}{' '}
                      thẻ mới/ngày
                    </small>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Shell>
  );
}

function DeckEditor({ deck, done }: { deck: Deck | null; done(): void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<DeckForm>({
    defaultValues: {
      name: deck?.name ?? '',
      description: deck?.description ?? '',
      desiredRetention: deck?.desiredRetention ?? 0.86,
      dailyNewCardLimit: deck?.dailyNewCardLimit ?? 20,
      isCore: deck?.isCore ?? false
    }
  });
  const save = useMutation({
    mutationFn: (values: DeckForm) => {
      const input = deckSchema.parse(values);
      return deck === null ? api.post('/decks', input) : api.patch(`/decks/${deck.id}`, input);
    },
    onSuccess: done,
    onError: (error) => setSubmitError(errorMessage(error))
  });
  return (
    <section className="panel">
      <h2>{deck === null ? 'Tạo bộ thẻ' : 'Sửa bộ thẻ'}</h2>
      <form
        className="editor-form"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        <label>
          <span className="field-label">
            Tên{' '}
            <span className="required" aria-hidden="true">
              *
            </span>
          </span>
          <input aria-required="true" {...form.register('name')} />
        </label>
        <FormError message={form.formState.errors.name?.message} />
        <label>
          Mô tả
          <textarea {...form.register('description')} />
        </label>
        <div className="form-grid">
          <label>
            Desired retention
            <input
              type="number"
              step=".01"
              min=".7"
              max=".97"
              {...form.register('desiredRetention')}
            />
          </label>
          <label>
            Thẻ mới/ngày
            <input type="number" min="0" max="1000" {...form.register('dailyNewCardLimit')} />
          </label>
        </div>
        <label className="checkbox">
          <input type="checkbox" {...form.register('isCore')} /> Bộ thẻ cốt lõi
        </label>
        {submitError !== null && (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        )}
        <div className="actions">
          <button disabled={save.isPending} aria-busy={save.isPending}>
            <ButtonContent loading={save.isPending}>
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </ButtonContent>
          </button>
          <button type="button" className="secondary" onClick={done}>
            Hủy
          </button>
        </div>
      </form>
    </section>
  );
}
function Decks() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Deck | null | undefined>();
  const [search, setSearch] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api.get<Deck[]>('/decks') });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/decks/${id}`),
    onSuccess: () => {
      setRemoveError(null);
      void client.invalidateQueries({ queryKey: ['decks'] });
    },
    onError: (error) => setRemoveError(errorMessage(error))
  });
  const done = () => {
    setEditing(undefined);
    void client.invalidateQueries({ queryKey: ['decks'] });
  };
  const visibleDecks = decks.data?.filter((deck) => {
    const query = search.trim().toLocaleLowerCase();
    return (
      query.length === 0 ||
      `${deck.name} ${deck.description ?? ''}`.toLocaleLowerCase().includes(query)
    );
  });
  return (
    <Shell>
      <header className="page-header">
        <div>
          <p className="eyebrow">Nội dung</p>
          <h1>Bộ thẻ</h1>
          <p className="muted">
            {decks.data === undefined ? 'Đang tải số lượng…' : `${decks.data.length} bộ thẻ`}
          </p>
        </div>
        <button onClick={() => setEditing(null)}>Tạo bộ thẻ</button>
      </header>
      {editing !== undefined && <DeckEditor deck={editing} done={done} />}
      <label className="search-field">
        <span className="sr-only">Tìm kiếm bộ thẻ</span>
        <input
          type="search"
          value={search}
          placeholder="Tìm kiếm bộ thẻ"
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {removeError !== null && (
        <p className="form-error" role="alert">
          {removeError}
        </p>
      )}
      {decks.isLoading ? (
        <ListSkeleton />
      ) : decks.isError ? (
        <QueryError title="Không thể tải danh sách bộ thẻ." onRetry={() => void decks.refetch()} />
      ) : decks.data?.length === 0 ? (
        <EmptyState
          title="Bạn chưa có bộ thẻ nào"
          description="Tạo bộ thẻ đầu tiên để bắt đầu học."
          action={<button onClick={() => setEditing(null)}>Tạo bộ thẻ</button>}
        />
      ) : visibleDecks?.length === 0 ? (
        <EmptyState
          title="Không tìm thấy kết quả"
          description="Thử thay đổi từ khóa tìm kiếm."
          action={
            <button className="secondary" onClick={() => setSearch('')}>
              Xóa tìm kiếm
            </button>
          }
        />
      ) : (
        <div className="card-list">
          {visibleDecks?.map((deck) => (
            <article className="card" key={deck.id}>
              <div>
                <h2>{deck.name}</h2>
                <p>{deck.description || 'Chưa có mô tả.'}</p>
                <small>
                  Retention {Math.round(deck.desiredRetention * 100)}% · tối đa{' '}
                  {deck.dailyNewCardLimit} thẻ mới/ngày
                </small>
              </div>
              <div className="actions">
                <Link className="button secondary" to={`/study-plan?deckId=${deck.id}`}>
                  Thêm vào kế hoạch
                </Link>
                <button className="secondary" onClick={() => setEditing(deck)}>
                  Sửa
                </button>
                <button
                  className="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`Xóa mềm bộ thẻ “${deck.name}”?`)) remove.mutate(deck.id);
                  }}
                >
                  Xóa
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Shell>
  );
}

function DailyBrowse() {
  const navigate = useNavigate();
  const userId = useSession((state) => state.user?.id);
  const [params] = useSearchParams();
  const scope: DailyBrowseScope = params.get('scope') === 'new' ? 'new' : 'all';
  const { date, timeZone } = currentDailyBrowseContext();
  const [cards, setCards] = useState<DailyBrowseResponse['cards']>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const remainingMs = useRef(4_000);
  const phaseStartedAt = useRef<number | null>(null);
  const queue = useQuery({
    queryKey: ['daily-browse', scope, date, timeZone],
    queryFn: async () => {
      if (userId === undefined) throw new Error('Phiên đăng nhập chưa sẵn sàng.');
      try {
        const response = await api.get<DailyBrowseResponse>(
          `/daily-browse/today?scope=${scope}&date=${encodeURIComponent(date)}&timeZone=${encodeURIComponent(timeZone)}`
        );
        await cacheDailyBrowseResponse(userId, response);
        return response;
      } catch {
        return loadOfflineDailyBrowse(userId, date, timeZone, scope);
      }
    },
    enabled: userId !== undefined
  });
  const phaseDuration = 4_000 / speed;
  const resetPhase = (nextRevealed = false) => {
    phaseStartedAt.current = null;
    remainingMs.current = phaseDuration;
    setRevealed(nextRevealed);
  };
  const complete = () => {
    if (userId === undefined) return;
    phaseStartedAt.current = null;
    setPaused(true);
    setCompleted(true);
    void offlineDb.dailyBrowseCompletions.put({
      id: dailyBrowseCompletionId(userId, date, timeZone, scope),
      completedAtUtc: new Date().toISOString()
    });
  };
  const moveTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= cards.length) return;
    setIndex(nextIndex);
    resetPhase();
  };
  const moveNext = () => {
    if (index + 1 >= cards.length) {
      complete();
      return;
    }
    moveTo(index + 1);
  };
  const pause = () => {
    if (paused) {
      setPaused(false);
      return;
    }
    if (phaseStartedAt.current !== null) {
      remainingMs.current = Math.max(
        0,
        remainingMs.current - (performance.now() - phaseStartedAt.current)
      );
      phaseStartedAt.current = null;
    }
    setPaused(true);
  };
  const changeSpeed = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    phaseStartedAt.current = null;
    remainingMs.current = 4_000 / nextSpeed;
  };
  const replay = () => {
    setCards((current) => shuffle(current));
    setIndex(0);
    setCompleted(false);
    setPaused(false);
    remainingMs.current = phaseDuration;
    resetPhase();
  };
  useEffect(() => {
    if (queue.data === undefined) return;
    setCards(shuffle(queue.data.cards));
    setIndex(0);
    setRevealed(false);
    setPaused(false);
    setCompleted(false);
    remainingMs.current = phaseDuration;
  }, [queue.data]);
  const card = cards[index];
  useEffect(() => {
    if (card === undefined || paused || completed) return;
    phaseStartedAt.current = performance.now();
    const timer = window.setTimeout(
      () => {
        phaseStartedAt.current = null;
        if (!revealed) {
          remainingMs.current = phaseDuration;
          setRevealed(true);
          return;
        }
        moveNext();
      },
      Math.max(0, remainingMs.current)
    );
    return () => window.clearTimeout(timer);
  }, [card, completed, index, paused, phaseDuration, revealed]);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden || paused) return;
      if (phaseStartedAt.current !== null) {
        remainingMs.current = Math.max(
          0,
          remainingMs.current - (performance.now() - phaseStartedAt.current)
        );
        phaseStartedAt.current = null;
      }
      setPaused(true);
      window.speechSynthesis?.cancel();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [paused]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea'))
        return;
      if (event.key === ' ') {
        event.preventDefault();
        pause();
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveTo(index - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
  if (queue.isLoading)
    return (
      <Shell focus>
        <section
          className="review-study"
          aria-busy="true"
          aria-label="Đang chuẩn bị phiên lướt lại"
        >
          <div className="review-stage">
            <div className="review-card review-card-loading">
              <span
                className="skeleton"
                style={{ width: '56%', height: 40, justifySelf: 'center' }}
              />
            </div>
          </div>
        </section>
      </Shell>
    );
  if (queue.isError)
    return (
      <Shell focus>
        <QueryError
          title="Không thể chuẩn bị phiên lướt lại."
          onRetry={() => void queue.refetch()}
        />
      </Shell>
    );
  if (cards.length === 0)
    return (
      <Shell focus>
        <EmptyState
          title={scope === 'new' ? 'Chưa có thẻ mới hôm nay' : 'Chưa có thẻ nào để lướt lại'}
          description="Hãy học vài thẻ trước, rồi quay lại đây vào buổi tối để xem lướt một vòng."
          action={
            <Link className="button" to="/review">
              Mở phiên ôn tập
            </Link>
          }
        />
      </Shell>
    );
  if (completed)
    return (
      <Shell focus>
        <EmptyState
          title="Bạn đã lướt xong hôm nay"
          description={`Đã xem ${cards.length} thẻ ${scope === 'new' ? 'mới' : 'đã học'} mà không thay đổi lịch ôn tập.`}
          action={
            <div className="daily-browse-end-actions">
              <button type="button" onClick={replay}>
                Xem lại
              </button>
              <button className="secondary" type="button" onClick={() => navigate('/')}>
                Về tổng quan
              </button>
            </div>
          }
        />
      </Shell>
    );
  if (card === undefined) return null;
  const fields = parseJson<Record<string, string>>(card.fieldsJson, {});
  const front =
    card.noteType === 'BasicAndReverse' && card.templateOrdinal === 1
      ? (fields.back ?? '')
      : (fields.front ?? fields.text ?? '');
  const back =
    card.noteType === 'BasicAndReverse' && card.templateOrdinal === 1
      ? (fields.front ?? '')
      : (fields.back ?? '');
  const speechFields = { ...fields, front, back };
  const progress = Math.round((index / cards.length) * 100);
  return (
    <Shell focus>
      <header className="review-header daily-browse-header">
        <Link className="button-link" to="/">
          Kết thúc lướt lại
        </Link>
        <div className="review-title">
          <p className="eyebrow">Lướt lại hôm nay</p>
          <h1>{scope === 'new' ? 'Thẻ mới' : 'Tất cả thẻ đã học'}</h1>
        </div>
        <div className="review-progress" aria-label="Tiến độ phiên lướt lại">
          <div className="review-progress-copy">
            <span>
              Thẻ {index + 1} / {cards.length}
            </span>
            <span>{progress}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={cards.length}
            aria-valuenow={index}
          >
            <span className="progress-value" style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </div>
        <div className="daily-browse-actions">
          <button
            className="secondary"
            type="button"
            onClick={() => moveTo(index - 1)}
            disabled={index === 0}
          >
            Trước
          </button>
          <button className="secondary" type="button" onClick={pause}>
            {paused ? 'Tiếp tục' : 'Tạm dừng'} <kbd>Space</kbd>
          </button>
          <button className="secondary" type="button" onClick={moveNext}>
            Tiếp <kbd>→</kbd>
          </button>
        </div>
      </header>
      <section className="review-study daily-browse-study" aria-live="off">
        <div className="daily-browse-toolbar">
          <label>
            Tốc độ
            <select value={speed} onChange={(event) => changeSpeed(Number(event.target.value))}>
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
          </label>
          <span role="status">
            {paused ? 'Đã tạm dừng' : revealed ? 'Đang xem đáp án' : 'Đang nhớ câu trả lời'}
          </span>
        </div>
        <div className="review-support">
          <SpeechControl
            contentKey={`${card.cardId}:${revealed ? 'back' : 'front'}`}
            text={getCardSpeechText(speechFields, revealed)}
          />
        </div>
        <div
          className="review-stage"
          role="group"
          aria-label={revealed ? 'Mặt sau của thẻ' : 'Mặt trước của thẻ'}
        >
          <div
            key={`${card.cardId}:${revealed}`}
            className={`review-card daily-browse-card${revealed ? ' is-revealed' : ''}`}
          >
            <article className="review-card-face review-card-front" aria-hidden={revealed}>
              <div className="review-card-meta">
                <span className="review-side-label">Câu hỏi</span>
                <span className="review-card-count">
                  {index + 1} / {cards.length}
                </span>
              </div>
              <p className="review-face">{front}</p>
              <p className="review-hint">Hãy thử nhớ trước khi thẻ tự lật.</p>
            </article>
            <article className="review-card-face review-card-back" aria-hidden={!revealed}>
              <div className="review-card-meta">
                <span className="review-side-label">Đáp án</span>
                <span className="review-answer-mark" aria-hidden="true">
                  ✓
                </span>
              </div>
              <div className="review-recall">
                <span>Câu hỏi</span>
                <p>{front}</p>
              </div>
              <p className="answer">{back}</p>
            </article>
          </div>
        </div>
        <div className="review-support">
          <AudioControl mediaId={fields.audioMediaId} />
        </div>
      </section>
    </Shell>
  );
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function Review() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const userId = useSession((state) => state.user?.id);
  const [reviewParams] = useSearchParams();
  const studyGoalId = reviewParams.get('studyGoalId');
  const studyDate = reviewParams.get('date');
  const hasTimeBoxedRequest = studyGoalId !== null && studyDate !== null;
  const reviewQueuePath = hasTimeBoxedRequest
    ? `/reviews/queue?studyGoalId=${encodeURIComponent(studyGoalId)}&date=${encodeURIComponent(studyDate)}`
    : '/reviews/queue';
  const reviewQueueCacheId = hasTimeBoxedRequest
    ? `time-boxed:${studyGoalId}:${studyDate}`
    : 'current';
  const [activeCardId, setActiveCardId] = useState<string | null | undefined>(undefined);
  const [shownAt, setShownAt] = useState(() => new Date());
  const [revealedAt, setRevealedAt] = useState<Date | null>(null);
  const revealedAtRef = useRef<Date | null>(null);
  const [lastReviewId, setLastReviewId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(document.fullscreenElement !== null);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const [clockNowMs, setClockNowMs] = useState(Date.now());
  const [extraMinutes, setExtraMinutes] = useState(0);
  const pausedSessionMs = useRef(0);
  const { fontSize, setFontSize, cardWidth, setCardWidth } = useReviewDisplayPreferences();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const sessionId = useState(() => crypto.randomUUID())[0];
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const offline = useOffline();
  useEffect(() => {
    void getDeviceId().then(setDeviceId);
  }, []);
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
  const queue = useQuery({
    queryKey: ['review-queue', studyGoalId, studyDate],
    queryFn: async () => {
      try {
        const response = await api.get<ReviewQueue>(reviewQueuePath);
        await offlineDb.reviewQueue.put({
          id: reviewQueueCacheId,
          ...response,
          cachedAtUtc: new Date().toISOString()
        });
        return response;
      } catch {
        const cached = await offlineDb.reviewQueue.get(reviewQueueCacheId);
        if (cached === undefined) throw new Error('No offline review queue is available yet.');
        return { ...cached, totalDueCards: cached.totalDueCards ?? cached.cards.length };
      }
    }
  });
  useEffect(() => {
    if (queue.data?.sessionPlan !== undefined && sessionStartedAtMs === null) {
      const startedAt = Date.now();
      setSessionStartedAtMs(startedAt);
      setClockNowMs(startedAt);
    }
  }, [queue.data?.sessionPlan, sessionStartedAtMs]);
  useEffect(() => {
    if (sessionStartedAtMs === null) return;
    const timer = window.setInterval(() => setClockNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [sessionStartedAtMs]);
  const cards = queue.data?.cards ?? [];
  const activeCardIndex =
    activeCardId === undefined
      ? 0
      : activeCardId === null
        ? cards.length
        : Math.max(
            0,
            cards.findIndex((queuedCard) => queuedCard.id === activeCardId)
          );
  const card =
    activeCardId === null
      ? undefined
      : activeCardId === undefined
        ? cards[0]
        : (cards.find((queuedCard) => queuedCard.id === activeCardId) ?? cards[0]);
  const revealCard = () => {
    const revealedAt = new Date();
    revealedAtRef.current = revealedAt;
    setRevealedAt(revealedAt);
  };
  const note = useQuery({
    queryKey: ['review-note', card?.noteId],
    queryFn: async () => {
      try {
        const response = await api.get<Note>(`/notes/${card!.noteId}`);
        await offlineDb.notes.put(response);
        return response;
      } catch {
        const cached = await offlineDb.notes.get(card!.noteId);
        if (cached === undefined)
          throw new Error('The card content is not cached for offline use.');
        return cached;
      }
    },
    enabled: card !== undefined
  });
  const currentNote = note.data?.id === card?.noteId ? note.data : undefined;
  const rememberForDailyBrowse = async (reviewedCard: ReviewCard, firstSeenAt: Date) => {
    if (userId === undefined || currentNote === undefined) return;
    const { date, timeZone } = currentDailyBrowseContext();
    await recordDailyBrowseExposure({
      userId,
      studyDate: date,
      timeZone,
      cardId: reviewedCard.id,
      noteId: reviewedCard.noteId,
      deckId: reviewedCard.deckId ?? currentNote.deckId,
      templateOrdinal: reviewedCard.templateOrdinal ?? 0,
      noteType: currentNote.noteType,
      fieldsJson: currentNote.fieldsJson,
      firstSeenAtUtc: firstSeenAt.toISOString(),
      wasNewToday: reviewedCard.state === 'New'
    });
    await client.invalidateQueries({ queryKey: ['daily-browse-summary'] });
  };
  const previews = useQuery({
    queryKey: ['review-preview', card?.id],
    queryFn: () => api.get<ReviewPreview[]>(`/cards/${card!.id}/review-preview`),
    enabled: card !== undefined && revealedAt !== null
  });
  useEffect(() => {
    const cards = queue.data?.cards;
    if (cards === undefined || userId === undefined || !offline.online) return;
    let cancelled = false;
    const preload = async () => {
      for (const queuedCard of cards) {
        if (cancelled) return;
        let note: Note;
        try {
          note = await client.fetchQuery({
            queryKey: ['review-note', queuedCard.noteId],
            queryFn: () => api.get<Note>(`/notes/${queuedCard.noteId}`),
            staleTime: 5 * 60 * 1_000
          });
          await offlineDb.notes.put(note);
        } catch (error) {
          if (!cancelled) console.warn('Không thể tải trước nội dung thẻ.', error);
          continue;
        }
        const fields = parseJson<Record<string, string>>(note.fieldsJson, {});
        const mediaId = fields.audioMediaId;
        if (mediaId === undefined) continue;
        try {
          await client.prefetchQuery({
            queryKey: mediaQueryKey(userId, mediaId),
            queryFn: () => loadMediaBlob(userId, mediaId),
            staleTime: mediaQueryStaleTimeMs
          });
        } catch (error) {
          if (!cancelled) console.warn('Không thể tải trước âm thanh offline.', error);
        }
      }
    };
    const timer = window.setTimeout(() => void preload(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [client, offline.online, queue.data, userId]);
  const grade = useMutation({
    mutationFn: async ({
      card,
      rating,
      revealedAt,
      shownAt
    }: {
      card: ReviewCard | undefined;
      rating: ReviewRating;
      revealedAt: Date | null;
      shownAt: Date;
    }) => {
      if (card === undefined || revealedAt === null)
        throw new Error('Hãy xem đáp án trước khi chấm điểm.');
      if (deviceId === null) throw new Error('Thiết bị đang được chuẩn bị. Vui lòng thử lại.');
      const now = new Date();
      const event = {
        clientEventId: crypto.randomUUID(),
        cardId: card.id,
        sessionId,
        deviceId,
        rating,
        shownAtUtc: shownAt.toISOString(),
        revealedAtUtc: revealedAt.toISOString(),
        gradedAtUtc: now.toISOString(),
        reviewedAtUtc: now.toISOString(),
        cardVersionBefore: card.version
      };
      if (navigator.onLine) {
        try {
          const result = await api.post<ReviewSubmission>('/reviews', event);
          await rememberForDailyBrowse(card, shownAt);
          return result;
        } catch (error) {
          if (error instanceof ApiError) throw error;
        }
      }
      const scheduled = schedulingService.review(
        {
          ...card,
          dueAtUtc: new Date(card.dueAtUtc),
          lastReviewAtUtc: card.lastReviewAtUtc === null ? null : new Date(card.lastReviewAtUtc)
        },
        rating,
        now
      ).card;
      const locallyUpdatedCard: CachedReviewCard = {
        ...card,
        ...scheduled,
        dueAtUtc: scheduled.dueAtUtc.toISOString(),
        lastReviewAtUtc: scheduled.lastReviewAtUtc?.toISOString() ?? null,
        version: card.version + 1
      };
      await offlineDb.pendingReviewEvents.put({ ...event, createdAtUtc: now.toISOString() });
      const cachedQueue = await offlineDb.reviewQueue.get(reviewQueueCacheId);
      if (cachedQueue !== undefined) {
        await offlineDb.reviewQueue.put({
          ...cachedQueue,
          cards: cachedQueue.cards.map((queuedCard) =>
            queuedCard.id === locallyUpdatedCard.id ? locallyUpdatedCard : queuedCard
          )
        });
      }
      await rememberForDailyBrowse(card, shownAt);
      return { reviewLog: { id: event.clientEventId }, offline: true };
    },
    onMutate: () => {
      const previousActiveCardId = activeCardId;
      const previousShownAt = shownAt;
      const previousRevealedAt = revealedAt;
      setActiveCardId(cards[activeCardIndex + 1]?.id ?? null);
      revealedAtRef.current = null;
      setRevealedAt(null);
      setShownAt(new Date());
      return { previousActiveCardId, previousShownAt, previousRevealedAt };
    },
    onSuccess: (result) => {
      setHasConflict(false);
      setLastReviewId(result.offline ? null : result.reviewLog.id);
    },
    onError: (error, _rating, context) => {
      if (context !== undefined) {
        setActiveCardId(context.previousActiveCardId);
        setShownAt(context.previousShownAt);
        revealedAtRef.current = context.previousRevealedAt;
        setRevealedAt(context.previousRevealedAt);
      }
      setHasConflict(error instanceof ApiError && error.status === 409);
      setSubmitError(errorMessage(error));
    }
  });
  const submitGrade = (rating: ReviewRating) =>
    grade.mutate({ card, rating, revealedAt: revealedAtRef.current, shownAt });
  const undo = useMutation({
    mutationFn: (reviewLogId: string) => api.post(`/reviews/${reviewLogId}/undo`, {}),
    onSuccess: () => {
      setLastReviewId(null);
      setActiveCardId(undefined);
      void client.invalidateQueries({ queryKey: ['review-queue'] });
    },
    onError: (error) => setSubmitError(errorMessage(error))
  });
  const togglePause = () => {
    if (isPaused) {
      const pauseDuration = pausedAt === null ? 0 : Date.now() - pausedAt.getTime();
      pausedSessionMs.current += pauseDuration;
      setShownAt((value) => new Date(value.getTime() + pauseDuration));
      setRevealedAt((value) => (value === null ? null : new Date(value.getTime() + pauseDuration)));
      setPausedAt(null);
      setIsPaused(false);
      return;
    }
    window.speechSynthesis?.cancel();
    setPausedAt(new Date());
    setIsPaused(true);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === null) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setSubmitError('Trình duyệt không cho phép bật chế độ toàn màn hình.');
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches('input, textarea, select') || event.target.isContentEditable)
      )
        return;
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        togglePause();
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (isPaused) return;
      if (event.key === ' ' && revealedAt === null) {
        event.preventDefault();
        revealCard();
      }
      const rating = ratingForShortcut(event.key);
      if (rating !== null && revealedAtRef.current !== null && !grade.isPending) {
        event.preventDefault();
        submitGrade(rating);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [grade, isPaused, pausedAt, revealedAt, shownAt]);
  if (queue.isLoading)
    return (
      <Shell focus>
        <section className="review-study" aria-busy="true" aria-label="Đang chuẩn bị phiên ôn tập">
          <div className="review-stage">
            <div className="review-card review-card-loading">
              <span
                className="skeleton"
                style={{ width: '56%', height: 40, justifySelf: 'center' }}
              />
              <span
                className="skeleton"
                style={{ width: '82%', height: 24, justifySelf: 'center' }}
              />
            </div>
          </div>
          <span className="skeleton" style={{ width: 224, height: 48, justifySelf: 'center' }} />
        </section>
      </Shell>
    );
  if (queue.isError)
    return (
      <Shell focus>
        <QueryError title="Không thể chuẩn bị phiên ôn tập." onRetry={() => void queue.refetch()} />
      </Shell>
    );
  if (card === undefined)
    return (
      <Shell focus>
        <header className="review-header">
          <Link className="button-link" to="/">
            Kết thúc phiên
          </Link>
        </header>
        <EmptyState
          title="Phiên học đã xong"
          description="Không còn thẻ đến hạn. Bạn có thể nghỉ ở đây và quay lại khi thuận tiện."
        />
        {lastReviewId !== null && (
          <button className="secondary" onClick={() => undo.mutate(lastReviewId)}>
            Hoàn tác lần chấm cuối
          </button>
        )}
      </Shell>
    );
  const hasCurrentNote = currentNote !== undefined;
  const fields =
    currentNote === undefined ? {} : parseJson<Record<string, string>>(currentNote.fieldsJson, {});
  const front = fields.front ?? fields.text ?? 'Đang tải nội dung…';
  const back = fields.back ?? '';
  const revealed = revealedAt !== null;
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (start === null || grade.isPending) return;
    const touch = event.changedTouches[0];
    if (touch === undefined) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) {
      if (!revealed) revealCard();
      return;
    }
    if (!revealed) return;
    const revealedAt = revealedAtRef.current;
    if (revealedAt === null) return;
    if (dy < -60 && Math.abs(dy) > Math.abs(dx)) submitGrade('Easy');
    else if (dx < -60 && Math.abs(dx) > Math.abs(dy)) submitGrade('Again');
    else if (dx > 60 && Math.abs(dx) > Math.abs(dy)) submitGrade('Good');
  };
  const speechText = getCardSpeechText(fields, revealed);
  const totalCards = queue.data?.totalDueCards ?? queue.data?.cards.length ?? 0;
  const completedCards = Math.min(activeCardIndex, totalCards);
  const progress = totalCards === 0 ? 0 : Math.round((completedCards / totalCards) * 100);
  const sessionPlan = queue.data?.sessionPlan;
  const sessionBudgetMinutes = (sessionPlan?.requestedMinutes ?? 0) + extraMinutes;
  const currentPauseMs =
    isPaused && pausedAt !== null ? Math.max(0, clockNowMs - pausedAt.getTime()) : 0;
  const timeProgress =
    sessionStartedAtMs === null || sessionPlan === undefined
      ? null
      : reviewSessionTimeProgress(
          sessionStartedAtMs,
          clockNowMs,
          sessionBudgetMinutes,
          pausedSessionMs.current + currentPauseMs
        );
  return (
    <Shell focus>
      <header className="review-header">
        <Link className="button-link" to="/">
          Kết thúc phiên
        </Link>
        <div className="review-title">
          <p className="eyebrow">Ôn tập</p>
          <h1>Phiên ôn tập</h1>
        </div>
        <div className="review-progress" aria-label="Tiến độ phiên ôn tập">
          {sessionPlan !== undefined && timeProgress !== null && (
            <div className="review-session-progress">
              <strong>Phiên học {sessionBudgetMinutes} phút</strong>
              <span>Còn khoảng {timeProgress.remainingMinutes} phút</span>
              <span>
                Đã hoàn thành {completedCards}/{totalCards} lượt dự kiến
              </span>
            </div>
          )}
          <div className="review-progress-copy">
            <span>
              Thẻ {activeCardIndex + 1} / {totalCards}
            </span>
            <span>{progress}% hoàn thành</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalCards}
            aria-valuenow={completedCards}
            aria-valuetext={`Đã hoàn thành ${completedCards} trên ${totalCards} thẻ`}
          >
            <span className="progress-value" style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </div>
        <div className="review-header-actions">
          <button className="secondary" type="button" onClick={togglePause}>
            {isPaused ? 'Tiếp tục' : 'Tạm dừng'} <kbd>P</kbd>
          </button>
          {lastReviewId !== null && (
            <button className="secondary" onClick={() => undo.mutate(lastReviewId)}>
              Hoàn tác
            </button>
          )}
        </div>
      </header>
      {timeProgress?.budgetReached === true && (
        <section className="review-budget-notice" aria-live="polite">
          <div>
            <strong>Bạn đã đạt ngân sách học hôm nay.</strong>
            <p>Hoàn tất câu trả lời đang làm, rồi kết thúc hoặc học thêm nếu bạn vẫn còn sức.</p>
          </div>
          <div>
            <button type="button" onClick={() => navigate('/study-plan')}>
              Kết thúc phiên
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setExtraMinutes((value) => value + 5)}
            >
              Học thêm 5 phút
            </button>
          </div>
        </section>
      )}
      <details className="review-options">
        <summary>Tùy chỉnh phiên học</summary>
        <section className="review-toolbar" aria-label="Tùy chỉnh phiên học">
          <label>
            Cỡ chữ
            <select
              value={fontSize}
              onChange={(event) => setFontSize(event.target.value as ReviewFontSize)}
            >
              <option value="small">Nhỏ</option>
              <option value="medium">Vừa</option>
              <option value="large">Lớn</option>
            </select>
          </label>
          <label>
            Chiều rộng thẻ
            <select
              value={cardWidth}
              onChange={(event) => setCardWidth(event.target.value as ReviewCardWidth)}
            >
              <option value="compact">Gọn</option>
              <option value="balanced">Cân bằng</option>
              <option value="wide">Rộng</option>
            </select>
          </label>
          <ThemeToggle />
          <button className="secondary" type="button" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'} <kbd>F</kbd>
          </button>
        </section>
      </details>
      {!offline.online && (
        <p className="offline-notice" role="status">
          Lượt ôn offline được lưu trên thiết bị này và sẽ đồng bộ khi có kết nối lại.
        </p>
      )}
      {note.isError ? (
        <QueryError title="Không thể tải nội dung thẻ." onRetry={() => void note.refetch()} />
      ) : (
        <section
          className="review-study"
          data-font-size={fontSize}
          data-card-width={cardWidth}
          aria-busy={!hasCurrentNote || grade.isPending}
        >
          {isPaused ? (
            <div className="review-paused" role="status">
              <span className="review-pause-mark" aria-hidden="true">
                Ⅱ
              </span>
              <h2>Phiên học đang tạm dừng</h2>
              <p>Tiến độ của bạn được giữ nguyên. Nghỉ một chút cũng là một phần của việc học.</p>
              <button type="button" onClick={togglePause}>
                Tiếp tục học <kbd>P</kbd>
              </button>
            </div>
          ) : (
            <>
              {!hasCurrentNote ? (
                <div className="review-stage">
                  <div className="review-card review-card-loading">
                    <span
                      className="skeleton"
                      style={{ width: '72%', height: 40, justifySelf: 'center' }}
                    />
                    <span
                      className="skeleton"
                      style={{ width: '48%', height: 24, justifySelf: 'center' }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="review-support">
                    <SpeechControl
                      contentKey={`${card.id}:${revealed ? 'back' : 'front'}`}
                      text={speechText}
                    />
                  </div>
                  <div
                    className="review-stage"
                    role="group"
                    aria-label={revealed ? 'Mặt sau của thẻ' : 'Mặt trước của thẻ'}
                    onTouchStart={(event) => {
                      const touch = event.touches[0];
                      if (touch !== undefined)
                        touchStart.current = { x: touch.clientX, y: touch.clientY };
                    }}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div key={card.id} className={`review-card${revealed ? ' is-revealed' : ''}`}>
                      <article
                        className="review-card-face review-card-front"
                        aria-hidden={revealed}
                      >
                        <div className="review-card-meta">
                          <span className="review-side-label">Câu hỏi</span>
                          <span className="review-card-count">
                            {activeCardIndex + 1} / {totalCards}
                          </span>
                        </div>
                        <p className="review-face">{front}</p>
                        <p className="review-hint">Nhớ câu trả lời trước khi lật thẻ.</p>
                      </article>
                      <article
                        className="review-card-face review-card-back"
                        aria-hidden={!revealed}
                      >
                        <div className="review-card-meta">
                          <span className="review-side-label">Đáp án</span>
                          <span className="review-answer-mark" aria-hidden="true">
                            ✓
                          </span>
                        </div>
                        <div className="review-recall">
                          <span>Câu hỏi</span>
                          <p>{front}</p>
                        </div>
                        <p className="answer">{back}</p>
                      </article>
                    </div>
                  </div>
                  <div className="review-support">
                    <AudioControl mediaId={fields.audioMediaId} />
                  </div>
                  {!revealed ? (
                    <ReviewControls
                      revealed={false}
                      previews={undefined}
                      isSubmitting={grade.isPending || deviceId === null}
                      onReveal={revealCard}
                      onGrade={() => undefined}
                    />
                  ) : (
                    <ReviewControls
                      revealed
                      previews={previews.data}
                      isSubmitting={grade.isPending || deviceId === null}
                      onReveal={revealCard}
                      onGrade={submitGrade}
                    />
                  )}
                </>
              )}
            </>
          )}
          <div className="review-shortcuts" aria-label="Phím tắt trong phiên học">
            <strong>Phím tắt</strong>
            <span>
              <kbd>Space</kbd> Lật thẻ
            </span>
            <span>
              <kbd>1–4</kbd> Chấm điểm
            </span>
            <span>
              <kbd>P</kbd> {isPaused ? 'Tiếp tục' : 'Tạm dừng'}
            </span>
            <span>
              <kbd>F</kbd> Toàn màn hình
            </span>
          </div>
        </section>
      )}
      {submitError !== null && (
        <p className="form-error" role="alert">
          {submitError}
        </p>
      )}
      {hasConflict && (
        <button
          className="secondary"
          onClick={() => {
            setHasConflict(false);
            setSubmitError(null);
            setActiveCardId(undefined);
            void client.invalidateQueries({ queryKey: ['review-queue'] });
          }}
        >
          Tải lại hàng đợi
        </button>
      )}
    </Shell>
  );
}
function AudioControl({ mediaId }: { mediaId: string | undefined }) {
  const userId = useSession((state) => state.user?.id);
  const media = useQuery({
    queryKey: ['media', userId, mediaId],
    queryFn: () => loadMediaBlob(userId!, mediaId!),
    enabled: userId !== undefined && mediaId !== undefined,
    staleTime: mediaQueryStaleTimeMs
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (media.data === undefined) return;
    const objectUrl = URL.createObjectURL(media.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [media.data, mediaId, userId]);
  if (userId === undefined || mediaId === undefined) return null;
  if (media.isError) return <p className="form-error">Không thể tải âm thanh của thẻ.</p>;
  return url === null ? (
    <p className="muted">Đang tải âm thanh…</p>
  ) : (
    <audio key={`${userId}:${mediaId}`} controls preload="auto" src={url} />
  );
}
function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/decks"
        element={
          <Protected>
            <Decks />
          </Protected>
        }
      />
      <Route
        path="/study-plan"
        element={
          <Protected>
            <Shell>
              <StudyPlanPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/notes"
        element={
          <Protected>
            <Shell>
              <NotesPage />
            </Shell>
          </Protected>
        }
      />
      <Route
        path="/review"
        element={
          <Protected>
            <Review />
          </Protected>
        }
      />
      <Route
        path="/daily-browse"
        element={
          <Protected>
            <DailyBrowse />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } }
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <SessionBootstrap>
        <OfflineProvider>
          <App />
        </OfflineProvider>
      </SessionBootstrap>
    </BrowserRouter>
  </QueryClientProvider>
);

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
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
import type { TimeBoxedDailyPlan } from '@flashcard/contracts';

import { ApiError, api } from './api.js';
import {
  offlineDb,
  getDeviceId,
  setDeviceId as persistDeviceId,
  type CachedReviewCard
} from './offline-db.js';
import { OfflineProvider, useOffline } from './offline-provider.js';
import { ReviewControls } from './review-controls.js';
import {
  nextReviewIndex,
  ratingForShortcut,
  reviewSessionTimeProgress,
  type ReviewRating
} from './review-utils.js';
import { useSession, type User } from './session.js';
import { getCardSpeechText, SpeechControl } from './speech-control.js';
import { NotesPage } from './notes-page.js';
import { StudyPlanPage } from './study-plan-page.js';
import { WeaknessAnalysis, type WeaknessAnalysisData } from './weakness-analysis.js';
import {
  ThemeToggle,
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
    onError: (error) => setSubmitError(errorMessage(error))
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
  const navigate = useNavigate();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountInitial = user?.email.charAt(0).toUpperCase() ?? '?';
  const syncLabel = !offline.online
    ? 'Ngoại tuyến'
    : offline.syncing
      ? 'Đang đồng bộ'
      : offline.pendingCount > 0
        ? `Chờ đồng bộ ${offline.pendingCount} mục`
        : 'Đã đồng bộ';
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
                <button
                  className="account-menu-item"
                  type="button"
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
const Metric = ({ label, value }: { label: string; value: string | number }) => (
  <article className="metric">
    <strong>{value}</strong>
    <span>{label}</span>
  </article>
);
function Dashboard() {
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
  const offline = useOffline();
  const queries = [decks, notes, today, retention, backlog, activity, weaknesses];
  const isLoading = queries.some((query) => query.isLoading);
  const hasError = queries.some((query) => query.isError);
  const retry = () => {
    void Promise.all(queries.map((query) => query.refetch()));
  };
  return (
    <Shell>
      <header className="page-header">
        <div>
          <p className="eyebrow">Tổng quan</p>
          <h1>Học có chủ đích.</h1>
          <p className="muted">Theo dõi tiến độ và tiếp tục nhịp học của bạn.</p>
        </div>
        <Link className="button" to="/review">
          Ôn tập ngay
        </Link>
      </header>
      {isLoading ? (
        <ListSkeleton />
      ) : hasError ? (
        <QueryError title="Không thể tải tổng quan." onRetry={retry} />
      ) : (
        <>
          <div className="metric-grid">
            <Metric
              label="Bộ thẻ đang dùng"
              value={decks.data?.filter((deck) => !deck.isArchived).length ?? '—'}
            />
            <Metric label="Thẻ" value={notes.data?.length ?? '—'} />
            <Metric label="Cần ôn hôm nay" value={today.data?.dueCount ?? '—'} />
            <Metric
              label="Thời gian ôn"
              value={
                today.data?.reviewTimeSeconds === undefined
                  ? '—'
                  : `${Math.ceil(today.data.reviewTimeSeconds / 60)} phút`
              }
            />
          </div>
          <section className="panel dashboard-details">
            <Metric
              label="Khả năng ghi nhớ"
              value={
                retention.data === undefined
                  ? '—'
                  : `${Math.round(retention.data.averageRetrievability * 100)}%`
              }
            />
            <Metric
              label="Sync"
              value={offline.pendingCount === 0 ? 'Ready' : `${offline.pendingCount} pending`}
            />
            <div>
              <h3>Hàng đợi nhập liệu</h3>
              <p>
                {backlog.data?.map((item) => `${item.status}: ${item.count}`).join(' · ') ||
                  'Không có dữ liệu tồn đọng.'}
              </p>
            </div>
            <div>
              <h3>Hoạt động 14 ngày</h3>
              <p>
                {activity.data?.map((item) => `${item.day}: ${item.reviews}`).join(' · ') ||
                  'Chưa có lượt ôn nào.'}
              </p>
            </div>
          </section>
          {weaknesses.data !== undefined && <WeaknessAnalysis data={weaknesses.data} />}
          <section className="panel study-callout">
            <div>
              <h2>Tiếp tục học</h2>
              <p>Hàng đợi ôn tập của bạn được sắp xếp theo lịch học hiện tại.</p>
            </div>
            <Link className="button" to="/review">
              Bắt đầu ôn tập
            </Link>
          </section>
          {decks.data !== undefined && decks.data.length > 0 && (
            <section>
              <h2 className="section-title">Bộ thẻ gần đây</h2>
              <div className="dashboard-deck-grid">
                {decks.data.slice(0, 3).map((deck) => (
                  <Link className="dashboard-deck" to="/decks" key={deck.id}>
                    <h3>{deck.name}</h3>
                    <p>{deck.description || 'Chưa có mô tả.'}</p>
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

function Review() {
  const client = useQueryClient();
  const navigate = useNavigate();
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
  const [index, setIndex] = useState(0);
  const [shownAt, setShownAt] = useState(() => new Date());
  const [revealedAt, setRevealedAt] = useState<Date | null>(null);
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
        return cached;
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
  const card = queue.data?.cards[index];
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
  const previews = useQuery({
    queryKey: ['review-preview', card?.id],
    queryFn: () => api.get<ReviewPreview[]>(`/cards/${card!.id}/review-preview`),
    enabled: card !== undefined && revealedAt !== null
  });
  useEffect(() => {
    const nextCard = queue.data?.cards[index + 1];
    if (nextCard !== undefined) {
      const nextNote = client.fetchQuery({
        queryKey: ['review-note', nextCard.noteId],
        queryFn: () => api.get<Note>(`/notes/${nextCard.noteId}`)
      });
      void nextNote.then((note) => {
        const fields = parseJson<Record<string, string>>(note.fieldsJson, {});
        if (fields.audioMediaId !== undefined)
          void client.prefetchQuery({
            queryKey: ['media', fields.audioMediaId],
            queryFn: () => api.getBlob(`/media/${fields.audioMediaId}`)
          });
      });
    }
  }, [client, index, queue.data]);
  const grade = useMutation({
    mutationFn: async (rating: ReviewRating) => {
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
          return await api.post<ReviewSubmission>('/reviews', event);
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
      return { reviewLog: { id: event.clientEventId }, offline: true };
    },
    onMutate: () => {
      const previousIndex = index;
      const previousShownAt = shownAt;
      const previousRevealedAt = revealedAt;
      setIndex(nextReviewIndex);
      setRevealedAt(null);
      setShownAt(new Date());
      return { previousIndex, previousShownAt, previousRevealedAt };
    },
    onSuccess: (result) => {
      setHasConflict(false);
      setLastReviewId(result.offline ? null : result.reviewLog.id);
    },
    onError: (error, _rating, context) => {
      if (context !== undefined) {
        setIndex(context.previousIndex);
        setShownAt(context.previousShownAt);
        setRevealedAt(context.previousRevealedAt);
      }
      setHasConflict(error instanceof ApiError && error.status === 409);
      setSubmitError(errorMessage(error));
    }
  });
  const undo = useMutation({
    mutationFn: (reviewLogId: string) => api.post(`/reviews/${reviewLogId}/undo`, {}),
    onSuccess: () => {
      setLastReviewId(null);
      setIndex((value) => Math.max(0, value - 1));
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
      if (event.target instanceof HTMLElement && event.target.matches('button, a')) return;
      if (isPaused) return;
      if (event.key === ' ' && revealedAt === null) {
        event.preventDefault();
        setRevealedAt(new Date());
      }
      const rating = ratingForShortcut(event.key);
      if (rating !== null && revealedAt !== null && !grade.isPending) grade.mutate(rating);
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
  const fields =
    note.data === undefined ? {} : parseJson<Record<string, string>>(note.data.fieldsJson, {});
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
      if (!revealed) setRevealedAt(new Date());
      return;
    }
    if (!revealed) return;
    if (dy < -60 && Math.abs(dy) > Math.abs(dx)) grade.mutate('Easy');
    else if (dx < -60 && Math.abs(dx) > Math.abs(dy)) grade.mutate('Again');
    else if (dx > 60 && Math.abs(dx) > Math.abs(dy)) grade.mutate('Good');
  };
  const speechText = getCardSpeechText(fields, revealed);
  const totalCards = queue.data?.cards.length ?? 0;
  const completedCards = Math.min(index, totalCards);
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
              Thẻ {index + 1} / {totalCards}
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
          aria-busy={note.isLoading || grade.isPending}
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
              {note.isLoading ? (
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
                            {index + 1} / {totalCards}
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
                      onReveal={() => setRevealedAt(new Date())}
                      onGrade={() => undefined}
                    />
                  ) : (
                    <ReviewControls
                      revealed
                      previews={previews.data}
                      isSubmitting={grade.isPending || deviceId === null}
                      onReveal={() => undefined}
                      onGrade={(rating) => grade.mutate(rating)}
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
            setIndex(0);
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
  const media = useQuery({
    queryKey: ['media', mediaId],
    queryFn: () => api.getBlob(`/media/${mediaId!}`),
    enabled: mediaId !== undefined
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (media.data === undefined) return;
    const objectUrl = URL.createObjectURL(media.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [media.data]);
  if (mediaId === undefined) return null;
  if (media.isError) return <p className="form-error">Không thể tải âm thanh của thẻ.</p>;
  return url === null ? (
    <p className="muted">Đang tải âm thanh…</p>
  ) : (
    <audio controls preload="auto" src={url} />
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

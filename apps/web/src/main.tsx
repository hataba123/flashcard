import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate
} from 'react-router-dom';
import { z } from 'zod';
import { schedulingService } from '@flashcard/scheduling';

import { ApiError, api } from './api.js';
import { offlineDb, getDeviceId, type CachedReviewCard } from './offline-db.js';
import { OfflineProvider, useOffline } from './offline-provider.js';
import { ReviewControls } from './review-controls.js';
import { nextReviewIndex, ratingForShortcut, type ReviewRating } from './review-utils.js';
import { useSession, type User } from './session.js';
import { getCardSpeechText, SpeechControl } from './speech-control.js';
import './styles.css';
import './hallmark.css';

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
interface ExcelImportResult {
  importedNotes: number;
  createdCards: number;
  skippedRows: number;
  errors: string[];
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
const deckSchema = z.object({
  name: z.string().trim().min(1, 'Tên bộ thẻ là bắt buộc.').max(200),
  description: z.string().max(2_000),
  desiredRetention: z.coerce.number().min(0.7).max(0.97),
  dailyNewCardLimit: z.coerce.number().int().min(0).max(1_000),
  isCore: z.boolean()
});
const noteSchema = z.object({
  deckId: z.uuid('Vui lòng chọn bộ thẻ.'),
  noteType: z.enum(['Basic', 'BasicAndReverse', 'Cloze']),
  front: z.string().trim().min(1, 'Mặt trước là bắt buộc.'),
  back: z.string().trim().min(1, 'Mặt sau là bắt buộc.'),
  tags: z.string()
});
type LoginForm = z.infer<typeof loginSchema>;
type DeckForm = z.infer<typeof deckSchema>;
type NoteForm = z.infer<typeof noteSchema>;
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

function Login() {
  const navigate = useNavigate();
  const setSession = useSession((state) => state.setSession);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<LoginForm>({ defaultValues: { email: '', password: '' } });
  const login = useMutation({
    mutationFn: async (values: LoginForm) => {
      const input = loginSchema.parse(values);
      const result = await api.post<{ accessToken: string }>('/auth/login', {
        ...input,
        deviceId: await getDeviceId(),
        deviceName: 'Web browser',
        platform: navigator.userAgent.slice(0, 100)
      });
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
        <div className="auth-brand" aria-label="Flashcard">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Flashcard</span>
        </div>
        <h1>Đăng nhập</h1>
        <p className="muted">Quay lại đúng chỗ bạn đã dừng và tiếp tục nhịp học hôm nay.</p>
        <label>
          Email
          <input type="email" autoComplete="email" {...form.register('email')} />
        </label>
        <FormError message={form.formState.errors.email?.message} />
        <label>
          Mật khẩu
          <input type="password" autoComplete="current-password" {...form.register('password')} />
        </label>
        <FormError message={form.formState.errors.password?.message} />
        {submitError !== null && (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        )}
        <button disabled={login.isPending} aria-busy={login.isPending}>
          <ButtonContent loading={login.isPending}>
            {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </ButtonContent>
        </button>
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
      <aside className={navigationOpen ? 'navigation-open' : undefined}>
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
        <nav>
          <NavLink to="/" end onClick={() => setNavigationOpen(false)}>
            Tổng quan
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
          <span>{user?.email}</span>
          <span className={offline.online ? 'sync-state' : 'sync-state offline'}>
            {offline.online ? 'Online' : 'Offline'}
            {offline.pendingCount > 0 ? ` · ${offline.pendingCount} pending` : ''}
          </span>
          <button className="button-link" onClick={() => void logout()}>
            Đăng xuất
          </button>
        </div>
      </aside>
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
  const offline = useOffline();
  const queries = [decks, notes, today, retention, backlog, activity];
  const isLoading = queries.every((query) => query.isLoading);
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

function NoteEditor({ decks, done }: { decks: Deck[]; done(): void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<NoteForm>({
    defaultValues: { deckId: decks[0]?.id ?? '', noteType: 'Basic', front: '', back: '', tags: '' }
  });
  const save = useMutation({
    mutationFn: async (values: NoteForm) => {
      const input = noteSchema.parse(values);
      const note = await api.post<Note>('/notes', {
        deckId: input.deckId,
        noteType: input.noteType,
        fields:
          input.noteType === 'Cloze'
            ? { text: input.front, back: input.back }
            : { front: input.front, back: input.back },
        tags: input.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      });
      await api.post(`/notes/${note.id}/generate-cards`, {});
    },
    onSuccess: done,
    onError: (error) => setSubmitError(errorMessage(error))
  });
  return (
    <section className="panel">
      <h2>Tạo thẻ</h2>
      <form
        className="editor-form"
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        noValidate
      >
        <label>
          Bộ thẻ
          <select {...form.register('deckId')}>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loại thẻ
          <select {...form.register('noteType')}>
            <option value="Basic">Basic</option>
            <option value="BasicAndReverse">Basic và đảo chiều</option>
            <option value="Cloze">Cloze</option>
          </select>
        </label>
        <label>
          <span className="field-label">
            Mặt trước / nội dung{' '}
            <span className="required" aria-hidden="true">
              *
            </span>
          </span>
          <textarea aria-required="true" {...form.register('front')} />
        </label>
        <FormError message={form.formState.errors.front?.message} />
        <label>
          <span className="field-label">
            Mặt sau{' '}
            <span className="required" aria-hidden="true">
              *
            </span>
          </span>
          <textarea aria-required="true" {...form.register('back')} />
        </label>
        <FormError message={form.formState.errors.back?.message} />
        <label>
          Nhãn, cách nhau bằng dấu phẩy
          <input {...form.register('tags')} />
        </label>
        {submitError !== null && (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        )}
        <div className="actions">
          <button disabled={save.isPending} aria-busy={save.isPending}>
            <ButtonContent loading={save.isPending}>
              {save.isPending ? 'Đang lưu…' : 'Lưu và tạo thẻ'}
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
function Notes() {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [importDeckId, setImportDeckId] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const notes = useQuery({ queryKey: ['notes'], queryFn: () => api.get<Note[]>('/notes') });
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api.get<Deck[]>('/decks') });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onSuccess: () => {
      setRemoveError(null);
      void client.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => setRemoveError(errorMessage(error))
  });
  const importExcel = useMutation({
    mutationFn: ({ deckId, file }: { deckId: string; file: File }) => {
      const data = new FormData();
      data.append('file', file);
      return api.postForm<ExcelImportResult>(`/decks/${deckId}/import-excel`, data);
    },
    onSuccess: (result) => {
      setImportError(null);
      setImportResult(result);
      void client.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => setImportError(errorMessage(error))
  });
  const done = () => {
    setCreating(false);
    void client.invalidateQueries({ queryKey: ['notes'] });
  };
  const selectedImportDeckId = importDeckId || decks.data?.[0]?.id || '';
  return (
    <Shell>
      <header className="page-header">
        <div>
          <p className="eyebrow">Nội dung học</p>
          <h1>Thẻ</h1>
          <p className="muted">
            {notes.data === undefined ? 'Đang tải số lượng…' : `${notes.data.length} thẻ`}
          </p>
        </div>
        <div className="page-actions">
          <label className="import-deck">
            <span className="sr-only">Bộ thẻ nhận dữ liệu import</span>
            <select
              aria-label="Bộ thẻ nhận dữ liệu import"
              disabled={decks.isLoading || !decks.data?.length || importExcel.isPending}
              value={selectedImportDeckId}
              onChange={(event) => setImportDeckId(event.target.value)}
            >
              {decks.data?.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file !== undefined && selectedImportDeckId)
                importExcel.mutate({ deckId: selectedImportDeckId, file });
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={decks.isLoading || !decks.data?.length || importExcel.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <ButtonContent loading={importExcel.isPending}>
              {importExcel.isPending ? 'Đang import…' : 'Import Excel'}
            </ButtonContent>
          </button>
          <button
            disabled={decks.isLoading || !decks.data?.length}
            onClick={() => setCreating(true)}
          >
            Tạo thẻ
          </button>
        </div>
      </header>
      <p className="muted import-help">
        Excel cần có cột Front và Back; có thể thêm Tags (ngăn cách bằng dấu phẩy) và Type (Basic,
        BasicAndReverse hoặc Cloze). Cũng hỗ trợ tiêu đề Mặt trước, Mặt sau, Nhãn và Loại.
      </p>
      {importResult !== null && (
        <div className="import-result" role="status">
          <p>
            Đã tạo {importResult.importedNotes} thẻ và {importResult.createdCards} thẻ ôn tập.
            {importResult.skippedRows > 0
              ? ` Bỏ qua ${importResult.skippedRows} dòng không hợp lệ.`
              : ''}
          </p>
          {importResult.errors.length > 0 && (
            <ul>
              {importResult.errors.slice(0, 3).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {importError !== null && (
        <p className="form-error" role="alert">
          {importError}
        </p>
      )}
      {!decks.isLoading && decks.data?.length === 0 && (
        <EmptyState
          title="Bạn cần một bộ thẻ trước"
          description="Tạo bộ thẻ để bắt đầu thêm thẻ học."
          action={
            <Link className="button" to="/decks">
              Tạo bộ thẻ
            </Link>
          }
        />
      )}
      {creating && <NoteEditor decks={decks.data ?? []} done={done} />}
      {removeError !== null && (
        <p className="form-error" role="alert">
          {removeError}
        </p>
      )}
      {notes.isLoading ? (
        <ListSkeleton />
      ) : notes.isError ? (
        <QueryError title="Không thể tải danh sách thẻ." onRetry={() => void notes.refetch()} />
      ) : notes.data?.length === 0 ? (
        <EmptyState
          title="Bạn chưa có thẻ nào"
          description="Thêm thẻ để bắt đầu ôn tập với bộ thẻ của bạn."
          action={
            decks.data?.length ? (
              <button onClick={() => setCreating(true)}>Tạo thẻ</button>
            ) : undefined
          }
        />
      ) : (
        <div className="card-list">
          {notes.data?.map((note) => {
            const fields = parseJson<Record<string, string>>(note.fieldsJson, {});
            const tags = parseJson<string[]>(note.tagsJson, []);
            return (
              <article className="card" key={note.id}>
                <div>
                  <h2>{fields.front ?? fields.text ?? 'Thẻ'}</h2>
                  <p>{fields.back ?? ''}</p>
                  <small>{note.noteType}</small>
                  {tags.length > 0 && (
                    <div className="tag-list" aria-label="Nhãn">
                      {tags.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="actions">
                  <button
                    className="danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm('Xóa mềm thẻ này?')) remove.mutate(note.id);
                    }}
                  >
                    Xóa
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
function Review() {
  const client = useQueryClient();
  const [index, setIndex] = useState(0);
  const [shownAt, setShownAt] = useState(() => new Date());
  const [revealedAt, setRevealedAt] = useState<Date | null>(null);
  const [lastReviewId, setLastReviewId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const sessionId = useState(() => crypto.randomUUID())[0];
  const [deviceId, setDeviceId] = useState<string>(() => crypto.randomUUID());
  const offline = useOffline();
  useEffect(() => {
    void getDeviceId().then(setDeviceId);
  }, []);
  const queue = useQuery({
    queryKey: ['review-queue'],
    queryFn: async () => {
      try {
        const response = await api.get<ReviewQueue>('/reviews/queue');
        await offlineDb.reviewQueue.put({
          id: 'current',
          ...response,
          cachedAtUtc: new Date().toISOString()
        });
        return response;
      } catch {
        const cached = await offlineDb.reviewQueue.get('current');
        if (cached === undefined) throw new Error('No offline review queue is available yet.');
        return cached;
      }
    }
  });
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
      const cachedQueue = await offlineDb.reviewQueue.get('current');
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
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      if (event.key === ' ' && revealedAt === null) {
        event.preventDefault();
        setRevealedAt(new Date());
      }
      const rating = ratingForShortcut(event.key);
      if (rating !== null && revealedAt !== null && !grade.isPending) grade.mutate(rating);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [grade, revealedAt]);
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
          title="Hoàn thành!"
          description="Không còn thẻ đến hạn trong ngân sách hôm nay."
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
  const speechText = getCardSpeechText(fields, revealed);
  const totalCards = queue.data?.cards.length ?? 0;
  const completedCards = Math.min(index, totalCards);
  const progress = totalCards === 0 ? 0 : Math.round((completedCards / totalCards) * 100);
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
        {lastReviewId !== null && (
          <button className="secondary" onClick={() => undo.mutate(lastReviewId)}>
            Hoàn tác
          </button>
        )}
      </header>
      {!offline.online && (
        <p className="offline-notice" role="status">
          Lượt ôn offline được lưu trên thiết bị này và sẽ đồng bộ khi có kết nối lại.
        </p>
      )}
      {note.isError ? (
        <QueryError title="Không thể tải nội dung thẻ." onRetry={() => void note.refetch()} />
      ) : (
        <section className="review-study" aria-busy={note.isLoading || grade.isPending}>
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
              <div
                className="review-stage"
                role="group"
                aria-label={revealed ? 'Mặt sau của thẻ' : 'Mặt trước của thẻ'}
              >
                <div key={card.id} className={`review-card${revealed ? ' is-revealed' : ''}`}>
                  <article className="review-card-face review-card-front" aria-hidden={revealed}>
                    <div className="review-card-meta">
                      <span className="review-side-label">Câu hỏi</span>
                      <span className="review-card-count">
                        {index + 1} / {totalCards}
                      </span>
                    </div>
                    <p className="review-face">{front}</p>
                    <p className="review-hint">Nhớ câu trả lời trước khi lật thẻ.</p>
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
                <SpeechControl
                  contentKey={`${card.id}:${revealed ? 'back' : 'front'}`}
                  text={speechText}
                />
              </div>
              {!revealed ? (
                <ReviewControls
                  revealed={false}
                  previews={undefined}
                  isSubmitting={grade.isPending}
                  onReveal={() => setRevealedAt(new Date())}
                  onGrade={() => undefined}
                />
              ) : (
                <ReviewControls
                  revealed
                  previews={previews.data}
                  isSubmitting={grade.isPending}
                  onReveal={() => undefined}
                  onGrade={(rating) => grade.mutate(rating)}
                />
              )}
            </>
          )}
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
      <Route path="/login" element={<Login />} />
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
        path="/notes"
        element={
          <Protected>
            <Notes />
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

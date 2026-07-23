import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { useEffect, useState, type ReactNode } from 'react';
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
import { create } from 'zustand';

import { ApiError, api } from './api.js';
import './styles.css';

interface User {
  id: string;
  email: string;
  timezone: string;
}
interface Session {
  accessToken: string | null;
  user: User | null;
  initialized: boolean;
  setSession(accessToken: string | null, user: User | null): void;
  setInitialized(): void;
}
const useSession = create<Session>((set) => ({
  accessToken: null,
  user: null,
  initialized: false,
  setSession: (accessToken, user) => set({ accessToken, user }),
  setInitialized: () => set({ initialized: true })
}));
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
  error instanceof ApiError ? error.message : 'Đã xảy ra lỗi. Vui lòng thử lại.';
const FormError = ({ message }: { message?: string | undefined }) =>
  message === undefined ? null : (
    <span className="form-error" role="alert">
      {message}
    </span>
  );

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
        deviceId: crypto.randomUUID(),
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
        <p className="eyebrow">Flashcard Platform</p>
        <h1>Đăng nhập</h1>
        <p className="muted">Tiếp tục nhịp học của bạn.</p>
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
        <button disabled={login.isPending}>
          {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const user = useSession((state) => state.user);
  const setSession = useSession((state) => state.setSession);
  const navigate = useNavigate();
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
    <div className="app-shell">
      <aside>
        <Link className="brand" to="/">
          Flashcard
        </Link>
        <nav>
          <NavLink to="/" end>
            Tổng quan
          </NavLink>
          <NavLink to="/decks">Bộ thẻ</NavLink>
          <NavLink to="/notes">Ghi chú</NavLink>
        </nav>
        <div className="account">
          <span>{user?.email}</span>
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
  return (
    <Shell>
      <header>
        <p className="eyebrow">Tổng quan</p>
        <h1>Học có chủ đích.</h1>
        <p className="muted">Bắt đầu bằng cách tạo bộ thẻ và ghi chú đầu tiên của bạn.</p>
      </header>
      <div className="metric-grid">
        <Metric
          label="Bộ thẻ đang dùng"
          value={decks.data?.filter((deck) => !deck.isArchived).length ?? '—'}
        />
        <Metric label="Ghi chú" value={notes.data?.length ?? '—'} />
        <Metric label="Đồng bộ" value="Sẵn sàng" />
      </div>
      <section className="panel">
        <h2>Việc tiếp theo</h2>
        <p>
          Quản lý nội dung học của bạn từ Bộ thẻ và Ghi chú. Phiên ôn tập sẽ xuất hiện tại đây ở
          milestone tiếp theo.
        </p>
        <Link className="button" to="/decks">
          Tạo bộ thẻ
        </Link>
      </section>
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
          Tên
          <input {...form.register('name')} />
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
          <button disabled={save.isPending}>{save.isPending ? 'Đang lưu…' : 'Lưu'}</button>
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
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api.get<Deck[]>('/decks') });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/decks/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['decks'] })
  });
  const done = () => {
    setEditing(undefined);
    void client.invalidateQueries({ queryKey: ['decks'] });
  };
  return (
    <Shell>
      <header className="page-header">
        <div>
          <p className="eyebrow">Nội dung</p>
          <h1>Bộ thẻ</h1>
        </div>
        <button onClick={() => setEditing(null)}>Tạo bộ thẻ</button>
      </header>
      {editing !== undefined && <DeckEditor deck={editing} done={done} />}
      {decks.isLoading ? (
        <p>Đang tải…</p>
      ) : (
        <div className="card-list">
          {decks.data?.map((deck) => (
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
      <h2>Tạo ghi chú</h2>
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
          Loại ghi chú
          <select {...form.register('noteType')}>
            <option value="Basic">Basic</option>
            <option value="BasicAndReverse">Basic và đảo chiều</option>
            <option value="Cloze">Cloze</option>
          </select>
        </label>
        <label>
          Mặt trước / nội dung
          <input {...form.register('front')} />
        </label>
        <FormError message={form.formState.errors.front?.message} />
        <label>
          Mặt sau
          <input {...form.register('back')} />
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
          <button disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu và tạo thẻ'}
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
  const notes = useQuery({ queryKey: ['notes'], queryFn: () => api.get<Note[]>('/notes') });
  const decks = useQuery({ queryKey: ['decks'], queryFn: () => api.get<Deck[]>('/decks') });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/notes/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['notes'] })
  });
  const done = () => {
    setCreating(false);
    void client.invalidateQueries({ queryKey: ['notes'] });
  };
  return (
    <Shell>
      <header className="page-header">
        <div>
          <p className="eyebrow">Nội dung</p>
          <h1>Ghi chú</h1>
        </div>
        <button disabled={!decks.data?.length} onClick={() => setCreating(true)}>
          Tạo ghi chú
        </button>
      </header>
      {!decks.data?.length && (
        <section className="panel">Tạo một bộ thẻ trước khi thêm ghi chú.</section>
      )}
      {creating && <NoteEditor decks={decks.data ?? []} done={done} />}
      {notes.isLoading ? (
        <p>Đang tải…</p>
      ) : (
        <div className="card-list">
          {notes.data?.map((note) => {
            const fields = JSON.parse(note.fieldsJson) as Record<string, string>;
            const tags = JSON.parse(note.tagsJson) as string[];
            return (
              <article className="card" key={note.id}>
                <div>
                  <h2>{fields.front ?? fields.text ?? 'Ghi chú'}</h2>
                  <p>{fields.back ?? ''}</p>
                  <small>
                    {note.noteType} · {tags.join(', ') || 'Không có nhãn'}
                  </small>
                </div>
                <div className="actions">
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm('Xóa mềm ghi chú này?')) remove.mutate(note.id);
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
        <App />
      </SessionBootstrap>
    </BrowserRouter>
  </QueryClientProvider>
);

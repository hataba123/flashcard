import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { create } from 'zustand';
import './styles.css';

interface SessionState {
  accessToken: string | null;
  setAccessToken(token: string | null): void;
}
const useSession = create<SessionState>((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken })
}));
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
async function request(path: string, options: RequestInit = {}) {
  const token = useSession.getState().accessToken;
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  });
  if (!response.ok) throw new Error('Không thể tải dữ liệu.');
  return response.status === 204 ? undefined : (response.json() as Promise<unknown>);
}
function Login() {
  const set = useSession((state) => state.setAccessToken);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = (await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
        deviceName: 'Web'
      })
    })) as { accessToken: string };
    set(result.accessToken);
  }
  return (
    <main className="auth">
      <form onSubmit={submit}>
        <h1>Flashcard</h1>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Mật khẩu
          <input name="password" type="password" required />
        </label>
        <button>Đăng nhập</button>
      </form>
    </main>
  );
}
function Decks() {
  const [decks, setDecks] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    void request('/decks').then((data) => setDecks(data as Array<{ id: string; name: string }>));
  }, []);
  return (
    <main>
      <h1>Bộ thẻ</h1>
      <ul>
        {decks.map((deck) => (
          <li key={deck.id}>{deck.name}</li>
        ))}
      </ul>
    </main>
  );
}
function App() {
  const token = useSession((state) => state.accessToken);
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/decks"
        element={token === null ? <Navigate to="/login" replace /> : <Decks />}
      />
      <Route path="*" element={<Navigate to="/decks" replace />} />
    </Routes>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>
);

import { create } from 'zustand';

export interface User {
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

export const useSession = create<Session>((set) => ({
  accessToken: null,
  user: null,
  initialized: false,
  setSession: (accessToken, user) => set({ accessToken, user }),
  setInitialized: () => set({ initialized: true })
}));

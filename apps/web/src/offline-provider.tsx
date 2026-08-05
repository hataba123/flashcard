import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useSession } from './session.js';
import {
  connectSyncSocket,
  synchronizePendingReviews,
  syncSnapshot,
  type SyncSnapshot
} from './offline-sync.js';

export function OfflineProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const accessToken = useSession((state) => state.accessToken);
  const [snapshot, setSnapshot] = useState<SyncSnapshot>({
    online: navigator.onLine,
    pendingCount: 0,
    conflictCount: 0,
    syncing: false
  });

  useEffect(() => {
    const refresh = async (sync = false) => {
      setSnapshot((current) => ({ ...current, online: navigator.onLine, syncing: sync }));
      if (navigator.onLine && accessToken !== null) {
        try {
          await synchronizePendingReviews();
        } catch {
          // The pending events stay in IndexedDB and will be retried on the next reconnect.
        }
      }
      setSnapshot(await syncSnapshot(navigator.onLine));
    };
    const onOnline = () => void refresh(true);
    const onOffline = () => void refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const onApplied = () => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      void queryClient.invalidateQueries({ queryKey: ['decks'] });
      void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['study-goals'] });
      void queryClient.invalidateQueries({ queryKey: ['study-goal-forecast'] });
      void queryClient.invalidateQueries({ queryKey: ['daily-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['daily-browse-summary'] });
    };
    window.addEventListener('flashcard-sync-applied', onApplied);
    void refresh();

    const socket =
      accessToken === null ? null : connectSyncSocket(accessToken, () => void refresh(true));
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('flashcard-sync-applied', onApplied);
      socket?.disconnect();
    };
  }, [accessToken, queryClient]);

  const value = useMemo(() => snapshot, [snapshot]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

import { createContext, useContext } from 'react';
const OfflineContext = createContext<SyncSnapshot>({
  online: true,
  pendingCount: 0,
  conflictCount: 0,
  syncing: false
});
export const useOffline = () => useContext(OfflineContext);

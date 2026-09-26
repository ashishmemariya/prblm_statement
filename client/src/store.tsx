import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, readToken, writeToken } from './api';
import type { Permission, SessionInfo, Snapshot, User } from './types';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info' | 'warn';
  title: string;
  detail?: string;
  blockers?: string[];
}

interface AppState {
  snap: Snapshot | null;
  user: User | null;
  permissions: Permission[];
  loading: boolean;
  /** true while we are restoring an existing session on first paint */
  restoring: boolean;
  busy: boolean;
  toasts: Toast[];
  can: (p: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  run: <T>(label: string, fn: () => Promise<T>, opts?: { success?: string }) => Promise<T | null>;
  notify: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    if (t.kind !== 'error') {
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
    }
  }, []);

  /** Pull the canonical snapshot. A 401 means the stored token is no longer valid. */
  const refresh = useCallback(async () => {
    try {
      const next = await api.snapshot();
      setSnap(next);
      setUser(next.me?.user ?? null);
      setPermissions(next.me?.permissions ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        writeToken(null);
        setSnap(null);
        setUser(null);
        setPermissions([]);
        return;
      }
      setToasts((t) => [
        ...t,
        {
          id: ++seq.current,
          kind: 'error',
          title: 'Cannot reach the StockSense API',
          detail: err instanceof Error ? err.message : 'Is the server running on :4000?',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!readToken()) {
      setRestoring(false);
      setLoading(false);
      return;
    }
    void api
      .session()
      .then((info: SessionInfo) => {
        setUser(info.user);
        setPermissions(info.permissions);
      })
      .catch(() => writeToken(null))
      .finally(() => {
        setRestoring(false);
        void refresh();
      });
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        const res = await api.login(email, password);
        writeToken(res.token);
        setUser(res.user);
        setPermissions(res.permissions);
        setLoading(true);
        await refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to sign in. Please try again.',
        };
      }
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    writeToken(null);
    setUser(null);
    setPermissions([]);
    setSnap(null);
  }, []);

  const can = useCallback(
    (p: Permission) => permissions.includes(p),
    [permissions],
  );

  /**
   * Every mutation goes through here so the server stays the single source of
   * truth: on success we toast then re-snapshot; on a guardrail rejection we
   * surface the exact blocker the engine returned.
   */
  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>, opts?: { success?: string }) => {
      setBusy(true);
      try {
        const out = await fn();
        await refresh();
        notify({ kind: 'success', title: opts?.success ?? `${label} posted`, detail: label });
        return out;
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        if (apiErr?.status === 401) {
          writeToken(null);
          setUser(null);
          setPermissions([]);
        }
        notify({
          kind: apiErr && apiErr.status === 422 ? 'warn' : 'error',
          title: apiErr ? `${label} blocked` : `${label} failed`,
          detail: err instanceof Error ? err.message : String(err),
          blockers: apiErr?.blockers,
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh, notify],
  );

  const value = useMemo<AppState>(
    () => ({
      snap,
      user,
      permissions,
      loading,
      restoring,
      busy,
      toasts,
      can,
      signIn,
      signOut,
      refresh,
      run,
      notify,
      dismiss,
    }),
    [snap, user, permissions, loading, restoring, busy, toasts, can, signIn, signOut, refresh, run, notify, dismiss],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Snapshot accessor that narrows away the null case for pages behind the loader. */
export function useSnap(): Snapshot {
  const { snap } = useApp();
  if (!snap) throw new Error('Snapshot not loaded');
  return snap;
}

/**
 * The signed-in user with the null case removed. Only valid inside the
 * authenticated shell, which is the only place these pages are mounted.
 */
export function useUser(): User {
  const { user } = useApp();
  if (!user) throw new Error('useUser must be used inside the authenticated shell');
  return user;
}

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
import { ApiError, readToken, writeToken } from './http';
import { authService, demoService } from './services';
import type { Permission, Snapshot, User } from './types';

export interface Toast {
  id: number;
  tone: 'success' | 'error' | 'warning' | 'info';
  title: string;
  detail?: string;
  blockers?: string[];
  /** Optional single action, e.g. "View transfer". */
  action?: { label: string; to: string };
}

export interface OperationResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  blockers?: string[];
}

interface AppState {
  snap: Snapshot | null;
  user: User | null;
  permissions: Permission[];
  loading: boolean;
  restoring: boolean;
  busy: boolean;
  /** Bumped on every completed mutation — pages use it to reload their detail. */
  revision: number;
  lastSyncAt: string;
  toasts: Toast[];
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Runs a mutation, refreshes the shared snapshot and reports the outcome. */
  run: <T>(
    label: string,
    fn: () => Promise<T>,
    opts?: { success?: string; detail?: string; action?: Toast['action'] },
  ) => Promise<OperationResult<T>>;
  notify: (toast: Omit<Toast, 'id'>) => void;
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
  const [revision, setRevision] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const inflight = useRef(false);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setToasts((list) => [...list, { ...toast, id }]);
    if (toast.tone !== 'error') {
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6000);
    }
  }, []);

  const clearSession = useCallback(() => {
    writeToken(null);
    setUser(null);
    setPermissions([]);
    setSnap(null);
  }, []);

  /** Pull the one canonical snapshot every page reads from. */
  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const next = await demoService.snapshot();
      setSnap(next);
      setUser(next.me?.user ?? null);
      setPermissions(next.me?.permissions ?? []);
      setLastSyncAt(next.generatedAt);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        return;
      }
      setToasts((list) => [
        ...list,
        {
          id: ++seq.current,
          tone: 'error',
          title: 'Cannot reach the StockSense service',
          detail:
            err instanceof ApiError
              ? err.message
              : 'Check that the backend is running, then press Retry.',
        },
      ]);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    if (!readToken()) {
      setRestoring(false);
      setLoading(false);
      return;
    }
    void authService
      .session()
      .then((info) => {
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
    async (email: string, password: string) => {
      try {
        const res = await authService.login(email, password);
        writeToken(res.token);
        setUser(res.user);
        setPermissions(res.permissions);
        setLoading(true);
        await refresh();
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.',
        };
      }
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    clearSession();
  }, [clearSession]);

  const can = useCallback((p: Permission) => permissions.includes(p), [permissions]);
  const canAny = useCallback(
    (...list: Permission[]) => list.some((p) => permissions.includes(p)),
    [permissions],
  );

  /**
   * Every mutation flows through here. The server is the source of truth, so a
   * success is only reported after the snapshot has been re-read; a refusal is
   * surfaced with the exact reason the engine gave.
   */
  const run = useCallback(
    async <T,>(
      label: string,
      fn: () => Promise<T>,
      opts?: { success?: string; detail?: string; action?: Toast['action'] },
    ): Promise<OperationResult<T>> => {
      setBusy(true);
      try {
        const data = await fn();
        await refresh();
        setRevision((r) => r + 1);
        notify({
          tone: 'success',
          title: opts?.success ?? `${label} completed`,
          detail: opts?.detail,
          action: opts?.action,
        });
        return { ok: true, data };
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : null;
        if (apiErr?.status === 401) clearSession();
        const message = err instanceof Error ? err.message : String(err);
        notify({
          tone: apiErr && (apiErr.status === 409 || apiErr.status === 422) ? 'warning' : 'error',
          title: apiErr && apiErr.status >= 400 && apiErr.status < 500 ? `${label} was not completed` : `${label} failed`,
          detail: message,
          blockers: apiErr?.blockers,
        });
        return { ok: false, error: message, blockers: apiErr?.blockers };
      } finally {
        setBusy(false);
      }
    },
    [refresh, notify, clearSession],
  );

  const value = useMemo<AppState>(
    () => ({
      snap,
      user,
      permissions,
      loading,
      restoring,
      busy,
      revision,
      lastSyncAt,
      toasts,
      can,
      canAny,
      signIn,
      signOut,
      refresh,
      run,
      notify,
      dismiss,
    }),
    [
      snap, user, permissions, loading, restoring, busy, revision, lastSyncAt, toasts,
      can, canAny, signIn, signOut, refresh, run, notify, dismiss,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Snapshot with the null case removed. Only valid behind the app loader. */
export function useSnap(): Snapshot {
  const { snap } = useApp();
  if (!snap) throw new Error('Snapshot not loaded');
  return snap;
}

export function useUser(): User {
  const { user } = useApp();
  if (!user) throw new Error('useUser must be used inside the signed-in shell');
  return user;
}

import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthSession, Permission, Role, User } from './types.js';
import { getDb } from './store.js';
import { HttpError } from './engine.js';
import { hashPassword, verifyPassword } from './password.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export { SESSION_TTL_MS };
export { hashPassword, verifyPassword };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `attachUser` / `requireAuth` when a valid bearer token is present. */
      user?: User;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Role -> permission matrix
 * ------------------------------------------------------------------ */

const VIEWER: Permission[] = [
  'product.view',
  'receipt.view',
  'delivery.view',
  'transfer.view',
  'adjustment.view',
  'count.view',
  'ledger.view',
  'report.view',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Admin: [
    ...VIEWER,
    'product.manage',
    'receipt.create',
    'receipt.post',
    'delivery.create',
    'delivery.pick',
    'delivery.post',
    'transfer.create',
    'transfer.post',
    'adjustment.create',
    'adjustment.approve',
    'count.create',
    'count.approve',
    'ledger.export',
    'settings.manage',
    'diagnostics.view',
    'demo.reset',
    'user.impersonate',
  ],
  'Inventory Manager': [
    ...VIEWER,
    'product.manage',
    'receipt.create',
    'receipt.post',
    'delivery.create',
    'delivery.post',
    'transfer.create',
    'transfer.post',
    'adjustment.create',
    'count.create',
    'ledger.export',
    'settings.manage',
    'demo.reset',
  ],
  'Floor Supervisor': [
    ...VIEWER,
    'delivery.pick',
    'transfer.post',
    'adjustment.approve',
    'count.approve',
    'ledger.export',
  ],
  'Warehouse Staff': [
    ...VIEWER,
    'receipt.post',
    'delivery.pick',
    'transfer.create',
    'transfer.post',
    'adjustment.create',
    'count.create',
  ],
};

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(user: User | null | undefined, permission: Permission): boolean {
  return !!user && permissionsFor(user.role).includes(permission);
}

/* ------------------------------------------------------------------ *
 * Sessions — held in memory so tokens never touch disk.
 * ------------------------------------------------------------------ */

const sessions = new Map<string, AuthSession>();

function sweep(): void {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (new Date(s.expiresAt).getTime() <= now) sessions.delete(token);
  }
}

export function createSession(userId: string): AuthSession {
  sweep();
  const now = Date.now();
  const session: AuthSession = {
    token: randomBytes(32).toString('hex'),
    userId,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  sessions.set(session.token, session);
  return session;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

export function destroyUserSessions(userId: string): void {
  for (const [token, s] of sessions) {
    if (s.userId === userId) sessions.delete(token);
  }
}

export function clearSessions(): void {
  sessions.clear();
}

export function activeSessionCount(): number {
  sweep();
  return sessions.size;
}

function userForToken(token: string | undefined): User | null {
  if (!token) return null;
  sweep();
  const session = sessions.get(token);
  if (!session) return null;
  const user = getDb().users.find((u) => u.id === session.userId);
  if (!user || !user.active) {
    sessions.delete(token);
    return null;
  }
  return user;
}

/* ------------------------------------------------------------------ *
 * Login / logout
 * ------------------------------------------------------------------ */

export interface LoginResult {
  token: string;
  user: User;
  permissions: Permission[];
}

export function login(email: string, password: string): LoginResult {
  const db = getDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

  // Always run a verification so a missing user and a wrong password cost the same.
  const cred = user ? db.credentials.find((c) => c.userId === user.id) : undefined;
  const salt = cred?.salt ?? 'stocksense-absent-user-padding';
  const expected = cred?.hash ?? hashPassword('irrelevant', salt).hash;
  const ok = verifyPassword(password, salt, expected);

  if (!user || !cred || !ok) {
    throw new HttpError(401, 'That email and password combination was not recognised.');
  }
  if (!user.active) {
    throw new HttpError(403, 'This account has been deactivated. Contact an administrator.');
  }

  const session = createSession(user.id);
  return { token: session.token, user, permissions: permissionsFor(user.role) };
}

/* ------------------------------------------------------------------ *
 * Express middleware
 * ------------------------------------------------------------------ */

function tokenFrom(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const alt = req.get('x-stocksense-token');
  return alt?.trim() || undefined;
}

/** Attaches `req.user` when a valid token is present, but never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const user = userForToken(tokenFrom(req));
  if (user) req.user = user;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const user = userForToken(tokenFrom(req));
  if (!user) {
    next(new HttpError(401, 'Please sign in to continue.'));
    return;
  }
  req.user = user;
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Resolve independently of `attachUser` so this guard is safe to mount alone.
    const user = req.user ?? userForToken(tokenFrom(req));
    if (!user) {
      next(new HttpError(401, 'Please sign in to continue.'));
      return;
    }
    req.user = user;
    if (!can(user, permission)) {
      next(
        new HttpError(
          403,
          `Your role (${user.role}) does not have permission to ${permission.replace('.', ' ')}.`,
        ),
      );
      return;
    }
    next();
  };
}

export function currentUser(req: Request): User {
  const user = req.user;
  if (!user) throw new HttpError(401, 'Please sign in to continue.');
  return user;
}

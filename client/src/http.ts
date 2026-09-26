const BASE = '/api';
const TOKEN_KEY = 'stocksense.token';

/** A business-level failure. The message is safe to show a user verbatim. */
export class ApiError extends Error {
  status: number;
  blockers: string[];
  constructor(status: number, message: string, blockers: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.blockers = blockers;
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the session simply will not persist */
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the StockSense service. Check that it is running, then retry.');
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }

  if (!res.ok) {
    const payload = body as { error?: string; blockers?: string[] };
    throw new ApiError(
      res.status,
      payload.error ?? `The request could not be completed (${res.status}).`,
      payload.blockers ?? [],
    );
  }
  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });

function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}

/** Location codes contain slashes, so every path segment is encoded. */
export const seg = (value: string) => encodeURIComponent(value);

export const http = { get, post, patch, qs, seg };

export { TOKEN_KEY };

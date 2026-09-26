import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Loads data with a real loading flag, an error surface and a retry. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await loader();
      if (alive.current) setData(out);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/** Client-side search / filter / sort / pagination over an in-memory list. */
export function useTable<T>(
  rows: T[],
  options: {
    search?: (row: T, term: string) => boolean;
    filters?: Record<string, (row: T) => boolean>;
    sorters?: Record<string, (row: T, dir: 'asc' | 'desc') => number>;
    pageSize?: number;
  } = {},
) {
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = options.pageSize ?? 12;

  const filtered = useMemo(() => {
    let list = rows;
    if (term.trim() && options.search) list = list.filter((r) => options.search!(r, term.trim()));
    for (const [key, value] of Object.entries(filters)) {
      if (!value || value === 'All') continue;
      const test = options.filters?.[key];
      if (test) list = list.filter((r) => test(r));
    }
    if (sort && options.sorters?.[sort.key]) {
      const test = options.sorters[sort.key];
      const dir = sort.dir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => test(a, b) * dir);
    }
    return list;
  }, [rows, term, filters, sort, options]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setTerm('');
    setPage(0);
  }, []);

  const toggleSort = useCallback((key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(0);
  }, []);

  const activeFilters = Object.entries(filters).filter(([, v]) => v && v !== 'All');

  return {
    term,
    setTerm: useCallback((v: string) => {
      setTerm(v);
      setPage(0);
    }, []),
    filters,
    setFilter,
    clearFilters,
    activeFilters,
    sort,
    toggleSort,
    page: safePage,
    pageCount,
    setPage,
    pageSize,
    rows: pageRows,
    allRows: filtered,
    total: filtered.length,
  };
}

/** Saved filter sets, kept in local storage per browser. */
export function useSavedFilters(key: string) {
  const storageKey = `stocksense.filters.${key}`;
  const [saved, setSaved] = useState<{ name: string; filters: Record<string, string>; term: string }[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setSaved(JSON.parse(raw) as typeof saved);
    } catch {
      /* storage unavailable — saved filters simply do not persist */
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: typeof saved) => {
      setSaved(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  return {
    saved,
    save: (name: string, filters: Record<string, string>, term: string) =>
      persist([...saved.filter((s) => s.name !== name), { name, filters, term }]),
    remove: (name: string) => persist(saved.filter((s) => s.name !== name)),
  };
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Debounced value, used by the search inputs. */
export function useDebounced<T>(value: T, delay = 200): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setOut(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return out;
}

/** A saved filter name dialog, kept here so FilterBar stays declarative. */
export function usePromptDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  return {
    open,
    name,
    setName,
    show: () => {
      setName('');
      setOpen(true);
    },
    hide: () => setOpen(false),
  };
}

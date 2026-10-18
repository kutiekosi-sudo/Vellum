import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '../backend/index.js';

// Live document or collection. Pass path = null to skip. Returns { data, loading, error }.
export function useLive(path, opts) {
  const key = path ? path + '|' + JSON.stringify(opts || {}) : '';
  const [state, setState] = useState({ data: undefined, loading: !!path, error: null });
  useEffect(() => {
    if (!path) { setState({ data: undefined, loading: false, error: null }); return undefined; }
    setState((s) => ({ ...s, loading: true, error: null }));
    const unsub = db.listen(path, (data) => setState({ data, loading: false, error: null }), (error) => setState({ data: undefined, loading: false, error }), opts);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

// One-off async load with a manual reload. fn must be stable per `deps`.
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: undefined, loading: true, error: null });
  const tick = useRef(0);
  const run = useCallback(async () => {
    const my = ++tick.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (my === tick.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (my === tick.current) setState({ data: undefined, loading: false, error });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

// Per-device convenience storage (never for anything that must be shared or reliable).
export function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function lsSet(key, value) {
  try { if (value === undefined || value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
export function useLocalState(key, initial) {
  const [v, setV] = useState(() => lsGet(key, initial));
  const set = useCallback((next) => {
    setV((prev) => {
      const val = typeof next === 'function' ? next(prev) : next;
      lsSet(key, val);
      return val;
    });
  }, [key]);
  return [v, set];
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

export function useTitle(title) {
  useEffect(() => { document.title = title ? `${title} · Learnr` : 'Learnr'; }, [title]);
}

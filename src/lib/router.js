// A tiny hash router. Routes look like #/class/abc123/assignments?x=1
import { useEffect, useState, useCallback } from 'react';

function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path: '/' + parts.join('/'), parts, query };
}

export function navigate(to, { replace = false } = {}) {
  const hash = '#' + (to.startsWith('/') ? to : '/' + to);
  if (replace) window.history.replaceState(null, '', hash);
  else window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
export const back = () => window.history.back();

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function useNavigate() {
  return useCallback((to, opts) => navigate(to, opts), []);
}

export function href(to) { return '#' + (to.startsWith('/') ? to : '/' + to); }

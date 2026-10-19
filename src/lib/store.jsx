// App-wide state: who is signed in, their role, toasts, connectivity.
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { auth, db } from '../backend/index.js';
import { useOnline } from './hooks.js';
import { friendlyError } from './util.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

let toastId = 0;

export function AppProvider({ children }) {
  // status: boot | out | role | ready | error
  const [status, setStatus] = useState('boot');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const online = useOnline();
  const seq = useRef(0);

  const loadProfile = useCallback(async (u) => {
    const my = ++seq.current;
    setUser(u); setLoadError(null);
    try {
      const p = await db.get('users/' + u.uid);
      if (my !== seq.current) return;
      if (!p || !p.role) { setProfile(null); setStatus('role'); } else { setProfile(p); setStatus('ready'); }
    } catch (e) {
      if (my !== seq.current) return;
      console.error(e);
      setLoadError(e); setStatus('error');
    }
  }, []);

  useEffect(() => {
    const off = auth.onChange((u) => {
      if (!u) { seq.current++; setUser(null); setProfile(null); setToasts([]); setStatus('out'); return; }
      loadProfile(u);
    });
    return typeof off === 'function' ? off : undefined;
  }, [loadProfile]);

  const toast = useCallback((message, kind = 'ok') => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6500 : 3500);
  }, []);
  const fail = useCallback((e, fallback) => { console.error(e); toast(friendlyError(e, fallback), 'error'); }, [toast]);

  const chooseRole = useCallback(async (role) => {
    if (!user) return;
    const data = { role, displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '', createdAt: Date.now() };
    await db.set('users/' + user.uid, data);
    setProfile({ id: user.uid, ...data });
    setStatus('ready');
  }, [user]);

  const value = useMemo(() => ({
    status, user, profile, role: profile && profile.role, loadError, online,
    toast, fail, chooseRole,
    retry: () => user && loadProfile(user),
    signOut: () => auth.signOut(),
    toasts, dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
  }), [status, user, profile, loadError, online, toast, fail, chooseRole, loadProfile, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

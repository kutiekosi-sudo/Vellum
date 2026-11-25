// Keeps the study timer honest when the student is on another page (for example the pod). The Study page runs the
// timer itself while it is open; this finishes a focus block that ran out while it was not.
import { useEffect } from 'react';
import { useApp } from './store.jsx';
import { useNow } from './hooks.js';
import { db } from '../backend/index.js';
import { PHASES, beep, summarize, todaySessions } from './study.js';
import { guessSubject, SUBJECTS_PATH } from './subjects.js';
import { pushState } from './pods.js';

const KEY = 'learnr.timer.v1';
const SETTINGS_KEY = 'learnr.timer.settings';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* optional */ } };
const lengths = () => { try { return { focus: 25, short: 5, long: 15, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; } catch { return { focus: 25, short: 5, long: 15 }; } };

export default function TimerKeeper() {
  const { user, role, toast } = useApp();
  const now = useNow(2000);
  useEffect(() => {
    if (role !== 'student' || window.__studyPageOpen) return;
    const t = read();
    if (!t || t.status !== 'running' || now < t.endsAt) return;
    // Move the timer on first, so nothing can finish the same block twice.
    const cycles = t.phase === 'focus' ? (t.cycles || 0) + 1 : t.cycles || 0;
    write({ phase: t.phase === 'focus' ? (cycles % 4 === 0 ? 'long' : 'short') : 'focus', status: 'idle', cycles, mode: t.mode, classId: t.classId, topic: t.topic, subject: t.subject });
    (async () => {
      try {
        if (t.classId) db.del(`classes/${t.classId}/presence/${user.uid}`).catch(() => {});
        const memberships = await db.list(`users/${user.uid}/podMemberships`).catch(() => []);
        const ids = memberships.map((x) => x.podId);
        let today = 0;
        if (t.phase === 'focus') {
          const planned = (lengths()[t.phase] || PHASES.focus.defaultMin) * 60;
          const saved = await db.get(SUBJECTS_PATH(user.uid)).catch(() => null);
          await db.add(`users/${user.uid}/studySessions`, {
            startedAt: t.startedAt, durationSec: planned, completed: true, mode: t.mode || 'solo',
            classId: t.mode === 'class' ? (t.classId || null) : null, className: t.mode === 'class' ? (t.className || '') : '',
            topic: (t.topic || '').slice(0, 80), createdAt: Date.now(),
            subject: guessSubject({ subject: t.subject, mode: t.mode, className: t.className, topic: t.topic }, (saved && saved.list) || []),
          });
          const all = await db.list(`users/${user.uid}/studySessions`, todaySessions()).catch(() => []);
          today = summarize(all).today;
        }
        if (ids.length) await pushState(user, ids, { state: t.phase === 'focus' ? 'break' : 'idle', stateSince: Date.now(), stateEndsAt: 0, todayMin: today, todayDay: new Date().toDateString() });
        beep();
        toast(t.phase === 'focus' ? 'Focus block done. Take a break.' : 'Break over. Ready when you are.');
      } catch { /* the block is still recorded locally; nothing more to do */ }
    })();
  });
  return null;
}

// Timer controls for places other than the Study page (the pod). They work on the same saved timer.
export function useTimerControls() {
  const { user, toast, fail } = useApp();
  const now = useNow(500);
  const t = read();
  const podIds = async () => (await db.list(`users/${user.uid}/podMemberships`).catch(() => [])).map((x) => x.podId);
  const total = t ? (lengths()[t.phase] || PHASES[t.phase].defaultMin) * 60000 : 0;
  const leftMs = !t ? 0 : t.status === 'running' ? Math.max(0, t.endsAt - now) : t.status === 'paused' ? t.remainingMs : total;
  const todayMin = async () => summarize(await db.list(`users/${user.uid}/studySessions`, todaySessions()).catch(() => [])).today;
  const pause = async () => {
    const c = read(); if (!c || c.status !== 'running') return;
    write({ ...c, status: 'paused', remainingMs: Math.max(0, c.endsAt - Date.now()) });
    if (c.classId) db.del(`classes/${c.classId}/presence/${user.uid}`).catch(() => {});
    const elapsed = Math.round(((lengths()[c.phase] || 25) * 60000 - Math.max(0, c.endsAt - Date.now())) / 60000);
    pushState(user, await podIds(), { state: 'break', stateSince: Date.now(), stateEndsAt: 0, todayMin: (await todayMin()) + (c.phase === 'focus' ? elapsed : 0), todayDay: new Date().toDateString() });
  };
  const resume = async () => {
    const c = read(); if (!c || c.status !== 'paused') return;
    const n = Date.now(); const next = { ...c, status: 'running', endsAt: n + c.remainingMs };
    write(next);
    pushState(user, await podIds(), { state: c.phase === 'focus' ? 'studying' : 'break', stateSince: n, stateEndsAt: next.endsAt, todayMin: await todayMin(), todayDay: new Date().toDateString() });
  };
  const stop = async () => {
    const c = read(); if (!c || c.status === 'idle') return;
    const left = c.status === 'running' ? Math.max(0, c.endsAt - Date.now()) : c.remainingMs;
    const full = (lengths()[c.phase] || PHASES[c.phase].defaultMin) * 60000;
    const elapsed = (full - left) / 1000;
    write({ phase: c.phase, status: 'idle', cycles: c.cycles || 0, mode: c.mode, classId: c.classId, topic: c.topic, subject: c.subject });
    if (c.classId) db.del(`classes/${c.classId}/presence/${user.uid}`).catch(() => {});
    try {
      if (c.phase === 'focus' && elapsed >= 60) {
        const saved = await db.get(SUBJECTS_PATH(user.uid)).catch(() => null);
        await db.add(`users/${user.uid}/studySessions`, {
          startedAt: c.startedAt, durationSec: Math.round(elapsed), completed: false, mode: c.mode || 'solo',
          classId: c.mode === 'class' ? (c.classId || null) : null, className: c.mode === 'class' ? (c.className || '') : '',
          topic: (c.topic || '').slice(0, 80), createdAt: Date.now(),
          subject: guessSubject({ subject: c.subject, mode: c.mode, className: c.className, topic: c.topic }, (saved && saved.list) || []),
        });
        toast(`Saved ${Math.round(elapsed / 60)} minutes of study.`);
      }
      pushState(user, await podIds(), { state: 'idle', stateSince: Date.now(), stateEndsAt: 0, todayMin: await todayMin(), todayDay: new Date().toDateString() });
    } catch (e) { fail(e); }
  };
  return { timer: t && t.status !== 'idle' ? t : null, leftSec: Math.ceil(leftMs / 1000), pause, resume, stop };
}

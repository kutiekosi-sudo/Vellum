// Keeps the study timer honest when the student is on another page (for example the pod). The Study page runs the
// timer itself while it is open; this finishes a focus block that ran out while it was not.
import { useEffect } from 'react';
import { useApp } from './store.jsx';
import { useNow } from './hooks.js';
import { db } from '../backend/index.js';
import { PHASES, beep, summarize } from './study.js';
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
          const all = await db.list(`users/${user.uid}/studySessions`).catch(() => []);
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

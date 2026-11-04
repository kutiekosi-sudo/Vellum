// Study-time helpers shared by the Study page (and later Home, rankings and the monthly top studier).
import { dayKey, startOfDay, DAY } from './util.js';

export const PHASES = {
  focus: { label: 'Focus', defaultMin: 25 },
  short: { label: 'Short break', defaultMin: 5 },
  long: { label: 'Long break', defaultMin: 15 },
};

// Most screens only need the recent past (today, this week, the streak), so they read only the last RECENT_DAYS days
// instead of every session ever saved. The Statistics page reads everything, because statistics are kept forever.
export const RECENT_DAYS = 120;
export const recentSessions = () => ({ where: [['startedAt', '>=', startOfDay() - RECENT_DAYS * DAY]] });
export const todaySessions = () => ({ where: [['startedAt', '>=', startOfDay()]] });

export const minutesOf = (s) => Math.round((Number(s.durationSec) || 0) / 60);

export function summarize(sessions, now = Date.now()) {
  const byDay = new Map();
  for (const s of sessions) {
    const k = dayKey(s.startedAt || 0);
    byDay.set(k, (byDay.get(k) || 0) + (Number(s.durationSec) || 0));
  }
  const today = Math.round((byDay.get(dayKey(now)) || 0) / 60);
  // Streak: consecutive days with any study, counting today only if there is some (yesterday keeps it alive).
  let streak = 0;
  let d = startOfDay(now);
  if (!byDay.get(dayKey(d))) d -= DAY;
  while (byDay.get(dayKey(d))) { streak += 1; d -= DAY; }
  const week = Array.from({ length: 7 }, (_, i) => {
    const t = startOfDay(now) - (6 - i) * DAY;
    return { t, label: new Date(t).toLocaleDateString(undefined, { weekday: 'short' }), min: Math.round((byDay.get(dayKey(t)) || 0) / 60) };
  });
  return { today, streak, week, weekTotal: week.reduce((n, x) => n + x.min, 0) };
}

// A tiny beep that needs no audio file. Browsers only allow it after the person has tapped something.
export function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 660; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    o.stop(ctx.currentTime + 0.85);
    setTimeout(() => ctx.close().catch(() => {}), 1200);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch { /* sound is optional */ }
}

// Scheme of work: the teacher lists topics (with how many periods each needs) and their weekly timetable and term
// dates. Learnr works out where they should be today, what can realistically be covered before the term ends, and warns
// when they are behind. Nothing here is guessed by AI: it is arithmetic on what the teacher entered.
import { DAY, startOfDay } from './util.js';

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const SIZES = [
  { id: 'small', label: 'Small class', eff: 1, note: 'Full period time' },
  { id: 'medium', label: 'Medium class', eff: 0.9, note: 'About 10% lost to settling and questions' },
  { id: 'large', label: 'Large class', eff: 0.8, note: 'About 20% lost to noise and movement' },
];
export const effOf = (id) => (SIZES.find((s) => s.id === id) || SIZES[0]).eff;
export const newTopic = (title, periods = 1) => ({ id: Math.random().toString(36).slice(2, 9), title: String(title).trim().slice(0, 80), periods: Math.max(0.5, Math.min(40, Number(periods) || 1)), done: false });

// Every teaching slot between two days, in order. holidays is a list of day-start timestamps with no lessons.
export function slots(timetable, from, to, holidays = []) {
  const off = new Set(holidays);
  const out = [];
  for (let t = startOfDay(from); t <= to; t += DAY) {
    if (off.has(t)) continue;
    const dow = new Date(t).getDay();
    for (const p of timetable) if (p.day === dow) out.push({ date: t, periods: (Number(p.minutes) || 0) / (Number(p.periodMinutes) || 40) });
  }
  return out;
}

// Lay topics end to end over the slots. Each topic needs periods / efficiency of capacity.
function lay(topics, slotList, eff) {
  const out = []; let i = 0; let left = slotList.length ? slotList[0].periods : 0;
  for (const tp of topics) {
    let need = tp.periods / eff; const start = slotList[i] ? slotList[i].date : null; let end = null; let fits = true;
    while (need > 1e-9) {
      if (i >= slotList.length) { fits = false; break; }
      const take = Math.min(left, need); need -= take; left -= take; end = slotList[i].date;
      if (left <= 1e-9) { i += 1; left = slotList[i] ? slotList[i].periods : 0; }
    }
    out.push({ topic: tp, start, end: fits ? end : null, fits });
  }
  return out;
}

export function analyse(scheme, now = Date.now()) {
  const today = startOfDay(now);
  const eff = effOf(scheme.size);
  const tt = (scheme.timetable || []).map((p) => ({ ...p, periodMinutes: scheme.periodMinutes || 40 }));
  const topics = scheme.topics || [];
  const holidays = scheme.holidays || [];
  if (!tt.length || !scheme.termEnd || !scheme.termStart) return { ready: false, missing: !tt.length ? 'timetable' : 'dates' };
  // Where the teacher should be by now: all topics laid out from the start of term.
  const all = lay(topics, slots(tt, scheme.termStart, scheme.termEnd, holidays), eff);
  const shouldBeDone = all.filter((x) => x.fits && x.end !== null && x.end < today);
  const behind = shouldBeDone.filter((x) => !x.topic.done);
  // What is realistically possible from today on, for the topics not yet taught.
  const remaining = topics.filter((t) => !t.done);
  const left = slots(tt, today, scheme.termEnd, holidays);
  const plan = lay(remaining, left, eff);
  const capacity = left.reduce((n, s) => n + s.periods, 0);
  const need = remaining.reduce((n, t) => n + t.periods / eff, 0);
  return {
    ready: true, today, eff, capacity, need, shortfall: Math.max(0, need - capacity), spare: Math.max(0, capacity - need),
    plan, coverable: plan.filter((x) => x.fits), atRisk: plan.filter((x) => !x.fits), behind, doneCount: topics.filter((t) => t.done).length, total: topics.length,
    lessonsLeft: left.length,
  };
}

export const schemePath = (uid, classId) => `users/${uid}/scheme/${classId}`;

// Mark a topic taught (or not) in the scheme and in any calendar lessons made from it, so the two never disagree.
export async function syncTopic(db, uid, classId, topicId, done) {
  const doc = await db.get(schemePath(uid, classId)).catch(() => null);
  if (doc && Array.isArray(doc.topics)) {
    await db.update(schemePath(uid, classId), { topics: doc.topics.map((t) => (t.id === topicId ? { ...t, done, doneAt: done ? Date.now() : 0 } : t)), updatedAt: Date.now() });
  }
  const events = await db.list(`users/${uid}/calendar`).catch(() => []);
  await Promise.all(events.filter((e) => e.topicId === topicId && e.schemeClass === classId && !!e.done !== done).map((e) => db.update(`users/${uid}/calendar/${e.id}`, { done, doneAt: done ? Date.now() : 0 })));
}

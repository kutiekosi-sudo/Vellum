// Lesson-time planner: arithmetic only, so it works offline. A lesson is split into short chunks because students
// hold attention for roughly 10 to 20 minutes at a time, then a practice break, then the next chunk.
export const SPANS = [{ v: 10, l: '10 minutes (younger or tired class)' }, { v: 12, l: '12 minutes (usual)' }, { v: 15, l: '15 minutes (older, focused class)' }, { v: 20, l: '20 minutes (senior, very focused)' }];
export const SETTLE = { small: 3, medium: 5, large: 8 };
export const conceptsPath = (uid) => `users/${uid}/concepts`;

export function planLesson({ minutes, size = 'medium', span = 12 }) {
  const total = Math.round(Number(minutes) || 0);
  if (total < 15) return { ok: false, reason: 'A lesson needs at least 15 minutes to plan.' };
  const settle = Math.min(SETTLE[size] || 5, Math.round(total * 0.15));
  const wrap = total >= 30 ? 5 : 3;
  const starter = total >= 25 ? 5 : 3;
  const room = total - settle - wrap - starter;
  const n = Math.max(1, Math.round(room / (span * 1.5)));
  const each = room / n;
  const blocks = [{ kind: 'settle', title: 'Settle the class', mins: settle }, { kind: 'starter', title: 'Starter: recall last lesson', mins: starter }];
  let used = 0;
  for (let i = 0; i < n; i += 1) {
    const last = i === n - 1;
    const share = last ? room - used : Math.round(each);
    const teach = Math.min(Math.max(3, Math.round(share * 0.6)), share - 2 > 0 ? share - 2 : share);
    blocks.push({ kind: 'teach', title: `Teach, part ${i + 1}`, mins: teach });
    if (share - teach > 0) blocks.push({ kind: 'practice', title: i === n - 1 ? 'Practice and check understanding' : 'Practice what you just taught', mins: share - teach });
    used += share;
  }
  blocks.push({ kind: 'wrap', title: 'Recap and exit question', mins: wrap });
  let at = 0;
  const out = blocks.map((b) => { const r = { ...b, from: at }; at += b.mins; return r; });
  return { ok: true, total, blocks: out, longest: Math.max(...out.filter((b) => b.kind === 'teach').map((b) => b.mins)) };
}

// Hand the chosen concept cards out across the teaching chunks, in order.
export function giveCards(blocks, cards) {
  const teach = blocks.filter((b) => b.kind === 'teach');
  const m = new Map(); if (!teach.length) return m;
  cards.forEach((c, i) => { const t = teach[Math.min(teach.length - 1, Math.floor((i * teach.length) / cards.length))]; m.set(t, [...(m.get(t) || []), c]); });
  return m;
}

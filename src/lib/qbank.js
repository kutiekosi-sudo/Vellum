// A teacher's question bank: questions saved once, tagged by subject, topic and difficulty, and reused in any test.
import { db } from '../backend/index.js';

export const bankPath = (uid) => `users/${uid}/questionBank`;
export const LEVELS = [{ v: 'easy', l: 'Easy' }, { v: 'medium', l: 'Medium' }, { v: 'hard', l: 'Hard' }];
const key = (q) => `${q.kind}:${String(q.text || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;

// A question as the CBT editor holds it -> a bank record.
export function toBank(q, kind, meta = {}) {
  const base = { kind, text: String(q.text || '').trim().slice(0, 1500), topic: String(q.topic || meta.topic || '').trim().slice(0, 60), subject: String(meta.subject || '').trim().slice(0, 40), difficulty: meta.difficulty || q.difficulty || 'medium' };
  if (kind === 'mcq') return { ...base, options: (q.options || []).map((o) => String(o).slice(0, 300)), correct: Number(q.correct), points: Number(q.points) || 1, explanation: String(q.explanation || '').slice(0, 1000) };
  return { ...base, marks: Number(q.marks) || 5, guide: String(q.guide || '').slice(0, 3000) };
}

// A bank record -> the shape the CBT editor adds.
export function fromBank(b) {
  if (b.kind === 'mcq') return { text: b.text, options: [...(b.options || [])], correct: b.correct, points: b.points || 1, explanation: b.explanation || '', topic: b.topic || '', skill: '' };
  return { text: b.text, marks: b.marks || 5, guide: b.guide || '', topic: b.topic || '' };
}

export function validBank(b) {
  if (!String(b.text || '').trim()) return 'Write the question.';
  if (b.kind === 'mcq') {
    if ((b.options || []).filter((o) => String(o).trim()).length < 2) return 'Give at least two answer options.';
    if (!(b.correct >= 0) || !String((b.options || [])[b.correct] || '').trim()) return 'Choose the correct answer.';
  }
  return '';
}

// Save several questions, skipping ones already in the bank. Returns how many were new.
export async function saveToBank(uid, existing, items) {
  const have = new Set((existing || []).map(key));
  const fresh = [];
  for (const b of items) { if (validBank(b)) continue; const k = key(b); if (have.has(k)) continue; have.add(k); fresh.push(b); }
  for (let i = 0; i < fresh.length; i += 200) await db.batch(fresh.slice(i, i + 200).map((b) => ({ op: 'set', path: `${bankPath(uid)}/${db.newId()}`, data: { ...b, createdAt: Date.now() } })));
  return fresh.length;
}

export function filterBank(list, f) {
  const t = String(f.q || '').toLowerCase().trim();
  return list.filter((b) => (!f.subject || b.subject === f.subject) && (!f.kind || b.kind === f.kind) && (!f.difficulty || b.difficulty === f.difficulty)
    && (!t || String(b.text).toLowerCase().includes(t) || String(b.topic || '').toLowerCase().includes(t)));
}

// ---------- automatic test builder ----------
// Each rule asks for `count` questions that match a topic, level and type ('' means any). Rules are filled in order and
// never pick the same question twice. `skip` holds ids to leave out (for example questions already in the test).
export const newRule = () => ({ id: Math.random().toString(36).slice(2, 8), topic: '', difficulty: '', kind: 'mcq', count: 5 });

export function shuffled(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function autoPick(bank, rules, { skip = [], subject = '', rng = Math.random } = {}) {
  const used = new Set(skip);
  const picked = []; const report = [];
  for (const r of rules) {
    const want = Math.max(0, Math.min(100, Math.round(Number(r.count) || 0)));
    const pool = bank.filter((b) => !used.has(b.id) && (!subject || b.subject === subject) && (!r.topic || b.topic === r.topic) && (!r.difficulty || b.difficulty === r.difficulty) && (!r.kind || b.kind === r.kind));
    const take = shuffled(pool, rng).slice(0, want);
    take.forEach((b) => { used.add(b.id); picked.push(b); });
    report.push({ rule: r, want, got: take.length, available: pool.length });
  }
  return { picked, report, short: report.filter((x) => x.got < x.want) };
}

export const ruleText = (r) => [r.kind === 'theory' ? 'written' : r.kind === 'mcq' ? 'multiple-choice' : 'any type', r.difficulty || 'any level', r.topic ? `on ${r.topic}` : 'on any topic'].join(', ');

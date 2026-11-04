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

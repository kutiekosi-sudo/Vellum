// A student's own list of subjects. Private, works with or without a class.
import { db } from '../backend/index.js';

export const SUBJECTS_PATH = (uid) => `users/${uid}/goals/subjects`;
export const cleanName = (n) => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 40);

export async function saveSubjects(uid, list) {
  const seen = new Set(); const out = [];
  for (const raw of list) { const n = cleanName(raw); const k = n.toLowerCase(); if (n && !seen.has(k)) { seen.add(k); out.push(n); } }
  await db.set(SUBJECTS_PATH(uid), { list: out.slice(0, 40), updatedAt: Date.now() });
  return out;
}

// When the student does not pick a subject, Learnr fills it in when it can: the class they studied for,
// or a saved subject whose name appears in the topic they typed.
export function guessSubject({ subject, mode, className, topic }, saved) {
  if (subject) return subject;
  if (mode === 'class' && className) return className;
  const t = String(topic || '').toLowerCase();
  if (t) { const hit = (saved || []).find((s) => t.includes(s.toLowerCase())); if (hit) return hit; }
  return '';
}

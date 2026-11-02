// Sharing a flashcard deck or practice set with a friend. Sharing makes a snapshot copy under a long random code.
// Whoever has the code can read that one copy and add it to their own account. Nobody can list or search shares.
import { db } from '../backend/index.js';
import { shortName } from './util.js';
import { AppError } from './errors.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const makeShareCode = () => { const b = new Uint8Array(10); crypto.getRandomValues(b); return [...b].map((x) => ALPHABET[x % ALPHABET.length]).join(''); };
export const cleanShareCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const showCode = (c) => `${c.slice(0, 5)}-${c.slice(5)}`;

const KINDS = {
  flashcards: { coll: 'flashcards', body: (i) => ({ cards: i.cards, color: i.color || '' }), count: (i) => (i.cards || []).length },
  practice: { coll: 'practice', body: (i) => ({ questions: i.questions, subject: i.subject || '', level: i.level || '' }), count: (i) => (i.questions || []).length },
};

// Share (or refresh the shared copy of) a deck or set. Returns its code.
export async function shareItem(user, profile, kind, item) {
  const k = KINDS[kind];
  let code = item.shareCode;
  if (!code) { for (let i = 0; i < 5 && !code; i += 1) { const c = makeShareCode(); if (!(await db.get('shares/' + c))) code = c; } }
  if (!code) throw new AppError('We could not make a share code. Please try again.', 'code_taken');
  await db.set('shares/' + code, { kind, title: item.title, ownerUid: user.uid, ownerName: shortName(profile.displayName), ...k.body(item), updatedAt: Date.now() });
  await db.update(`users/${user.uid}/${k.coll}/${item.id}`, { shareCode: code });
  return code;
}

export async function stopSharing(user, kind, item) {
  if (!item.shareCode) return;
  await db.del('shares/' + item.shareCode);
  await db.update(`users/${user.uid}/${KINDS[kind].coll}/${item.id}`, { shareCode: '' });
}

export async function findShare(kind, raw) {
  const code = cleanShareCode(raw);
  const s = code.length === 10 ? await db.get('shares/' + code).catch(() => null) : null;
  if (!s || s.kind !== kind) throw new AppError('We could not find anything shared with that code. Check it and try again.', 'share_not_found');
  return { code, ...s, count: KINDS[kind].count(s) };
}

// Add a copy to the student's own account. It is theirs to edit; it is not linked back to the sharer.
export async function addShared(user, kind, s) {
  const base = { title: s.title, source: 'shared', sharedBy: s.ownerName || '', createdAt: Date.now() };
  const body = kind === 'flashcards' ? { cards: s.cards, color: s.color || '' } : { questions: s.questions, subject: s.subject || '', level: s.level || '', history: [] };
  return db.add(`users/${user.uid}/${KINDS[kind].coll}`, { ...base, ...body });
}

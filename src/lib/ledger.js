// The reasoning trail: a short record of why Learnr suggested what it did, so a student can see the "why".
import { db } from '../backend/index.js';

export async function logDecision(uid, entry) {
  try {
    const cur = (await db.get(`users/${uid}/goals/ledger`)) || {};
    const entries = [...(cur.entries || []), { at: Date.now(), type: entry.type, title: String(entry.title).slice(0, 120), reasoning: String(entry.reasoning || '').slice(0, 500) }].slice(-100);
    await db.set(`users/${uid}/goals/ledger`, { ...cur, entries, ...(entry.next ? { lastNext: entry.next } : {}) });
  } catch { /* the trail is a bonus; never block the main action */ }
}

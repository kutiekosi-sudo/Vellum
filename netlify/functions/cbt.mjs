// CBT engine. Questions, answer keys and attempts live in Netlify Blobs, never in Firestore, so a student's
// browser only ever receives the questions (without answers) for an attempt they are allowed to take.
//
// POST /.netlify/functions/cbt   { action, classId, cbtId, ... }   Authorization: Bearer <Firebase ID token>
//   Teacher: saveQuestions, getQuestions, classResults, resetAttempts
//   Student: start, progress, submit, myResults
//
// The logic lives in lib/cbtactions.mjs (shared with the offline test build). This file only supplies real storage.

import {
  handle, json, readJson, verifyIdToken, classAccess, requireTeacher, fsGet, store, HttpError, rateLimit,
} from './lib/common.mjs';
import { makeActions } from './lib/cbtactions.mjs';

const qStore = () => store('learnr-cbt');
const attemptPrefix = (classId, cbtId, uid) => `a/${classId}/${cbtId}/${uid ? uid + '/' : ''}`;
const attemptKey = (classId, cbtId, uid, id) => `${attemptPrefix(classId, cbtId, uid)}${id}`;

const io = {
  now: () => Date.now(),
  classAccess,
  requireTeacher,
  async getMeta(classId, cbtId, user) {
    const meta = await fsGet(`classes/${classId}/cbts/${cbtId}`, user.token);
    if (!meta) throw new HttpError(404, 'That CBT was not found.', 'not_found');
    return meta;
  },
  async getQuestions(classId, cbtId) {
    const doc = await qStore().get(`q/${classId}/${cbtId}`, { type: 'json' });
    return doc && Array.isArray(doc.questions) ? doc : null;
  },
  putQuestions: (classId, cbtId, doc) => qStore().setJSON(`q/${classId}/${cbtId}`, doc),
  async listAttempts(classId, cbtId, uid) {
    const s = qStore();
    const { blobs } = await s.list({ prefix: attemptPrefix(classId, cbtId, uid) });
    const all = await Promise.all((blobs || []).map((b) => s.get(b.key, { type: 'json' })));
    return all.filter(Boolean);
  },
  getAttempt: (classId, cbtId, uid, id) => qStore().get(attemptKey(classId, cbtId, uid, id), { type: 'json' }),
  putAttempt: (a) => qStore().setJSON(attemptKey(a.classId, a.cbtId, a.uid, a.id), a),
  async deleteAttempts(classId, cbtId, uid) {
    const s = qStore();
    const { blobs } = await s.list({ prefix: attemptPrefix(classId, cbtId, uid) });
    await Promise.all((blobs || []).map((b) => s.delete(b.key)));
    return (blobs || []).length;
  },
  limitStart: (user) => rateLimit(user, 'cbt-start', () => [['hour', 30, new Date().toISOString().slice(0, 13)]]),
};

const actions = makeActions(io);

export default handle(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed', 'method');
  const user = await verifyIdToken(req);
  const body = await readJson(req, 1.5 * 1024 * 1024);
  const fn = actions[body.action];
  if (!fn) throw new HttpError(400, 'Unknown action.', 'bad_action');
  return json(await fn(user, body));
});

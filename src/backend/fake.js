// Offline test backend. NOT shipped to people: `node build.mjs --test` swaps it in for real.js so the whole app can be
// exercised in a headless browser without Firebase. It imitates Firestore (including a "rules-lite" permission check that
// mirrors firestore.rules for the paths the app touches), Firebase Auth, and the Netlify functions. The CBT engine is the
// real code from netlify/functions/lib, not a copy.

import { AppError } from '../lib/errors.js';
import { HttpError, newId } from '../../netlify/functions/lib/shared.mjs';
import { makeActions } from '../../netlify/functions/lib/cbtactions.mjs';

const TS = { __ts: true };
const DEL = { __del: true };
const mem = new Map(); // path -> data
const listeners = new Set();
const authCbs = new Set();
let currentUser = null;

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
const isDocPath = (p) => p.split('/').length % 2 === 0;

function resolve(v) {
  if (v && v.__ts) return Date.now();
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = resolve(v[k]); return o; }
  return v;
}

// ---------- rules-lite (mirrors firestore.rules for what the app does) ----------
const U = () => currentUser && currentUser.uid;
const roleOf = (uid) => (mem.get('users/' + uid) || {}).role;
const cls = (c) => mem.get('classes/' + c);
const member = (c, u) => mem.get(`classes/${c}/members/${u}`);
const isTeacherOf = (c) => !!cls(c) && cls(c).teacherId === U();
const isActive = (c) => !!member(c, U()) && member(c, U()).status === 'active';
const podMember = (p, u) => mem.get(`pods/${p}/members/${u}`);
const hasWhere = (opts, f, v) => ((opts && opts.where) || []).some(([ff, o, vv]) => ff === f && o === '==' && vv === v);

function checkRead(kind, path, opts, data) {
  if (!U()) throw denied();
  const s = path.split('/');
  if (s[0] === 'users') { if (s[1] !== U()) throw denied(); return; }
  if (s[0] === 'classCodes' || s[0] === 'podCodes') { if (kind === 'list') throw denied(); return; }
  if (s[0] === 'classes') {
    const c = s[1];
    if (s.length <= 2) {
      if (kind === 'list') { if (!hasWhere(opts, 'teacherId', U())) throw denied(); return; }
      if (!(isTeacherOf(c) || isActive(c))) throw denied();
      return;
    }
    const sub = s[2];
    if (sub === 'members') {
      if (kind === 'list') { if (!isTeacherOf(c)) throw denied(); } else if (!(s[3] === U() || isTeacherOf(c))) throw denied();
      return;
    }
    if (sub === 'announcements') { if (!(isTeacherOf(c) || isActive(c))) throw denied(); return; }
    const published = () => {
      if (isTeacherOf(c)) return;
      if (!isActive(c)) throw denied();
      if (kind === 'list') { if (!hasWhere(opts, 'published', true)) throw denied(); } else if (data && data.published !== true) throw denied();
    };
    if (['resources', 'assignments', 'cbts'].includes(sub) && s.length <= 4) { published(); return; }
    if (sub === 'cbts' && s[4] === 'theory') { published(); return; }
    if (sub === 'assignments' && s[4] === 'submissions') {
      if (isTeacherOf(c)) return;
      if (kind === 'list' || s[5] !== U() || !isActive(c)) throw denied();
      return;
    }
    throw denied();
  }
  if (s[0] === 'pods') {
    const p = s[1];
    const pod = mem.get('pods/' + p);
    if (s.length <= 2) {
      if (kind === 'list') throw denied();
      if (!pod || !(pod.ownerUid === U() || podMember(p, U()))) throw denied();
      return;
    }
    if (s[2] === 'members') { if (!(podMember(p, U()) || (pod && pod.ownerUid === U()))) throw denied(); return; }
  }
  throw denied();
}

function checkWrite(op, path, data, existing) {
  if (!U()) throw denied();
  const s = path.split('/');
  const keys = (d) => Object.keys(d || {});
  const changed = (a, b) => keys({ ...a, ...b }).filter((k) => JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]));
  if (s[0] === 'users') {
    if (s[1] !== U()) throw denied();
    if (s.length === 2) {
      const allowed = ['role', 'displayName', 'email', 'photoURL', 'createdAt', 'schoolId', 'settings', 'lastSeen'];
      if (op === 'delete') throw denied();
      if (op === 'create') { if (!['student', 'teacher'].includes(data.role) || keys(data).some((k) => !allowed.includes(k))) throw denied(); return; }
      if (data.role !== existing.role || keys(data).some((k) => !allowed.includes(k))) throw denied();
      return;
    }
    if (s[2] === 'notifications') return;
    if (!['memberships', 'studySessions', 'goals', 'flashcards', 'practice', 'aiChats', 'podMemberships'].includes(s[2])) throw denied();
    return;
  }
  if (s[0] === 'classes' && s.length === 2) {
    if (op === 'create') { if (roleOf(U()) !== 'teacher' || data.teacherId !== U()) throw denied(); return; }
    if (op === 'delete' || existing.teacherId !== U() || data.teacherId !== existing.teacherId) throw denied();
    return;
  }
  if (s[0] === 'classCodes') {
    if (op === 'create') { if (roleOf(U()) !== 'teacher' || data.teacherId !== U() || !cls(data.classId) || cls(data.classId).teacherId !== U()) throw denied(); return; }
    if (op === 'delete' || existing.teacherId !== U() || data.classId !== existing.classId) throw denied();
    return;
  }
  if (s[0] === 'classes') {
    const c = s[1];
    const sub = s[2];
    if (sub === 'members') {
      const m = s[3];
      if (op === 'create') {
        const code = mem.get('classCodes/' + data.code);
        const want = (cls(c) || {}).joinMode === 'approval' ? 'pending' : 'active';
        if (!(m === U() && roleOf(U()) === 'student' && data.uid === U() && code && code.classId === c && code.active === true && data.status === want)) throw denied();
        return;
      }
      if (isTeacherOf(c)) return;
      if (m === U() && op === 'delete') return;
      if (m === U() && op === 'update' && changed(existing, data).every((k) => ['displayName', 'photoURL', 'activity'].includes(k))) return;
      throw denied();
    }
    if (['announcements', 'resources', 'assignments', 'cbts'].includes(sub) && s.length <= 4) { if (!isTeacherOf(c)) throw denied(); return; }
    if (sub === 'cbts' && s[4] === 'theory') { if (!isTeacherOf(c)) throw denied(); return; }
    if (sub === 'assignments' && s[4] === 'submissions') {
      const a = mem.get(`classes/${c}/assignments/${s[3]}`) || {};
      if (op === 'create') {
        if (!(isActive(c) && s[5] === U() && data.uid === U() && data.submittedAt && data.submittedAt.__ts && a.published === true && !('grade' in data) && !('feedback' in data))) throw denied();
        return;
      }
      if (op === 'delete') throw denied();
      const diff = changed(existing, data);
      if (isTeacherOf(c) && diff.every((k) => ['grade', 'feedback', 'gradedAt', 'gradedBy', 'status', 'rubricScores', 'viewedAt'].includes(k))) return;
      if (isActive(c) && s[5] === U() && (a.allowResubmit === true || existing.status === 'returned')
        && data.submittedAt && data.submittedAt.__ts
        && diff.every((k) => ['text', 'links', 'files', 'submittedAt', 'attempt', 'status'].includes(k))) return;
      throw denied();
    }
    throw denied();
  }
  if (s[0] === 'podCodes') { if (op === 'create' && data.ownerUid === U()) return; if (op === 'update' && existing.ownerUid === U()) return; throw denied(); }
  if (s[0] === 'pods' && s.length === 2) {
    if (op === 'create' && data.ownerUid === U()) return;
    if (existing && existing.ownerUid === U()) return;
    throw denied();
  }
  if (s[0] === 'pods' && s[2] === 'members') {
    const p = s[1];
    const pod = mem.get('pods/' + p) || {};
    const m = s[3];
    if (op === 'create') {
      const code = mem.get('podCodes/' + data.code);
      if (m === U() && (pod.ownerUid === U() || (code && code.podId === p && code.active === true))) return;
      throw denied();
    }
    if (m === U() || pod.ownerUid === U()) return;
    throw denied();
  }
  throw denied();
}

// ---------- queries ----------
function matchWhere(d, [f, o, v]) {
  const x = d[f];
  switch (o) {
    case '==': return x === v;
    case '!=': return x !== v;
    case '<': return x < v;
    case '<=': return x <= v;
    case '>': return x > v;
    case '>=': return x >= v;
    case 'in': return v.includes(x);
    case 'array-contains': return Array.isArray(x) && x.includes(v);
    default: return false;
  }
}
function listDocs(collPath, opts) {
  const depth = collPath.split('/').length + 1;
  const out = [];
  for (const [p, d] of mem) {
    if (p.startsWith(collPath + '/') && p.split('/').length === depth) {
      if (((opts && opts.where) || []).every((w) => matchWhere(d, w))) out.push({ id: p.split('/').pop(), ...clone(d) });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
const getDoc = (p) => (mem.has(p) ? { id: p.split('/').pop(), ...clone(mem.get(p)) } : null);

function notifyAll() {
  for (const l of [...listeners]) {
    let val;
    try { val = l.isDoc ? getDoc(l.path) : listDocs(l.path, l.opts); checkRead(l.isDoc ? 'get' : 'list', l.path, l.opts, l.isDoc ? val : null); } catch (e) {
      if (!l.errored) { l.errored = true; setTimeout(() => l.err && l.err(e), 0); }
      continue;
    }
    l.errored = false;
    const sig = JSON.stringify(val);
    if (sig !== l.last) { l.last = sig; setTimeout(() => l.active && l.cb(clone(val)), 0); }
  }
}

function applyWrite(op, path, data, optsMerge) {
  const existing = mem.get(path);
  if (op === 'delete') { checkWrite('delete', path, null, existing); mem.delete(path); return; }
  if (op === 'update' && !existing) throw Object.assign(new Error('No document to update'), { code: 'not-found' });
  let raw;
  if (op === 'update' || optsMerge) {
    raw = { ...(existing || {}) };
    for (const [k, v] of Object.entries(data)) { if (v && v.__del) delete raw[k]; else raw[k] = v; }
  } else raw = data;
  // For updates, `raw` is the resulting document (like request.resource.data in the real rules).
  checkWrite(existing ? 'update' : 'create', path, raw, existing);
  mem.set(path, clone(resolve(raw)));
}

// ---------- exported database ----------
export const db = {
  async get(path) { await tick(); const d = getDoc(path); checkRead('get', path, null, d); return d; },
  async set(path, data, opts) { await tick(); applyWrite('set', path, data, opts && opts.merge); notifyAll(); },
  async update(path, data) { await tick(); applyWrite('update', path, data); notifyAll(); },
  async del(path) { await tick(); applyWrite('delete', path); notifyAll(); },
  async add(collPath, data) { await tick(); const id = newId(10); applyWrite('set', `${collPath}/${id}`, data); notifyAll(); return id; },
  async list(collPath, opts) { await tick(); checkRead('list', collPath, opts); return listDocs(collPath, opts); },
  listen(path, cb, err, opts) {
    const l = { path, opts, isDoc: isDocPath(path), cb, err, last: undefined, active: true };
    listeners.add(l);
    setTimeout(() => {
      if (!l.active) return;
      try {
        const val = l.isDoc ? getDoc(path) : listDocs(path, opts);
        checkRead(l.isDoc ? 'get' : 'list', path, opts, l.isDoc ? val : null);
        l.last = JSON.stringify(val);
        cb(clone(val));
      } catch (e) { l.errored = true; if (err) err(e); }
    }, 0);
    return () => { l.active = false; listeners.delete(l); };
  },
  async batch(ops) {
    await tick();
    for (const o of ops) applyWrite(o.op, o.path, o.data, o.merge);
    notifyAll();
  },
  serverTs: () => TS,
  removeField: () => DEL,
  newId: () => newId(10),
};
const tick = () => new Promise((r) => setTimeout(r, window.__fake && window.__fake.latency || 0));

// ---------- auth ----------
export const auth = {
  onChange(cb) { authCbs.add(cb); setTimeout(() => cb(currentUser ? { ...currentUser } : null), 0); return () => authCbs.delete(cb); },
  async signIn() {
    await tick();
    const next = window.__fake.nextUser || { uid: 'u-demo', displayName: 'Demo Student', email: 'demo@example.com' };
    setUser(next);
  },
  async signOut() { setUser(null); },
  async token() { return currentUser ? 'fake-token-' + currentUser.uid : null; },
};
function setUser(u) {
  currentUser = u ? { uid: u.uid, displayName: u.displayName || '', email: u.email || '', photoURL: u.photoURL || '' } : null;
  for (const cb of [...authCbs]) cb(currentUser ? { ...currentUser } : null);
}

// ---------- functions ----------
const blobs = { q: new Map(), attempts: new Map(), files: new Map(), fileData: new Map() };

const cbtIo = {
  now: () => Date.now(),
  async classAccess(classId, user) {
    const c = mem.get('classes/' + classId);
    if (!c) throw new HttpError(404, 'Class not found.', 'not_found');
    if (c.teacherId === user.uid) return { cls: c, isTeacher: true, isMember: false };
    const m = mem.get(`classes/${classId}/members/${user.uid}`);
    if (!m || m.status !== 'active') throw new HttpError(403, "You don't have access to that class.", 'forbidden');
    return { cls: c, isTeacher: false, isMember: true };
  },
  async requireTeacher(classId, user) {
    const a = await cbtIo.classAccess(classId, user);
    if (!a.isTeacher) throw new HttpError(403, 'Only the class teacher can do that.', 'forbidden');
    return a;
  },
  async getMeta(classId, cbtId) {
    const m = mem.get(`classes/${classId}/cbts/${cbtId}`);
    if (!m) throw new HttpError(404, 'That CBT was not found.', 'not_found');
    return { id: cbtId, ...clone(m) };
  },
  async getQuestions(classId, cbtId) { return clone(blobs.q.get(`${classId}/${cbtId}`) || null); },
  async putQuestions(classId, cbtId, doc) { blobs.q.set(`${classId}/${cbtId}`, clone(doc)); },
  async listAttempts(classId, cbtId, uid) {
    const prefix = `${classId}/${cbtId}/${uid ? uid + '/' : ''}`;
    return [...blobs.attempts].filter(([k]) => k.startsWith(prefix)).map(([, v]) => clone(v));
  },
  async getAttempt(classId, cbtId, uid, id) { return clone(blobs.attempts.get(`${classId}/${cbtId}/${uid}/${id}`) || null); },
  async putAttempt(a) { blobs.attempts.set(`${a.classId}/${a.cbtId}/${a.uid}/${a.id}`, clone(a)); },
  async deleteAttempts(classId, cbtId, uid) {
    const prefix = `${classId}/${cbtId}/${uid}/`;
    const keys = [...blobs.attempts.keys()].filter((k) => k.startsWith(prefix));
    keys.forEach((k) => blobs.attempts.delete(k));
    return keys.length;
  },
  async limitStart() { /* no limit in tests */ },
};
const cbtActions = makeActions(cbtIo);

function fakeUserForFn() {
  if (!currentUser) throw new AppError('Please sign in again.', 'unauthenticated', 401);
  return { uid: currentUser.uid, name: currentUser.displayName, email: currentUser.email, token: 'x' };
}

const sampleQuestions = (topic, n) => Array.from({ length: n }, (_, i) => ({
  text: `Sample question ${i + 1} about ${topic || 'the topic'}?`,
  options: ['First option', 'Second option', 'Third option', 'Fourth option'],
  correct: i % 4,
  explanation: 'Because the second idea follows from the first.',
  topic: topic || 'General',
  skill: i % 2 ? 'application' : 'recall',
}));

function fakeAi(p) {
  if (window.__fake.aiFail) throw new AppError('The AI is busy right now. Please try again in a moment.', 'ai_busy', 503);
  const ctxEcho = p.context ? ' (I can see your class data.)' : '';
  switch (p.mode) {
    case 'student_coach': return { text: `Here is a simple way to think about it: start with the definition, then try one example.${ctxEcho}` };
    case 'teacher_coach': return { text: 'Try three steps: a household example, a quick demonstration, then two discussion questions.' };
    case 'explain_mistake': return { data: { type: 'careless_slip', title: 'A quick slip', explanation: 'You knew the idea but picked the wrong option.', fix: 'Re-read each option before choosing.', example: '' } };
    case 'flashcards': case 'photo_flashcards': return { data: [{ front: 'Term A', back: 'Meaning A' }, { front: 'Term B', back: 'Meaning B' }] };
    case 'practice_quiz': return { data: sampleQuestions(p.topic, Math.min(5, p.count || 5)) };
    case 'study_plan': return { data: { summary: 'Short sessions on your weakest topic first.', days: [{ day: 'Mon', focus: 'Maths: fractions', minutes: 25, tasks: ['Review notes', 'Do 5 questions'] }, { day: 'Tue', focus: 'Rest', minutes: 0, tasks: ['Take a break'] }] } };
    case 'break_down': return { data: { steps: [{ title: 'Read the instructions', minutes: 10, tip: 'Underline the verbs.' }, { title: 'Plan your answer', minutes: 15, tip: 'Write three bullet points.' }] } };
    case 'teacher_generate':
      if (['cbt_questions', 'revision_questions'].includes(p.kind)) return { data: sampleQuestions(p.topic, Math.min(p.count || 5, 8)) };
      return { text: `Draft (${p.kind}): ${p.topic || ''}` };
    default: throw new AppError('Unknown AI mode.', 'bad_mode', 400);
  }
}

const FILE_EXT = /\.(pdf|png|jpe?g|gif|webp|txt|csv|md|docx?|xlsx?|pptx?|odt|zip|mp3|mp4|webm)$/i;

export async function callFunction(name, payload) {
  await tick();
  try {
    if (name === 'cbt') {
      const fn = cbtActions[payload.action];
      if (!fn) throw new HttpError(400, 'Unknown action.', 'bad_action');
      return clone(await fn(fakeUserForFn(), payload));
    }
    if (name === 'ai') {
      const u = fakeUserForFn();
      if (['teacher_coach', 'teacher_generate'].includes(payload.mode) && roleOf(u.uid) !== 'teacher') throw new HttpError(403, 'That AI tool is for teacher accounts.', 'forbidden');
      return fakeAi(payload);
    }
    if (name === 'files') {
      const u = fakeUserForFn();
      const a = await cbtIo.classAccess(payload.classId, u);
      if (payload.action === 'upload') {
        if (payload.context === 'submission' && a.isTeacher) throw new HttpError(403, 'Only students submit work.', 'forbidden');
        if (payload.context !== 'submission' && !a.isTeacher) throw new HttpError(403, 'Only the class teacher can upload that.', 'forbidden');
        if (!FILE_EXT.test(payload.name || '')) throw new HttpError(415, 'That file type is not supported. Use PDF, images, Office documents, text, audio or short video.', 'bad_type');
        const size = Math.floor((payload.data || '').length * 0.75);
        if (size > 4 * 1024 * 1024) throw new HttpError(413, 'That file is larger than 4 MB. Try a smaller file or share a link instead.', 'too_large');
        if (window.__fake.uploadFail) throw new HttpError(502, 'Upload failed.', 'upload');
        const id = newId(12);
        blobs.files.set(id, { id, classId: payload.classId, name: payload.name, size, ownerUid: u.uid, context: payload.context });
        blobs.fileData.set(id, payload.data);
        return { id, name: payload.name, type: 'application/octet-stream', size, context: payload.context };
      }
      if (payload.action === 'delete') { blobs.files.delete(payload.id); blobs.fileData.delete(payload.id); return { ok: true }; }
    }
    throw new HttpError(400, 'Unknown request.', 'bad_request');
  } catch (e) {
    if (e instanceof HttpError) throw new AppError(e.message, e.code, e.status);
    throw e;
  }
}

export async function downloadFile(classId, id) {
  await tick();
  const meta = blobs.files.get(id);
  if (!meta || meta.classId !== classId) throw new AppError('That file was not found.', 'not_found', 404);
  if (meta.context === 'submission' && meta.ownerUid !== U() && !isTeacherOf(classId)) throw new AppError("You don't have access to that file.", 'forbidden', 403);
  const bin = atob(blobs.fileData.get(id) || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/octet-stream' });
}

export const isFake = true;

// ---------- test controls ----------
window.__fake = {
  latency: 0, aiFail: false, uploadFail: false, nextUser: null,
  signInAs(uid, extra = {}) { setUser({ uid, displayName: extra.displayName || uid, email: extra.email || `${uid}@example.com`, photoURL: '' }); },
  signOutNow() { setUser(null); },
  put(path, data) { mem.set(path, clone(resolve(data))); notifyAll(); },
  get(path) { return getDoc(path); },
  list(path, opts) { return listDocs(path, opts); },
  dump() { return Object.fromEntries(mem); },
  blobs,
  reset() { mem.clear(); blobs.q.clear(); blobs.attempts.clear(); blobs.files.clear(); blobs.fileData.clear(); try { localStorage.clear(); } catch { /* ignore */ } setUser(null); },
};

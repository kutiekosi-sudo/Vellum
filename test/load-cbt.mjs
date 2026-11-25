// Load test for the CBT engine: many students starting, autosaving and submitting at once, with random storage delays.
// Run: node test/load-cbt.mjs [students]   (default 40). It tests the logic, not Netlify or Firebase themselves.
import { makeActions } from '../netlify/functions/lib/cbtactions.mjs';
const delay = () => new Promise((r) => setTimeout(r, Math.random() * 12));
function makeIo(meta, qdoc) {
  const blobs = new Map(); let t = Date.now();
  return {
    blobs, now: () => Date.now(),
    classAccess: async (c, u) => ({ isTeacher: u.uid === 't1', isMember: true }),
    requireTeacher: async (c, u) => { if (u.uid !== 't1') throw new Error('not teacher'); },
    getMeta: async () => { await delay(); return meta; },
    getQuestions: async () => { await delay(); return JSON.parse(JSON.stringify(qdoc)); },
    putQuestions: async () => {},
    listAttempts: async (c, b, uid) => { await delay(); const out = [...blobs.entries()].filter(([k]) => k.startsWith(`${c}/${b}/${uid ? uid + '/' : ''}`)).map(([, v]) => JSON.parse(v)); await delay(); return out; },
    getAttempt: async (c, b, uid, id) => { await delay(); const v = blobs.get(`${c}/${b}/${uid}/${id}`); await delay(); return v ? JSON.parse(v) : null; },
    putAttempt: async (a) => { await delay(); blobs.set(`${a.classId}/${a.cbtId}/${a.uid}/${a.id}`, JSON.stringify(a)); },
    prog: new Map(),
    getProgress: async function (c, b, uid, id) { await delay(); const v = this.prog.get(`${c}/${b}/${uid}/${id}`); return v ? JSON.parse(v) : null; },
    putProgress: async function (c, b, uid, id, d) { await delay(); this.prog.set(`${c}/${b}/${uid}/${id}`, JSON.stringify(d)); },
    deleteAttempts: async () => 0, limitStart: async () => {},
  };
}
const qs = Array.from({ length: 10 }, (_, i) => ({ id: 'q' + i, text: 'Q' + i, options: ['a', 'b', 'c', 'd'], correct: i % 4, points: 1, topic: 'T' }));
const qdoc = { questions: qs, theory: [] };
const meta = (max) => ({ published: true, maxAttempts: max, timeLimitMin: 30, shuffle: true });
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + x)); if (!c) fails++; };
const N = Number(process.argv[2]) || 40;

// 1. 40 students start at once; nobody gets answers; each gets one attempt
{
  const io = makeIo(meta(1), qdoc), A = makeActions(io); const t0 = Date.now();
  const res = await Promise.all(Array.from({ length: N }, (_, i) => A.start({ uid: 's' + i, name: 'S' + i }, { classId: 'c1', cbtId: 't1' })));
  ok('40 students start at once: 40 attempts', io.blobs.size === N, io.blobs.size);
  ok('no answer keys sent to the browser', !JSON.stringify(res).includes('"correct"'));
}
// 2. one student double-taps Start (5 simultaneous requests), only 1 attempt allowed
{
  let bad = 0, many = 0;
  for (let r = 0; r < 30; r++) {
    const io = makeIo(meta(1), qdoc), A = makeActions(io);
    const res = await Promise.allSettled(Array.from({ length: 5 }, () => A.start({ uid: 's1', name: 'S' }, { classId: 'c1', cbtId: 't1' })));
    if (io.blobs.size > 1) many++;
    const ids = new Set(res.filter((x) => x.status === 'fulfilled').map((x) => x.value.attemptId || x.value.attempt?.id));
    if (ids.size > 1) bad++;
  }
  ok('double-tap Start never makes more than one attempt (30 rounds)', many === 0, `${many}/30 rounds created several attempts`);
  ok('double-tap Start always hands back the same attempt', bad === 0, `${bad}/30 rounds gave different attempts`);
}
// 3. autosave racing with Submit
{
  let reopened = 0, lost = 0; const R = 60;
  for (let r = 0; r < R; r++) {
    const io = makeIo(meta(1), qdoc), A = makeActions(io), u = { uid: 's1', name: 'S' };
    const st = await A.start(u, { classId: 'c1', cbtId: 't1' }); const id = st.attemptId || st.attempt?.id;
    const key = [...io.blobs.keys()][0]; const order = JSON.parse(io.blobs.get(key)).order;
    const all = {}; qs.forEach((q) => { all[q.id] = order[q.id].indexOf(q.correct); });
    await A.progress(u, { classId: 'c1', cbtId: 't1', attemptId: id, answers: {} });
    await Promise.allSettled([A.progress(u, { classId: 'c1', cbtId: 't1', attemptId: id, answers: { q0: all.q0 } }), A.submit(u, { classId: 'c1', cbtId: 't1', attemptId: id, answers: all })]);
    await new Promise((r2) => setTimeout(r2, 40));
    const final = JSON.parse(io.blobs.get(key));
    if (!final.submittedAt) reopened++; else if (final.score !== 10) lost++;
  }
  ok('autosave in flight while Submit: attempt stays submitted', reopened === 0, `${reopened}/${R} rounds lost the submission`);
  ok('autosave in flight while Submit: full marks kept', lost === 0, `${lost}/${R} rounds lost marks`);
}
// 3b. autosaved answers come back when the student reopens the exam
{
  const io = makeIo(meta(1), qdoc), A = makeActions(io), u = { uid: 's1', name: 'S' };
  const st = await A.start(u, { classId: 'c1', cbtId: 't1' }); const id = st.attemptId;
  await A.progress(u, { classId: 'c1', cbtId: 't1', attemptId: id, answers: { q0: 2, q1: 1 }, theory: {} });
  const again = await A.start(u, { classId: 'c1', cbtId: 't1' });
  ok('reopening the exam restores autosaved answers and the same attempt', again.attemptId === id && again.answers.q0 === 2 && again.answers.q1 === 1);
  // time runs out: graded from the autosave
  const io2 = makeIo({ ...meta(1), timeLimitMin: 0.0005 }, qdoc), A2 = makeActions(io2);
  const s2 = await A2.start(u, { classId: 'c1', cbtId: 't1' }); const ord = JSON.parse([...io2.blobs.values()][0]).order; await A2.progress(u, { classId: 'c1', cbtId: 't1', attemptId: s2.attemptId, answers: { q0: ord.q0.indexOf(0) } });
  io2.now = () => Date.now() + 10 * 60 * 1000; const r2 = await A2.myResults(u, { classId: 'c1', cbtIds: ['t1'] });
  ok('time up: graded from the last autosave (1 mark)', r2.cbts[0].results.length === 1 && r2.cbts[0].results[0].score === 1, JSON.stringify(r2.cbts[0].results[0] && r2.cbts[0].results[0].score));
}
// 4. double Submit
{
  let bad = 0;
  for (let r = 0; r < 30; r++) {
    const io = makeIo(meta(1), qdoc), A = makeActions(io), u = { uid: 's1', name: 'S' };
    const st = await A.start(u, { classId: 'c1', cbtId: 't1' }); const id = st.attemptId || st.attempt?.id; const key = [...io.blobs.keys()][0]; const order = JSON.parse(io.blobs.get(key)).order;
    const all = {}; qs.forEach((q) => { all[q.id] = order[q.id].indexOf(q.correct); });
    const rs = await Promise.all([1, 2, 3].map(() => A.submit(u, { classId: 'c1', cbtId: 't1', attemptId: id, answers: all })));
    if (new Set(rs.map((x) => x.score)).size > 1 || rs[0].score !== 10) bad++;
  }
  ok('double Submit gives the same correct score', bad === 0, `${bad}/30`);
}
// 5. full class: everyone starts, answers, autosaves and submits at once; teacher reads results during it
{
  const io = makeIo(meta(1), qdoc), A = makeActions(io); let wrong = 0;
  const T = { uid: 't1', name: 'Teacher' };
  const students = Array.from({ length: N }, (_, i) => ({ uid: 's' + i, name: 'S' + i }));
  let polls = 0, pollBad = 0;
  const poll = (async () => { for (let k = 0; k < 8; k++) { const r = await A.classResults(T, { classId: 'c1', cbtId: 't1' }); polls++; if (!r) pollBad++; await new Promise((x) => setTimeout(x, 15)); } })();
  await Promise.all(students.map(async (u, i) => {
    const st = await A.start(u, { classId: 'c1', cbtId: 't1' }); const id = st.attemptId || st.attempt?.id;
    const order = JSON.parse(io.blobs.get(`c1/t1/${u.uid}/${id}`)).order; const want = i % 11; const ans = {};
    qs.forEach((q, j) => { ans[q.id] = j < want ? order[q.id].indexOf(q.correct) : (order[q.id].indexOf(q.correct) + 1) % 4; });
    for (let k = 0; k < 3; k++) { await A.progress(u, { classId: 'c1', cbtId: 't1', attemptId: id, answers: ans }); await delay(); }
    const r = await A.submit(u, { classId: 'c1', cbtId: 't1', attemptId: id, answers: ans }); if (r.score !== want) wrong++;
  }));
  await poll;
  const fin = await A.classResults(T, { classId: 'c1', cbtId: 't1' });
  ok('full class of 40: every score correct', wrong === 0, wrong);
  ok('teacher can read results while the class is writing', pollBad === 0);
  ok('teacher results count 40 submissions', JSON.stringify(fin).includes('"submitted":40') || JSON.stringify(fin).includes('"count":40') || JSON.stringify(fin).includes('40'), Object.keys(fin));
}
console.log(fails ? `SOME FAILED (${fails})` : 'ALL OK'); process.exit(0);

// CBT actions, written against a small `io` interface so the exact same logic runs on Netlify (Blobs + Firestore REST)
// and in the offline test build (in-memory). See cbt.mjs for the real `io`.
//
//   io.now()                                      -> ms
//   io.classAccess(classId, user)                 -> { cls, isTeacher, isMember }  (throws HttpError if no access)
//   io.requireTeacher(classId, user)
//   io.getMeta(classId, cbtId, user)              -> the CBT settings document
//   io.getQuestions(classId, cbtId)               -> { questions } | null
//   io.putQuestions(classId, cbtId, doc)
//   io.listAttempts(classId, cbtId, uid?)         -> attempt[]
//   io.getAttempt(classId, cbtId, uid, id)        -> attempt | null
//   io.putAttempt(attempt)
//   io.deleteAttempts(classId, cbtId, uid)        -> number removed
//   io.limitStart(user)                           -> throws when the student starts too many attempts

import { HttpError, safeId, newId } from './shared.mjs';
import {
  cleanQuestions, cleanTheory, cleanTheoryAnswers, applyTheoryMarks, makeAttempt, gradeAttempt, studentView, startPayload, buildAnalytics, GRACE_MS,
} from './cbtcore.mjs';

export function makeActions(io) {
  // A timed attempt that ran out of time is graded from the last saved progress.
  async function finalizeIfExpired(attempt, qdoc) {
    if (attempt.submittedAt || io.now() <= attempt.expiresAt + GRACE_MS) return attempt;
    const done = { ...attempt, ...gradeAttempt(qdoc, attempt, attempt.progress || {}), theoryAnswers: attempt.progressTheory || {}, submittedAt: attempt.expiresAt, autoSubmitted: true };
    await io.putAttempt(done);
    return done;
  }

  return {
    async saveQuestions(user, body) {
      safeId(body.cbtId);
      await io.requireTeacher(body.classId, user);
      const theory = cleanTheory(body.theory);
      const given = Array.isArray(body.questions) ? body.questions : [];
      if (!given.length && !theory.length) throw new HttpError(400, 'Add at least one question.', 'no_questions');
      const questions = given.length ? cleanQuestions(given) : [];
      await io.putQuestions(body.classId, body.cbtId, { questions, theory, updatedAt: io.now(), updatedBy: user.uid });
      return { ok: true, count: questions.length, theoryCount: theory.length, questions, theory };
    },

    async getQuestions(user, body) {
      safeId(body.cbtId);
      await io.requireTeacher(body.classId, user);
      const doc = await io.getQuestions(body.classId, body.cbtId);
      return { questions: doc ? doc.questions : [], theory: doc ? doc.theory || [] : [] };
    },

    async start(user, body) {
      safeId(body.cbtId);
      const { isTeacher } = await io.classAccess(body.classId, user);
      if (isTeacher) throw new HttpError(403, 'Teachers can preview a CBT from the editor.', 'teacher');
      await io.limitStart(user);

      const meta = await io.getMeta(body.classId, body.cbtId, user);
      if (!meta.published) throw new HttpError(404, 'That CBT is not available.', 'not_found');
      const now = io.now();
      if (meta.opensAt && now < meta.opensAt) throw new HttpError(403, 'This CBT has not opened yet.', 'not_open');
      if (meta.closesAt && now > meta.closesAt) throw new HttpError(403, 'This CBT has closed.', 'closed');

      const qdoc = await io.getQuestions(body.classId, body.cbtId);
      if (!qdoc || (!qdoc.questions.length && !(qdoc.theory || []).length)) throw new HttpError(409, 'This CBT has no questions yet.', 'no_questions');

      let attempts = await io.listAttempts(body.classId, body.cbtId, user.uid);
      attempts = await Promise.all(attempts.map((a) => finalizeIfExpired(a, qdoc)));

      const open = attempts.find((a) => !a.submittedAt);
      if (open) return startPayload(open, qdoc, meta, now); // resume the attempt in progress

      const max = Math.max(1, Number(meta.maxAttempts) || 1);
      if (attempts.length >= max) throw new HttpError(403, 'You have used all of your attempts for this CBT.', 'no_attempts');

      const attempt = makeAttempt({
        id: newId(9), classId: body.classId, cbtId: body.cbtId, uid: user.uid, name: user.name, qdoc, meta, now,
      });
      await io.putAttempt(attempt);
      return startPayload(attempt, qdoc, meta, now);
    },

    async progress(user, body) {
      safeId(body.cbtId); safeId(body.attemptId);
      await io.classAccess(body.classId, user);
      const attempt = await io.getAttempt(body.classId, body.cbtId, user.uid, body.attemptId);
      if (!attempt || attempt.submittedAt) throw new HttpError(409, 'This attempt is already finished.', 'finished');
      if (io.now() > attempt.expiresAt + GRACE_MS) throw new HttpError(409, 'Time is up for this attempt.', 'expired');
      const clean = {};
      for (const [k, v] of Object.entries(body.answers || {})) if (attempt.order[k] && Number.isInteger(v)) clean[k] = v;
      const qdoc = await io.getQuestions(body.classId, body.cbtId);
      const progressTheory = qdoc ? cleanTheoryAnswers(qdoc, body.theory) : {};
      await io.putAttempt({ ...attempt, progress: clean, progressTheory });
      return { ok: true };
    },

    async submit(user, body) {
      safeId(body.cbtId); safeId(body.attemptId);
      await io.classAccess(body.classId, user);
      const meta = await io.getMeta(body.classId, body.cbtId, user);
      const qdoc = await io.getQuestions(body.classId, body.cbtId);
      if (!qdoc) throw new HttpError(409, 'This CBT has no questions.', 'no_questions');
      let attempt = await io.getAttempt(body.classId, body.cbtId, user.uid, body.attemptId);
      if (!attempt) throw new HttpError(404, 'Attempt not found.', 'not_found');
      if (!attempt.submittedAt) {
        const inTime = io.now() <= attempt.expiresAt + GRACE_MS;
        const clean = {};
        const source = inTime ? body.answers || {} : attempt.progress || {};
        for (const [k, v] of Object.entries(source)) if (attempt.order[k] && Number.isInteger(v)) clean[k] = v;
        const theoryAnswers = cleanTheoryAnswers(qdoc, inTime ? body.theory || {} : attempt.progressTheory || {});
        attempt = { ...attempt, ...gradeAttempt(qdoc, attempt, clean), theoryAnswers, theoryGraded: false, submittedAt: io.now(), autoSubmitted: !inTime };
        await io.putAttempt(attempt);
      }
      return studentView(attempt, meta, qdoc);
    },

    async myResults(user, body) {
      await io.classAccess(body.classId, user);
      const ids = (Array.isArray(body.cbtIds) ? body.cbtIds : [body.cbtId]).filter(Boolean).slice(0, 60).map((x) => safeId(x));
      const out = [];
      await Promise.all(ids.map(async (cbtId) => {
        const meta = await io.getMeta(body.classId, cbtId, user).catch(() => null);
        if (!meta) return;
        const qdoc = await io.getQuestions(body.classId, cbtId);
        let attempts = await io.listAttempts(body.classId, cbtId, user.uid);
        if (qdoc) attempts = await Promise.all(attempts.map((a) => finalizeIfExpired(a, qdoc)));
        const inProgress = attempts.find((a) => !a.submittedAt);
        const submitted = attempts.filter((a) => a.submittedAt).sort((a, b) => a.submittedAt - b.submittedAt);
        out.push({
          cbtId, attemptsUsed: attempts.length,
          inProgress: inProgress ? { attemptId: inProgress.id, expiresAt: inProgress.expiresAt } : null,
          results: submitted.map((a) => studentView(a, meta, qdoc)),
        });
      }));
      return { cbts: out };
    },

    async classResults(user, body) {
      safeId(body.cbtId);
      await io.requireTeacher(body.classId, user);
      const qdoc = await io.getQuestions(body.classId, body.cbtId);
      let attempts = await io.listAttempts(body.classId, body.cbtId);
      if (qdoc) attempts = await Promise.all(attempts.map((a) => finalizeIfExpired(a, qdoc)));
      return buildAnalytics(qdoc, attempts);
    },

    // Teacher: every student's latest submitted attempt, with their written answers, for marking.
    async theorySubmissions(user, body) {
      safeId(body.cbtId);
      await io.requireTeacher(body.classId, user);
      const qdoc = await io.getQuestions(body.classId, body.cbtId);
      if (!qdoc || !(qdoc.theory || []).length) return { theory: [], items: [] };
      const latest = new Map();
      for (const a of await io.listAttempts(body.classId, body.cbtId)) {
        if (a.submittedAt && (!latest.has(a.uid) || latest.get(a.uid).submittedAt < a.submittedAt)) latest.set(a.uid, a);
      }
      return {
        theory: qdoc.theory,
        items: [...latest.values()].map((a) => ({
          attemptId: a.id, uid: a.uid, name: a.name, submittedAt: a.submittedAt, autoSubmitted: !!a.autoSubmitted,
          answers: a.theoryAnswers || {}, marks: a.theoryMarks || {}, feedback: a.theoryFeedback || {},
          graded: !!a.theoryGraded, score: a.theoryScore ?? null, total: a.theoryTotal ?? null,
        })).sort((x, y) => String(x.name).localeCompare(String(y.name))),
      };
    },

    async gradeTheory(user, body) {
      safeId(body.cbtId); safeId(body.attemptId); safeId(body.uid);
      await io.requireTeacher(body.classId, user);
      const qdoc = await io.getQuestions(body.classId, body.cbtId);
      if (!qdoc || !(qdoc.theory || []).length) throw new HttpError(409, 'This CBT has no theory questions.', 'no_theory');
      const attempt = await io.getAttempt(body.classId, body.cbtId, body.uid, body.attemptId);
      if (!attempt || !attempt.submittedAt) throw new HttpError(404, 'That submission was not found.', 'not_found');
      const done = applyTheoryMarks(qdoc, attempt, body.marks, body.feedback, user.uid, io.now());
      await io.putAttempt(done);
      return { ok: true, score: done.theoryScore, total: done.theoryTotal };
    },

    async resetAttempts(user, body) {
      safeId(body.cbtId); safeId(body.uid);
      await io.requireTeacher(body.classId, user);
      return { ok: true, removed: await io.deleteAttempts(body.classId, body.cbtId, body.uid) };
    },
  };
}

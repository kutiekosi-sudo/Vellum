// Pure CBT logic (no storage, no network). Used by the real function (cbt.mjs) and by the offline test build,
// so grading, shuffling and what-a-student-may-see are written once.

import { HttpError, newId } from './shared.mjs';

export const MAX_QUESTIONS = 200;
export const GRACE_MS = 90 * 1000; // allowance for slow networks when a timed attempt is submitted

export function cleanQuestions(input) {
  if (!Array.isArray(input) || input.length === 0) throw new HttpError(400, 'Add at least one question.', 'no_questions');
  if (input.length > MAX_QUESTIONS) throw new HttpError(400, `A CBT can have at most ${MAX_QUESTIONS} questions.`, 'too_many');
  const seen = new Set();
  return input.map((q, i) => {
    const text = String(q?.text || '').trim().slice(0, 2000);
    if (!text) throw new HttpError(400, `Question ${i + 1} has no text.`, 'bad_question');
    const rawOptions = Array.isArray(q?.options) ? q.options : [];
    const correctRaw = Number(q?.correct);
    // Keep the correct answer pointing at the same option after blank options are dropped.
    const options = [];
    let correct = -1;
    rawOptions.forEach((o, idx) => {
      const t = String(o || '').trim().slice(0, 500);
      if (!t) return;
      if (idx === correctRaw) correct = options.length;
      options.push(t);
    });
    if (options.length < 2 || options.length > 6) throw new HttpError(400, `Question ${i + 1} needs 2 to 6 answer options.`, 'bad_question');
    if (correct < 0) throw new HttpError(400, `Choose the correct answer for question ${i + 1}.`, 'bad_question');
    let id = typeof q?.id === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(q.id) ? q.id : newId(6);
    while (seen.has(id)) id = newId(6);
    seen.add(id);
    return {
      id, text, options, correct,
      points: Math.min(10, Math.max(1, Number(q?.points) || 1)),
      skill: ['recall', 'application'].includes(q?.skill) ? q.skill : '',
      explanation: String(q?.explanation || '').trim().slice(0, 2000),
      topic: String(q?.topic || '').trim().slice(0, 80),
    };
  });
}

export const MAX_THEORY = 30;

// Written questions: the marking guide is for the teacher only and never sent to students.
export function cleanTheory(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new HttpError(400, 'Theory questions are not valid.', 'bad_theory');
  if (input.length > MAX_THEORY) throw new HttpError(400, `A CBT can have at most ${MAX_THEORY} theory questions.`, 'too_many');
  const seen = new Set();
  return input.map((q, i) => {
    const text = String(q?.text || '').trim().slice(0, 3000);
    if (!text) throw new HttpError(400, `Theory question ${i + 1} has no text.`, 'bad_theory');
    let id = typeof q?.id === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(q.id) ? q.id : newId(6);
    while (seen.has(id)) id = newId(6);
    seen.add(id);
    return {
      id, text,
      marks: Math.min(50, Math.max(1, Math.round(Number(q?.marks) || 5))),
      guide: String(q?.guide || '').trim().slice(0, 3000),
      topic: String(q?.topic || '').trim().slice(0, 80),
    };
  });
}

export const cleanTheoryAnswers = (qdoc, input) => {
  const out = {};
  for (const t of qdoc.theory || []) {
    const v = input && input[t.id];
    if (typeof v === 'string' && v.trim()) out[t.id] = v.slice(0, 8000);
  }
  return out;
};

// Apply a teacher's marks to an attempt. Marks are clamped to each question's maximum.
export function applyTheoryMarks(qdoc, attempt, marks, feedback, uid, now) {
  const m = {}; const f = {};
  let score = 0; let total = 0;
  for (const t of qdoc.theory || []) {
    total += t.marks;
    const raw = marks ? Number(marks[t.id]) : NaN;
    const val = Number.isFinite(raw) ? Math.min(t.marks, Math.max(0, Math.round(raw * 2) / 2)) : 0;
    m[t.id] = val; score += val;
    const fb = feedback && typeof feedback[t.id] === 'string' ? feedback[t.id].trim().slice(0, 2000) : '';
    if (fb) f[t.id] = fb;
  }
  return { ...attempt, theoryMarks: m, theoryFeedback: f, theoryScore: score, theoryTotal: total, theoryGraded: true, theoryGradedAt: now, theoryGradedBy: uid };
}

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled(arr, seed) {
  const rnd = mulberry32(hashSeed(seed));
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build a fresh attempt (question order + option order are fixed at the start, so a refresh can't re-roll them).
export function makeAttempt({ id, classId, cbtId, uid, name, qdoc, meta, now }) {
  const seed = `${uid}:${id}`;
  const ids = qdoc.questions.map((q) => q.id);
  const questionOrder = meta.shuffleQuestions ? shuffled(ids, seed + ':q') : ids;
  const order = {};
  for (const q of qdoc.questions) {
    const idx = q.options.map((_, i) => i);
    order[q.id] = meta.shuffleOptions ? shuffled(idx, seed + ':o:' + q.id) : idx;
  }
  const duration = Number(meta.timeLimitMin) > 0 ? Number(meta.timeLimitMin) * 60 * 1000 : 0;
  let expiresAt = duration ? now + duration : now + 6 * 60 * 60 * 1000;
  if (!duration && meta.closesAt && meta.closesAt + GRACE_MS < expiresAt) expiresAt = meta.closesAt + GRACE_MS;
  return {
    id, cbtId, classId, uid, name: name || '',
    startedAt: now, expiresAt, questionOrder, order, progress: {}, progressTheory: {}, submittedAt: null,
  };
}

export function gradeAttempt(qdoc, attempt, answers) {
  const order = attempt.order || {};
  const perQuestion = qdoc.questions.map((q) => {
    const map = order[q.id] || q.options.map((_, i) => i);
    const d = answers ? answers[q.id] : undefined;
    const answered = Number.isInteger(d) && d >= 0 && d < map.length;
    const chosen = answered ? map[d] : null; // original option index
    const correct = answered && chosen === q.correct;
    return {
      id: q.id, answered, chosen, chosenDisplay: answered ? d : null, correct,
      points: correct ? q.points : 0, max: q.points, topic: q.topic, skill: q.skill,
    };
  });
  const score = perQuestion.reduce((n, r) => n + r.points, 0);
  const total = perQuestion.reduce((n, r) => n + r.max, 0);
  const topics = {};
  for (const r of perQuestion) {
    const key = r.topic || 'General';
    topics[key] = topics[key] || { correct: 0, total: 0 };
    topics[key].total += 1;
    if (r.correct) topics[key].correct += 1;
  }
  return {
    score, total, pct: total ? Math.round((score / total) * 100) : 0,
    correctCount: perQuestion.filter((r) => r.correct).length,
    incorrectCount: perQuestion.filter((r) => r.answered && !r.correct).length,
    missedCount: perQuestion.filter((r) => !r.answered).length,
    topics, perQuestion, answers: answers || {},
  };
}

export function canSeeScore(meta, now = Date.now()) {
  const v = meta.resultsVisibility || 'immediate';
  if (v === 'immediate') return true;
  if (v === 'after_close') return !!meta.closesAt && now > meta.closesAt;
  if (v === 'released_by_teacher') return meta.resultsReleased === true;
  return true;
}

// What a student is allowed to see about one of their own submitted attempts.
export function studentView(attempt, meta, qdoc) {
  const base = {
    attemptId: attempt.id, cbtId: attempt.cbtId, submittedAt: attempt.submittedAt,
    startedAt: attempt.startedAt, autoSubmitted: !!attempt.autoSubmitted,
  };
  if (!canSeeScore(meta)) return { ...base, hidden: true };
  const out = {
    ...base, hidden: false,
    score: attempt.score, total: attempt.total, pct: attempt.pct,
    correctCount: attempt.correctCount, incorrectCount: attempt.incorrectCount, missedCount: attempt.missedCount,
    topics: attempt.topics,
  };
  if (qdoc && (qdoc.theory || []).length) {
    out.theory = qdoc.theory.map((t) => ({
      id: t.id, text: t.text, marks: t.marks,
      answer: (attempt.theoryAnswers || {})[t.id] || '',
      mark: attempt.theoryGraded ? (attempt.theoryMarks || {})[t.id] ?? 0 : null,
      feedback: attempt.theoryGraded ? (attempt.theoryFeedback || {})[t.id] || '' : '',
    }));
    out.theoryGraded = !!attempt.theoryGraded;
    out.theoryScore = attempt.theoryGraded ? attempt.theoryScore : null;
    out.theoryTotal = qdoc.theory.reduce((n, t) => n + t.marks, 0);
    if (attempt.theoryGraded) {
      const sc = (attempt.score || 0) + attempt.theoryScore; const tt = (attempt.total || 0) + out.theoryTotal;
      out.combinedPct = tt ? Math.round((sc / tt) * 100) : 0;
    }
  }
  if (meta.showReview !== false && qdoc) {
    out.review = qdoc.questions.map((q) => {
      const map = attempt.order?.[q.id] || q.options.map((_, i) => i);
      const r = attempt.perQuestion.find((p) => p.id === q.id) || {};
      return {
        id: q.id, text: q.text, topic: q.topic,
        options: map.map((i) => q.options[i]),
        chosen: r.chosenDisplay,
        correctIndex: map.indexOf(q.correct),
        correct: !!r.correct,
        explanation: meta.showExplanations !== false ? q.explanation : '',
      };
    });
  }
  return out;
}

// The questions a student receives when an attempt starts: no answer key, no explanations.
export function startPayload(attempt, qdoc, meta, now = Date.now()) {
  const byId = Object.fromEntries(qdoc.questions.map((q) => [q.id, q]));
  return {
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    serverNow: now,
    durationMin: Number(meta.timeLimitMin) || 0,
    answers: attempt.progress || {},
    theory: (qdoc.theory || []).map((t) => ({ id: t.id, text: t.text, marks: t.marks })),
    theoryAnswers: attempt.progressTheory || {},
    questions: attempt.questionOrder.map((qid) => {
      const q = byId[qid];
      return { id: q.id, text: q.text, points: q.points, options: attempt.order[qid].map((i) => q.options[i]) };
    }),
  };
}

// Teacher analytics for one CBT. Uses each student's latest submitted attempt.
export function buildAnalytics(qdoc, attempts) {
  const submitted = attempts.filter((a) => a.submittedAt);
  const byStudent = new Map();
  for (const a of [...submitted].sort((x, y) => x.submittedAt - y.submittedAt)) {
    if (!byStudent.has(a.uid)) byStudent.set(a.uid, { uid: a.uid, name: a.name, attempts: [] });
    byStudent.get(a.uid).attempts.push({
      id: a.id, pct: a.pct, score: a.score, total: a.total, submittedAt: a.submittedAt,
      autoSubmitted: !!a.autoSubmitted, correctCount: a.correctCount, topics: a.topics,
    });
  }
  const inProgress = attempts.filter((a) => !a.submittedAt).map((a) => ({ uid: a.uid, name: a.name, startedAt: a.startedAt }));
  const students = [...byStudent.values()].map((s) => ({
    ...s, latest: s.attempts[s.attempts.length - 1], best: Math.max(...s.attempts.map((a) => a.pct)),
  }));

  const latest = new Map();
  for (const a of submitted) if (!latest.has(a.uid) || latest.get(a.uid).submittedAt < a.submittedAt) latest.set(a.uid, a);
  const latestList = [...latest.values()];
  const pcts = latestList.map((a) => a.pct);
  const distribution = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i === 9 ? 100 : i * 10 + 9, count: 0 }));
  for (const p of pcts) distribution[Math.min(9, Math.floor(p / 10))].count += 1;

  const questions = (qdoc?.questions || []).map((q) => {
    const rows = latestList.map((a) => a.perQuestion.find((r) => r.id === q.id)).filter(Boolean);
    const correct = rows.filter((r) => r.correct).length;
    return {
      id: q.id, text: q.text, topic: q.topic, skill: q.skill, options: q.options, correctIndex: q.correct,
      attempts: rows.length, answered: rows.filter((r) => r.answered).length, correct,
      correctPct: rows.length ? Math.round((correct / rows.length) * 100) : null,
      optionCounts: q.options.map((_, i) => rows.filter((r) => r.chosen === i).length),
    };
  });
  const topics = {};
  for (const q of questions) {
    const key = q.topic || 'General';
    topics[key] = topics[key] || { correct: 0, total: 0 };
    topics[key].correct += q.correct;
    topics[key].total += q.attempts;
  }
  const skills = {};
  for (const q of questions) {
    if (!q.skill) continue;
    skills[q.skill] = skills[q.skill] || { correct: 0, total: 0 };
    skills[q.skill].correct += q.correct;
    skills[q.skill].total += q.attempts;
  }
  const pctOf = (v) => (v.total ? Math.round((v.correct / v.total) * 100) : null);
  return {
    count: latestList.length,
    average: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    highest: pcts.length ? Math.max(...pcts) : null,
    lowest: pcts.length ? Math.min(...pcts) : null,
    distribution, questions, students, inProgress,
    topicStats: Object.entries(topics).map(([topic, v]) => ({ topic, correctPct: pctOf(v), total: v.total })),
    skillStats: Object.entries(skills).map(([skill, v]) => ({ skill, correctPct: pctOf(v), total: v.total })),
    detail: latestList.map((a) => ({ uid: a.uid, attemptId: a.id, perQuestion: a.perQuestion })),
  };
}

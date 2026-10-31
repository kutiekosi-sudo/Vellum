// The Vellum learning model, ported: what a student has actually proved they know, topic by topic.
// Evidence comes from logged study, quiz results ("Prove you know") and Teach It Back. Time is real days.
import { DAY } from './util.js';

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Retention estimate for one topic, or null when there is no evidence yet.
// Quizzes count as a review event: testing yourself is itself a way of remembering.
export function computeRetention(topic, now = Date.now()) {
  const studied = (topic.studied || []).slice().sort((a, b) => a.at - b.at);
  const quiz = topic.quiz;
  if (!studied.length && !quiz) return null;

  let lastAt = studied.length ? studied[studied.length - 1].at : null;
  let start = 80;
  if (studied.length) {
    const d = studied[studied.length - 1].difficulty;
    start = d === 'easy' ? 95 : d === 'hard' ? 60 : 80;
  }
  let reviews = studied.length;
  let easeSum = studied.reduce((n, s) => n + (s.difficulty === 'easy' ? 1.4 : s.difficulty === 'hard' ? 0.6 : 1), 0);
  if (quiz && (lastAt === null || quiz.at >= lastAt)) {
    lastAt = quiz.at;
    start = quiz.score; // a poor quiz means low retention right now, not only faster decay later
    reviews += 1;
    easeSum += (quiz.score / 100) * 1.6;
  }
  const avgEase = reviews ? easeSum / reviews : 1;
  const daysSince = Math.max(0, (now - lastAt) / DAY);
  const stability = Math.max(1, reviews * 2 * avgEase);
  const retention = Math.round(clamp(start) * Math.exp(-daysSince / stability));
  return { retention: clamp(retention), daysSince: Math.floor(daysSince), stability: Math.round(stability * 10) / 10, reviews };
}

// Ghost knowledge: can pick the right answer (recognition) but cannot explain it (recall).
export function computeGhost(topic) {
  const quiz = topic.quiz;
  const tbs = topic.teachBacks || [];
  const tb = tbs.length ? tbs[tbs.length - 1] : null;
  if (!quiz || !tb) return null;
  return { recognition: quiz.score, recall: tb.accuracy, flagged: quiz.score - tb.accuracy >= 25 };
}

export const retentionTone = (pct) => (pct >= 70 ? 'ok' : pct >= 40 ? 'warn' : 'bad');

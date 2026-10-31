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

// ---- Exam readiness: retention, coverage, consistency, minus a penalty for ghost knowledge ----
export function computeReadiness(topics, sessions = [], now = Date.now()) {
  const rs = topics.map((t) => computeRetention(t, now));
  const studied = rs.filter(Boolean);
  const avgRetention = studied.length ? studied.reduce((n, r) => n + r.retention, 0) / studied.length : 0;
  const coverage = topics.length ? (studied.length / topics.length) * 100 : 0;
  // Consistency: how many of the last 7 days had any study (timer sessions or logged topic study).
  const days = new Set();
  const since = now - 7 * DAY;
  for (const s of sessions) if ((s.startedAt || 0) >= since) days.add(new Date(s.startedAt).toDateString());
  for (const t of topics) for (const e of t.studied || []) if (e.at >= since) days.add(new Date(e.at).toDateString());
  const consistency = (days.size / 7) * 100;
  const ghostCount = topics.map(computeGhost).filter((g) => g && g.flagged).length;
  const ghostPenalty = Math.min(20, ghostCount * 7);
  const score = clamp(Math.round(avgRetention * 0.42 + coverage * 0.28 + consistency * 0.22 + 8) - ghostPenalty, 0, 99);
  const any = studied.length > 0;
  const label = !any ? 'Just getting started' : score >= 75 ? 'On track' : score >= 45 ? 'Building, but gaps remain' : 'Behind: needs focused catch-up';
  return { score, avgRetention: Math.round(avgRetention), coverage: Math.round(coverage), consistency: Math.round(consistency), ghostCount, label };
}

// ---- Prerequisites ----
export function weakPrerequisites(topic, depMap, topics, now = Date.now()) {
  const entry = (depMap || []).find((d) => d.topic === topic.name);
  if (!entry) return [];
  return (entry.dependsOn || []).filter((name) => {
    const t = topics.find((x) => x.name === name);
    const r = t && computeRetention(t, now);
    return r && r.retention < 50;
  });
}
const dependentsOf = (name, depMap) => (depMap || []).filter((d) => (d.dependsOn || []).includes(name)).length;

// ---- The single most useful thing to do next ----
export function recommendedAction(topics, depMap, now = Date.now()) {
  let worst = null;
  for (const t of topics) {
    const r = computeRetention(t, now); const g = computeGhost(t); const weak = weakPrerequisites(t, depMap, topics, now);
    let urgency = r ? 100 - r.retention : 60;
    if (g && g.flagged) urgency += 20;
    if (weak.length) urgency += 15;
    if (!worst || urgency > worst.urgency) worst = { topic: t, urgency, retention: r ? r.retention : null, ghost: g, weak };
  }
  if (!worst) return null;
  const reason = worst.weak.length ? `Your prerequisite "${worst.weak[0]}" is shaky, which is probably dragging this topic down.`
    : worst.ghost && worst.ghost.flagged ? 'You recognise this topic in quizzes but struggle to explain it on your own.'
    : worst.retention !== null ? `What you remember has fallen to about ${worst.retention}%, close to the point where it is forgotten.`
    : 'This topic has not been studied or tested yet.';
  return { topic: worst.topic, reason, steps: ['Revise for 8 minutes', 'Take the short quiz', 'Teach it back in your own words'] };
}

// ---- What-if: a clearly labelled projection, not a promise ----
export function whatIf(topics, sessions, kind, now = Date.now()) {
  const base = computeReadiness(topics, sessions, now).score;
  if (kind === 'none') {
    const rs = topics.map((t) => computeRetention(t, now + 7 * DAY)).filter(Boolean);
    const avg = rs.length ? rs.reduce((n, r) => n + r.retention, 0) / rs.length : base;
    return Math.max(0, Math.round(base * 0.5 + avg * 0.5));
  }
  const minutes = Number(kind);
  if (!minutes) return base;
  return Math.min(97, Math.round(base + Math.min(35, Math.sqrt(minutes * 7) / 2.6)));
}

// ---- Minimum study optimizer: spend limited minutes where they help most ----
export function optimizer(topics, depMap, minutes, now = Date.now()) {
  const weighted = topics.map((t) => {
    const r = computeRetention(t, now); const g = computeGhost(t); const dependents = dependentsOf(t.name, depMap);
    let weight = r ? 100 - r.retention : 55;
    if (g && g.flagged) weight += 20;
    weight += dependents * 10;
    return { topic: t.name, weight, retention: r ? r.retention : null, dependents };
  }).sort((a, b) => b.weight - a.weight);
  const total = weighted.reduce((n, w) => n + w.weight, 0) || 1;
  let remaining = minutes; const blocks = [];
  weighted.forEach((w, i) => {
    if (remaining < 10) return;
    let alloc = Math.round(((w.weight / total) * minutes) / 5) * 5;
    alloc = Math.max(10, Math.min(35, alloc, remaining));
    if (i === weighted.length - 1 || remaining - alloc < 10) alloc = remaining;
    blocks.push({ topic: w.topic, minutes: alloc, retention: w.retention, dependents: w.dependents });
    remaining -= alloc;
  });
  const explanation = blocks.length
    ? `Time goes first to ${blocks[0].topic}${blocks[0].retention !== null ? `, where you remember about ${blocks[0].retention}%` : ', which you have not studied yet'}${blocks[0].dependents ? `, and ${blocks[0].dependents} other topic${blocks[0].dependents > 1 ? 's' : ''} build on it` : ''}. Topics are ranked by how much you are forgetting and how many others depend on them.`
    : 'Add a few topics first.';
  return { minutes, blocks, explanation };
}

// ---- Recurring mistakes across topics ----
export function recurringMistakes(topics) {
  const counts = {};
  for (const t of topics) for (const m of t.misconceptions || []) counts[m.text] = (counts[m.text] || 0) + 1;
  return Object.entries(counts).filter(([, n]) => n >= 2).map(([text, n]) => ({ text, count: n })).sort((a, b) => b.count - a.count);
}

// A short, private summary the coach can use to give relevant help. Built on the student's device from their own data.
export function studentContext(topics, sessions, now = Date.now()) {
  if (!topics.length && !sessions.length) return '';
  const lines = [];
  const r = computeReadiness(topics, sessions, now);
  if (topics.length) lines.push(`Exam readiness about ${r.score}% (${r.label}).`);
  for (const t of topics.slice(0, 12)) {
    const ret = computeRetention(t, now); const g = computeGhost(t);
    lines.push(`${t.name}${t.subject ? ` (${t.subject})` : ''}: ${ret ? `about ${ret.retention}% remembered, last reviewed ${ret.daysSince} days ago` : 'not studied yet'}${g && g.flagged ? '; recognises answers but struggles to explain' : ''}${t.quiz ? `; last quiz ${t.quiz.score}%` : ''}`);
  }
  const rec = recurringMistakes(topics);
  if (rec.length) lines.push(`Repeated mistakes: ${rec.slice(0, 4).map((m) => m.text).join('; ')}.`);
  const week = sessions.filter((s) => (s.startedAt || 0) > now - 7 * DAY).reduce((n, s) => n + (s.durationSec || 0), 0);
  lines.push(`Studied about ${Math.round(week / 60)} minutes in the last 7 days.`);
  return lines.join('\n').slice(0, 2900);
}

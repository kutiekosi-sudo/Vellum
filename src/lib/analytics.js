// Class performance analytics for teachers. Everything here is plain arithmetic on results the teacher already has
// (latest CBT score per student, graded assignments). The written summary is generated from the same numbers.
export const BANDS = [
  { id: 'strong', label: 'Strong', range: '70% and above', color: '#2F7D5B' },
  { id: 'steady', label: 'Steady', range: '50% to 69%', color: '#C98A1B' },
  { id: 'risk', label: 'Needs support', range: 'Below 50%', color: '#C0392B' },
  { id: 'none', label: 'No results yet', range: '', color: '#AEB4BA' },
];
const bandOf = (p) => (p == null ? 'none' : p >= 70 ? 'strong' : p >= 50 ? 'steady' : 'risk');
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r0 = (n) => (n == null ? null : Math.round(n));

// students: [{uid, name}]; tests: [{id, title, r}] where r is the classResults payload; assignments: [{id, title, points, subs:[{uid, grade}]}]
export function analyseClass({ students, tests, assignments }) {
  const per = new Map(students.map((s) => [s.uid, { uid: s.uid, name: s.name, scores: [] }]));
  const items = [];
  for (const t of tests) {
    const r = t.r; if (!r) continue;
    for (const st of r.students || []) { const p = per.get(st.uid); if (p && st.latest) p.scores.push(st.latest.pct); }
    if (r.count) items.push({ id: t.id, title: t.title, kind: 'Test', avg: r.average, taken: r.count, of: students.length });
  }
  for (const a of assignments) {
    const graded = (a.subs || []).filter((s) => s.grade != null && s.grade !== '' && a.points > 0);
    for (const s of graded) { const p = per.get(s.uid); if (p) p.scores.push((Number(s.grade) / a.points) * 100); }
    if (graded.length) items.push({ id: a.id, title: a.title, kind: 'Assignment', avg: r0(mean(graded.map((s) => (Number(s.grade) / a.points) * 100))), taken: graded.length, of: students.length });
  }
  const rows = [...per.values()].map((p) => ({ ...p, avg: r0(mean(p.scores)) })).map((p) => ({ ...p, band: bandOf(p.avg) }));
  const bands = BANDS.map((b) => ({ ...b, count: rows.filter((x) => x.band === b.id).length }));
  const withData = rows.filter((x) => x.avg != null);
  const classAvg = r0(mean(withData.map((x) => x.avg)));
  // Topic strength across every test.
  const topics = {};
  for (const t of tests) for (const ts of (t.r && t.r.topicStats) || []) {
    if (ts.correctPct == null) continue; const a = topics[ts.topic] || (topics[ts.topic] = { correct: 0, total: 0 });
    a.correct += (ts.correctPct / 100) * ts.total; a.total += ts.total;
  }
  const topicList = Object.entries(topics).map(([topic, v]) => ({ topic, pct: Math.round((v.correct / v.total) * 100), total: v.total })).sort((a, b) => a.pct - b.pct);
  const hardest = items.length > 1 ? items.slice().sort((a, b) => (a.avg ?? 101) - (b.avg ?? 101))[0] : null;
  return { rows, bands, classAvg, items, topics: topicList, hardest, students: students.length, withData: withData.length };
}

export function writeSummary(name, a) {
  if (!a.students) return 'There are no students in this class yet.';
  if (!a.items.length) return `${name} has ${a.students} ${a.students === 1 ? 'student' : 'students'}, but no test results or graded assignments yet. Once students sit a CBT or you grade an assignment, this page will show how the class is doing.`;
  const out = [];
  const tests = a.items.filter((i) => i.kind === 'Test').length; const asg = a.items.length - tests;
  out.push(`${name} has ${a.students} ${a.students === 1 ? 'student' : 'students'}. Across ${tests} ${tests === 1 ? 'test' : 'tests'} and ${asg} graded ${asg === 1 ? 'assignment' : 'assignments'}, the class average is ${a.classAvg}%.`);
  const risk = a.bands.find((b) => b.id === 'risk').count; const strong = a.bands.find((b) => b.id === 'strong').count;
  const pc = (n) => Math.round((n / Math.max(1, a.withData)) * 100);
  out.push(`${strong} ${strong === 1 ? 'student is' : 'students are'} doing strongly (${pc(strong)}%), and ${risk} ${risk === 1 ? 'needs' : 'need'} support (${pc(risk)}%), scoring below 50%.`);
  if (a.topics.length) {
    const worst = a.topics[0]; const best = a.topics[a.topics.length - 1];
    out.push(a.topics.length > 1 ? `The strongest topic is ${best.topic} (${best.pct}% correct). The weakest is ${worst.topic} (${worst.pct}% correct)${worst.pct < 50 ? ', which is worth re-teaching' : ''}.` : `${worst.topic} is at ${worst.pct}% correct.`);
  }
  if (a.hardest) out.push(`${a.hardest.title} was the hardest piece of work, with an average of ${a.hardest.avg}%.`);
  const missing = a.items.filter((i) => i.kind === 'Test' && i.of - i.taken > 0).sort((x, y) => (y.of - y.taken) - (x.of - x.taken))[0];
  if (missing) out.push(`${missing.of - missing.taken} ${missing.of - missing.taken === 1 ? 'student has' : 'students have'} not yet sat ${missing.title}.`);
  return out.join(' ');
}

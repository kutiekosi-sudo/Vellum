// Lesson plans: a teacher's own reusable plans, started from a template. Templates are built in (nothing stored);
// the plans a teacher saves are private to them at users/{uid}/lessonPlans.
export const plansPath = (uid) => `users/${uid}/lessonPlans`;

// Each stage is a share of the lesson, so a template fits any lesson length.
export const TEMPLATES = [
  { id: 'direct', name: 'Direct teaching', note: 'Explain, show an example, then practise.', stages: [['Settle and recap', 10, 'Greet, take the register, quick questions on last lesson.'], ['Introduce the idea', 15, 'Explain the key idea with one clear example on the board.'], ['Guided example', 20, 'Work one example together, students call out the steps.'], ['Independent practice', 40, 'Students try questions alone while you walk round.'], ['Check and close', 15, 'Go through answers, name one thing learnt, set homework.']] },
  { id: '5e', name: 'Enquiry (5E)', note: 'Students find out first, then you explain.', stages: [['Engage', 10, 'A question, picture or puzzle to get curiosity going.'], ['Explore', 25, 'Groups investigate or try something before being told.'], ['Explain', 20, 'Bring ideas together and give the correct terms.'], ['Elaborate', 25, 'Apply the idea to a new situation.'], ['Evaluate', 20, 'Short quiz or exit question to see who has got it.']] },
  { id: 'revision', name: 'Revision lesson', note: 'Recall, fix gaps, test.', stages: [['Quick recall', 15, 'Without notes, students write what they remember.'], ['Fix the gaps', 35, 'Re-teach only what most students missed.'], ['Past questions', 35, 'Students answer exam-style questions.'], ['Mark and reflect', 15, 'Self or peer marking, then note what to revise.']] },
  { id: 'practical', name: 'Practical or demonstration', note: 'Hands-on work with safety and a write-up.', stages: [['Safety and set-up', 10, 'Rules, roles and materials handed out.'], ['Demonstrate', 15, 'Show the method once, slowly.'], ['Students do it', 40, 'Groups carry out the practical and record results.'], ['Discuss results', 20, 'What happened, why, what went wrong.'], ['Write up and tidy', 15, 'Record conclusion; clear away.']] },
  { id: 'exit', name: 'Short lesson with exit ticket', note: 'Good for a single period.', stages: [['Hook', 10, 'One question to start thinking.'], ['Teach', 40, 'One main idea, taught in small steps with checks.'], ['Practise', 35, 'A few questions on the idea.'], ['Exit ticket', 15, 'Each student answers one question to hand in.']] },
];

// Turn a template into stages whose minutes add up exactly to the lesson length.
export function fromTemplate(t, minutes) {
  const total = Math.max(15, Math.min(240, Math.round(Number(minutes) || 40)));
  const weight = t.stages.reduce((a, s) => a + s[1], 0);
  let used = 0;
  const stages = t.stages.map((s, i) => {
    const m = i === t.stages.length - 1 ? total - used : Math.max(1, Math.round((s[1] / weight) * total));
    used += m;
    return { id: Math.random().toString(36).slice(2, 8), title: s[0], minutes: m, activity: s[2] };
  });
  return { title: '', subject: '', level: '', minutes: total, objectives: '', stages, materials: '', homework: '', notes: '' };
}

export const stageTotal = (stages) => (stages || []).reduce((a, s) => a + (Number(s.minutes) || 0), 0);

export function cleanPlan(f) {
  return {
    title: String(f.title || '').trim().slice(0, 100), subject: String(f.subject || '').trim().slice(0, 60), level: String(f.level || '').trim().slice(0, 40),
    minutes: Math.max(5, Math.min(240, Math.round(Number(f.minutes) || 40))),
    objectives: String(f.objectives || '').trim().slice(0, 1500), materials: String(f.materials || '').trim().slice(0, 1000),
    homework: String(f.homework || '').trim().slice(0, 1000), notes: String(f.notes || '').trim().slice(0, 3000),
    stages: (f.stages || []).slice(0, 12).map((s) => ({ id: s.id || Math.random().toString(36).slice(2, 8), title: String(s.title || '').trim().slice(0, 80), minutes: Math.max(0, Math.min(240, Math.round(Number(s.minutes) || 0))), activity: String(s.activity || '').trim().slice(0, 600) })).filter((s) => s.title),
  };
}

// Plain text version, used when a plan is shared with a class as a resource.
export function planText(p) {
  const out = [];
  if (p.objectives) out.push(`Objectives\n${p.objectives}`);
  out.push(`Lesson (${p.minutes} minutes)\n${(p.stages || []).map((s, i) => `${i + 1}. ${s.title} (${s.minutes} min)${s.activity ? `: ${s.activity}` : ''}`).join('\n')}`);
  if (p.materials) out.push(`You will need\n${p.materials}`);
  if (p.homework) out.push(`Homework\n${p.homework}`);
  return out.join('\n\n').slice(0, 2000);
}

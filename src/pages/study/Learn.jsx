import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { ai } from '../../lib/api.js';
import { computeRetention, computeGhost, retentionTone } from '../../lib/knowledge.js';
import { cleanQuestions } from './Practice.jsx';
import { fmtDate, plural } from '../../lib/util.js';
import { Badge, Button, Card, Empty, ErrorBlock, Notice, PageSkeleton, Progress, SectionTitle, TextArea, TextField, useConfirm } from '../../ui/kit.jsx';

const cap = (a, n) => (a.length > n ? a.slice(a.length - n) : a);
const path = (uid, id) => `users/${uid}/topics/${id}`;

function NewTopic({ onDone, onCancel }) {
  const { user, fail } = useApp();
  const [f, setF] = useState({ name: '', subject: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      const id = await db.add(`users/${user.uid}/topics`, { name: f.name.trim().slice(0, 80), subject: f.subject.trim().slice(0, 60), notes: f.notes.trim().slice(0, 6000), studied: [], teachBacks: [], quizzes: [], misconceptions: [], createdAt: Date.now() });
      onDone(id);
    } catch (e) { fail(e); setBusy(false); }
  };
  return (
    <Card className="stack">
      <h3>Add a topic</h3>
      <TextField label="Topic" value={f.name} onChange={set('name')} maxLength={80} placeholder="For example: Photosynthesis" autoComplete="off" data-autofocus />
      <TextField label="Subject (optional)" value={f.subject} onChange={set('subject')} maxLength={60} autoComplete="off" />
      <TextArea label="Your notes on it (optional)" rows={6} value={f.notes} onChange={set('notes')} maxLength={6000} hint="With notes, quizzes and checks are based on what you actually studied." />
      <div className="row wrap"><Button loading={busy} disabled={!f.name.trim()} onClick={save}>Add topic</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </Card>
  );
}

// ---- Prove you know: a quiz, then a Concept Autopsy for every wrong answer ----
function Prove({ topic, onSaved, onBack }) {
  const { user, fail } = useApp();
  const [count, setCount] = useState('5');
  const [qs, setQs] = useState(null);
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const make = async () => {
    setBusy(true);
    try {
      const res = await ai('practice_quiz', { topic: topic.name, subject: topic.subject, count: Math.max(3, Math.min(15, Number(count) || 5)), notes: topic.notes || '' });
      const q = cleanQuestions(res.data);
      if (!q.length) throw new Error('The AI did not return usable questions. Please try again.');
      setQs(q); setPicked({});
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true);
    try {
      const answered = qs.map((q, i) => ({ i, chosen: picked[i] ?? -1, correct: picked[i] === q.correct }));
      const right = answered.filter((a) => a.correct).length;
      const score = Math.round((right / qs.length) * 100);
      // Concept Autopsy: ask the AI why each wrong answer was likely chosen. Failures here never lose the quiz result.
      const wrong = answered.filter((a) => !a.correct);
      const autopsies = await Promise.all(wrong.map(async (a) => {
        const q = qs[a.i];
        try {
          const r = await ai('explain_mistake', { subject: topic.subject, topic: topic.name, question: q.text, options: q.options, chosen: a.chosen >= 0 ? q.options[a.chosen] : '(left blank)', correct: q.options[q.correct] });
          return { i: a.i, ...r.data };
        } catch { return { i: a.i, type: 'knowledge_gap', title: 'Review this idea', explanation: q.explanation || 'Look at this question again with your notes.', fix: 'Reread this part of your notes.', example: '' }; }
      }));
      const misconceptions = autopsies.filter((x) => x.type !== 'careless_slip' && x.title).map((x) => ({ text: x.title, at: Date.now() }));
      const at = Date.now();
      await db.update(path(user.uid, topic.id), {
        quiz: { at, score, total: qs.length },
        quizzes: cap([...(topic.quizzes || []), { at, score, total: qs.length }], 20),
        misconceptions: cap([...(topic.misconceptions || []), ...misconceptions], 30),
      });
      setResult({ score, right, answered, autopsies });
      onSaved();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  if (result) {
    return (
      <Card className="stack">
        <h3>Your result</h3>
        <div><div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{result.score}%</div><div className="muted small">{result.right} of {qs.length} right</div></div>
        <Progress value={result.score} label="Score" />
        {result.answered.map((a) => {
          const q = qs[a.i]; const ap = result.autopsies.find((x) => x.i === a.i);
          return (
            <div key={a.i} className="stack sm" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <strong className="break">{a.i + 1}. {q.text}</strong>
              <span style={{ color: a.correct ? 'var(--ok)' : 'var(--bad)' }}>{a.correct ? 'Right' : a.chosen >= 0 ? `Your answer: ${q.options[a.chosen]}` : 'Not answered'}</span>
              {!a.correct && <span>Correct answer: {q.options[q.correct]}</span>}
              {ap && (
                <Notice icon="info" className="stack sm">
                  <strong>Concept Autopsy: {ap.title}</strong>
                  <span className="pre">{ap.explanation}</span>
                  {ap.fix && <span>Next: {ap.fix}</span>}
                  {ap.example && <span className="muted pre">{ap.example}</span>}
                </Notice>
              )}
            </div>
          );
        })}
        <div className="row wrap"><Button onClick={() => { setResult(null); setQs(null); }}>Try new questions</Button><Button variant="ghost" onClick={onBack}>Back to topic</Button></div>
      </Card>
    );
  }
  if (!qs) {
    return (
      <Card className="stack">
        <h3>Prove you know it</h3>
        <p className="muted">A short quiz on {topic.name}{topic.notes ? ', from your notes' : ''}. For every answer you get wrong, you get a Concept Autopsy: why it probably went wrong, and what to do about it.</p>
        <TextField label="How many questions (3 to 15)" type="number" inputMode="numeric" min="3" max="15" value={count} onChange={(e) => setCount(e.target.value)} />
        <div className="row wrap"><Button loading={busy} onClick={make}>Start the quiz</Button><Button variant="ghost" onClick={onBack}>Back</Button></div>
      </Card>
    );
  }
  const done = Object.keys(picked).length;
  return (
    <Card className="stack">
      <h3>{topic.name}</h3>
      {qs.map((q, i) => (
        <div key={i} className="stack sm" style={{ borderTop: i ? '1px solid var(--line)' : 0, paddingTop: i ? 12 : 0 }}>
          <strong className="break">{i + 1}. {q.text}</strong>
          {q.options.map((o, j) => (
            <button key={j} type="button" onClick={() => setPicked({ ...picked, [i]: j })} aria-pressed={picked[i] === j}
              style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, fontSize: 16, minHeight: 46, cursor: 'pointer', border: `2px solid ${picked[i] === j ? 'var(--accent, #1F5C4D)' : 'var(--line, #ddd)'}`, background: picked[i] === j ? 'var(--accent-soft, #e8f1ee)' : 'var(--surface, #fff)' }}>
              <strong style={{ marginRight: 10 }}>{String.fromCharCode(65 + j)}</strong>{o}
            </button>
          ))}
        </div>
      ))}
      <div className="row wrap"><Button loading={busy} onClick={submit}>{done < qs.length ? `Submit (${qs.length - done} unanswered)` : 'Submit'}</Button><Button variant="ghost" disabled={busy} onClick={() => setQs(null)}>Cancel</Button></div>
      {busy && <p className="muted small" role="status">Marking and diagnosing your mistakes...</p>}
    </Card>
  );
}

// ---- Teach it back: explain it in your own words ----
function TeachBack({ topic, onSaved, onBack }) {
  const { user, fail } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const submit = async () => {
    setBusy(true);
    try {
      const r = (await ai('teach_back', { topic: topic.name, subject: topic.subject, notes: topic.notes || '', explanation: text })).data || {};
      const accuracy = Math.max(0, Math.min(100, Math.round(Number(r.accuracy) || 0)));
      const entry = { at: Date.now(), accuracy, missing: (r.missing || []).slice(0, 6).map((x) => String(x).slice(0, 200)), misconception: String(r.misconception || '').slice(0, 300) };
      await db.update(path(user.uid, topic.id), {
        teachBacks: cap([...(topic.teachBacks || []), entry], 20),
        misconceptions: cap([...(topic.misconceptions || []), ...(entry.misconception ? [{ text: entry.misconception, at: entry.at }] : [])], 30),
      });
      setRes({ ...entry, covered: (r.covered || []).slice(0, 6), feedback: String(r.feedback || '') });
      onSaved();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  if (res) {
    return (
      <Card className="stack">
        <h3>How well you explained it</h3>
        <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{res.accuracy}%</div>
        <Progress value={res.accuracy} label="Accuracy" />
        {res.feedback && <p className="pre">{res.feedback}</p>}
        {res.covered.length > 0 && <div><strong>You explained well</strong><ul>{res.covered.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
        {res.missing.length > 0 && <div><strong>Still missing</strong><ul>{res.missing.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
        {res.misconception && <Notice tone="warn"><strong>Something to correct: </strong>{res.misconception}</Notice>}
        <div className="row wrap"><Button onClick={() => { setRes(null); setText(''); }}>Try again</Button><Button variant="ghost" onClick={onBack}>Back to topic</Button></div>
      </Card>
    );
  }
  return (
    <Card className="stack">
      <h3>Teach it back</h3>
      <p className="muted">Close your notes. Explain {topic.name} as if you were teaching a friend who has never heard of it. Use your own words.</p>
      <TextArea label="Your explanation" rows={9} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} />
      <div className="row wrap"><Button loading={busy} disabled={text.trim().length < 40} onClick={submit}>Check my explanation</Button><Button variant="ghost" disabled={busy} onClick={onBack}>Back</Button></div>
      {text.trim().length < 40 && <p className="muted small">Write a few sentences first.</p>}
    </Card>
  );
}

function Detail({ topic, onBack, mode, setMode, reload }) {
  const { user, toast, fail } = useApp();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const r = computeRetention(topic);
  const g = computeGhost(topic);
  const lastQuiz = topic.quiz;
  const lastTb = (topic.teachBacks || []).slice(-1)[0];

  const log = async (difficulty) => {
    setBusy(true);
    try {
      await db.update(path(user.uid, topic.id), { studied: cap([...(topic.studied || []), { at: Date.now(), difficulty }], 60) });
      toast('Logged. Your forecast is updated.');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!(await confirm(`Delete "${topic.name}" and everything tracked for it?`, { title: 'Delete topic', confirmLabel: 'Delete', danger: true }))) return;
    try { await db.del(path(user.uid, topic.id)); onBack(); } catch (e) { fail(e); }
  };
  if (mode === 'prove') return <Prove topic={topic} onSaved={reload} onBack={() => setMode('')} />;
  if (mode === 'teach') return <TeachBack topic={topic} onSaved={reload} onBack={() => setMode('')} />;
  const recent = {};
  for (const m of topic.misconceptions || []) recent[m.text] = (recent[m.text] || 0) + 1;
  const repeated = Object.entries(recent).filter(([, n]) => n >= 2);
  return (
    <div className="stack">
      <div className="row between"><Button variant="ghost" size="sm" onClick={onBack}>All topics</Button><Button variant="ghost" size="sm" onClick={remove}>Delete</Button></div>
      <Card className="stack">
        <h2 className="break" style={{ fontSize: 24 }}>{topic.name}</h2>
        {topic.subject && <span className="muted">{topic.subject}</span>}
        {r ? (
          <>
            <div className="row wrap" style={{ alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 36, fontWeight: 700 }}>{r.retention}%</span><span className="muted">estimated remembered now</span></div>
            <Progress value={r.retention} label="Retention" />
            <p className="muted small">Based on {plural(r.reviews, 'review')}, last {r.daysSince === 0 ? 'today' : plural(r.daysSince, 'day') + ' ago'}. This is an estimate that fades over time unless you review. Quizzes and teaching it back count as reviews.</p>
          </>
        ) : <p className="muted">Nothing tracked yet. Log some study, take the quiz or teach it back to start your forecast.</p>}
      </Card>

      {g && g.flagged && (
        <Notice tone="warn"><strong>Ghost knowledge. </strong>You recognised the right answers ({g.recognition}%) but could only explain {g.recall}% on your own. Practise explaining it without looking, then check again.</Notice>
      )}
      {repeated.length > 0 && <Notice icon="info"><strong>Keeps coming up: </strong>{repeated.map(([t, n]) => `${t} (${n} times)`).join('; ')}</Notice>}

      <Card className="stack sm">
        <strong>I just studied this</strong>
        <span className="muted small">How did it feel?</span>
        <div className="row wrap">
          <Button variant="ghost" loading={busy} onClick={() => log('easy')}>Easy</Button>
          <Button variant="ghost" loading={busy} onClick={() => log('ok')}>About right</Button>
          <Button variant="ghost" loading={busy} onClick={() => log('hard')}>Hard</Button>
        </div>
      </Card>
      <div className="grid cols-2">
        <Card className="stack sm"><strong>Prove you know it</strong><span className="muted small">{lastQuiz ? `Last quiz ${lastQuiz.score}% on ${fmtDate(lastQuiz.at)}` : 'No quiz yet'}</span><div><Button onClick={() => setMode('prove')}>Take the quiz</Button></div></Card>
        <Card className="stack sm"><strong>Teach it back</strong><span className="muted small">{lastTb ? `Last time ${lastTb.accuracy}% on ${fmtDate(lastTb.at)}` : 'Not tried yet'}</span><div><Button onClick={() => setMode('teach')}>Explain it</Button></div></Card>
      </div>
    </div>
  );
}

export default function Learn() {
  const { user } = useApp();
  const list = useLive(`users/${user.uid}/topics`);
  const [view, setView] = useState({ name: 'list' });
  const [mode, setMode] = useState('');
  const topics = (list.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (view.name === 'new') return <NewTopic onCancel={() => setView({ name: 'list' })} onDone={(id) => setView({ name: 'topic', id })} />;
  if (view.name === 'topic') {
    const t = topics.find((x) => x.id === view.id);
    if (!t) return list.loading ? <PageSkeleton rows={2} /> : <Empty art="search" title="Topic not found" text="It may have been deleted."><Button onClick={() => setView({ name: 'list' })}>Back</Button></Empty>;
    return <Detail key={t.id} topic={t} mode={mode} setMode={setMode} reload={() => {}} onBack={() => { setMode(''); setView({ name: 'list' }); }} />;
  }
  return (
    <div className="stack">
      <p className="muted">Add the topics you are learning. Learnr tracks what you can really remember, and finds the gaps.</p>
      <div><Button icon="plus" onClick={() => setView({ name: 'new' })}>Add a topic</Button></div>
      {list.loading ? <PageSkeleton rows={2} /> : list.error ? <ErrorBlock error={list.error} /> : topics.length === 0 ? (
        <Empty art="focus" title="No topics yet" text="Add one, then prove you know it with a quiz and by teaching it back." />
      ) : (
        <Card className="list-card">
          {topics.map((t) => {
            const r = computeRetention(t); const g = computeGhost(t);
            return (
              <div className="item-row" key={t.id}>
                <button type="button" className="row grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer', color: 'inherit', minWidth: 0 }} onClick={() => setView({ name: 'topic', id: t.id })}>
                  <span className="grow"><strong className="break">{t.name}</strong><span className="muted small" style={{ display: 'block' }}>{[t.subject, plural((t.quizzes || []).length, 'quiz', 'quizzes')].filter(Boolean).join(', ')}</span></span>
                  {g && g.flagged && <Badge tone="warn">Ghost knowledge</Badge>}
                  {r ? <Badge tone={retentionTone(r.retention)}>{r.retention}%</Badge> : <Badge>New</Badge>}
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { ai } from '../../lib/api.js';
import { fmtDate, fmtClock, plural } from '../../lib/util.js';
import { runBatches, coverageCount } from '../../lib/batch.js';
import { AddWithCode, ShareButton } from './Sharing.jsx';
import { Badge, Button, Card, Empty, ErrorBlock, Notice, PageSkeleton, Progress, SelectField, TextArea, TextField, useConfirm } from '../../ui/kit.jsx';

const shuffle = (a) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };

export function cleanQuestions(raw) {
  return (Array.isArray(raw) ? raw : []).map((q) => ({
    text: String(q.text || '').trim().slice(0, 600),
    options: (Array.isArray(q.options) ? q.options : []).map((o) => String(o || '').trim().slice(0, 300)).filter(Boolean).slice(0, 6),
    correct: Number.isInteger(q.correct) ? q.correct : -1,
    explanation: String(q.explanation || '').trim().slice(0, 800),
    topic: String(q.topic || '').trim().slice(0, 80),
  })).filter((q) => q.text && q.options.length >= 2 && q.correct >= 0 && q.correct < q.options.length);
}

function Create({ onDone, onCancel }) {
  const { user, fail } = useApp();
  const [f, setF] = useState({ title: '', subject: '', level: '', count: '10', notes: '', all: true });
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const make = async () => {
    setErr('');
    if (f.notes.trim().length < 80) { setErr('Paste a bit more of your notes (at least a few sentences) so the questions come from them.'); return; }
    setBusy(true);
    try {
      const total = f.all ? coverageCount(f.notes, 60) : Math.max(1, Math.min(60, Math.round(Number(f.count) || 10)));
      const raw = await runBatches({
        notes: f.notes, total, perCall: 10,
        onProgress: (i, n) => setProgress(n > 1 ? `Making questions, part ${i} of ${n}...` : ''),
        call: async (slice, count) => (await ai('practice_quiz', { topic: f.title.trim() || 'My notes', subject: f.subject.trim(), level: f.level.trim(), count, notes: slice })).data,
      });
      const seen = new Set();
      const questions = cleanQuestions(raw).filter((q) => { const k = q.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      if (!questions.length) { setErr('The AI did not return usable questions. Try again, or paste clearer notes.'); setBusy(false); return; }
      const id = await db.add(`users/${user.uid}/practice`, {
        title: f.title.trim() || 'My notes', subject: f.subject.trim(), level: f.level.trim(), questions, history: [], createdAt: Date.now(),
      });
      onDone(id);
    } catch (e) { fail(e); setBusy(false); }
  };
  return (
    <Card className="stack">
      <h3>New practice set</h3>
      <p className="muted">Paste notes from your textbook, class or revision. The questions come from your notes only, and only you can see them.</p>
      <TextField label="Title" value={f.title} onChange={set('title')} maxLength={80} placeholder="For example: Photosynthesis" autoComplete="off" />
      <div className="grid cols-2">
        <TextField label="Subject (optional)" value={f.subject} onChange={set('subject')} maxLength={60} autoComplete="off" />
        <TextField label="Your level (optional)" value={f.level} onChange={set('level')} maxLength={40} placeholder="For example: SS2" autoComplete="off" />
      </div>
      <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} /> Cover everything in my notes ({f.notes.trim().length >= 80 ? `about ${coverageCount(f.notes, 60)} questions` : 'paste notes first'})</label>
      {!f.all && <TextField label="How many questions (1 to 60)" type="number" inputMode="numeric" min="1" max="60" value={f.count} onChange={set('count')} />}
      <TextArea label="Your notes" rows={9} value={f.notes} onChange={set('notes')} maxLength={15000} hint="Up to about 15,000 characters. Longer notes make more questions." />
      {err && <Notice tone="warn">{err}</Notice>}
      <div className="row wrap"><Button loading={busy} onClick={make}>Make questions</Button><Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button></div>
      {busy && progress && <p className="muted small" role="status">{progress}</p>}
    </Card>
  );
}

function Play({ set, onExit, onSave }) {
  const [order] = useState(() => shuffle(set.questions.map((_, i) => i)));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState([]);
  const [done, setDone] = useState(false);
  const [timed, setTimed] = useState(false);
  const [started, setStarted] = useState(false);
  const [left, setLeft] = useState(0);
  const saved = useRef(false);
  const total = order.length;

  useEffect(() => {
    if (!started || !timed || done) return undefined;
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [started, timed, done]);
  useEffect(() => { if (started && timed && left <= 0 && !done) setDone(true); }, [left]);
  useEffect(() => {
    if (done && !saved.current) { saved.current = true; onSave({ at: Date.now(), score, total, timed }); }
  }, [done]);

  if (!started) {
    return (
      <Card className="stack">
        <h3>{set.title}</h3>
        <p className="muted">{plural(total, 'question')}. You see the answer and an explanation after each one.</p>
        <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> Timed ({plural(Math.ceil(total * 0.75), 'minute')} in all)</label>
        <div className="row wrap"><Button onClick={() => { setLeft(Math.ceil(total * 0.75) * 60); setStarted(true); }}>Start</Button><Button variant="ghost" onClick={onExit}>Back</Button></div>
      </Card>
    );
  }
  if (done) {
    const pct = Math.round((score / total) * 100);
    return (
      <Card className="stack">
        <h3>{left <= 0 && timed ? 'Time is up' : 'Finished'}</h3>
        <div><div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{pct}%</div><div className="muted small">{score} of {total} right</div></div>
        <Progress value={pct} label="Score" />
        {missed.length > 0 && (
          <div className="stack sm"><strong>Worth another look</strong>{missed.map((m, i) => <div key={i} className="stack sm" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}><span className="break">{m.text}</span><span className="muted small">Answer: {m.answer}</span>{m.explanation && <span className="muted small">{m.explanation}</span>}</div>)}</div>
        )}
        <div className="row wrap"><Button onClick={onExit}>Done</Button></div>
      </Card>
    );
  }
  const q = set.questions[order[pos]];
  const answered = picked != null;
  const choose = (i) => {
    if (answered) return;
    setPicked(i);
    if (i === q.correct) setScore((s) => s + 1); else setMissed((m) => [...m, { text: q.text, answer: q.options[q.correct], explanation: q.explanation }]);
  };
  const next = () => { if (pos + 1 >= total) setDone(true); else { setPos(pos + 1); setPicked(null); } };
  return (
    <Card className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted small">Question {pos + 1} of {total}</span>
        {timed && <Badge tone={left <= 30 ? 'warn' : 'info'}>{fmtClock(Math.max(0, left))}</Badge>}
      </div>
      <Progress value={(pos / total) * 100} label="Progress" />
      <h2 className="break" style={{ fontSize: 20 }}>{q.text}</h2>
      <div className="stack sm">
        {q.options.map((o, i) => {
          const right = answered && i === q.correct; const wrong = answered && i === picked && i !== q.correct;
          return (
            <button key={i} type="button" onClick={() => choose(i)} disabled={answered && !right && !wrong}
              style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 12, fontSize: 16, minHeight: 48, cursor: answered ? 'default' : 'pointer', border: `2px solid ${right ? 'var(--ok)' : wrong ? 'var(--bad)' : 'var(--line, #ddd)'}`, background: right ? 'var(--ok-soft)' : wrong ? 'var(--bad-soft)' : 'var(--surface, #fff)' }}>
              <strong style={{ marginRight: 10 }}>{String.fromCharCode(65 + i)}</strong>{o}{right ? ' (correct)' : ''}{wrong ? ' (your answer)' : ''}
            </button>
          );
        })}
      </div>
      {answered && q.explanation && <Notice icon="info"><span className="pre">{q.explanation}</span></Notice>}
      {answered && <div><Button onClick={next}>{pos + 1 >= total ? 'See my score' : 'Next question'}</Button></div>}
    </Card>
  );
}

export default function Practice() {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const list = useLive(`users/${user.uid}/practice`);
  const [view, setView] = useState({ name: 'list' });
  const sets = (list.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (view.name === 'new') return <Create onCancel={() => setView({ name: 'list' })} onDone={(id) => { toast('Ready. Good luck.'); setView({ name: 'play', id }); }} />;
  if (view.name === 'play') {
    const set = sets.find((s) => s.id === view.id);
    if (!set) return list.loading ? <PageSkeleton rows={2} /> : <Empty art="search" title="Set not found" text="It may have been deleted."><Button onClick={() => setView({ name: 'list' })}>Back</Button></Empty>;
    const save = (h) => db.update(`users/${user.uid}/practice/${set.id}`, { history: [...(set.history || []), h].slice(-20) }).catch(fail);
    return <Play key={set.id} set={set} onExit={() => setView({ name: 'list' })} onSave={save} />;
  }
  const remove = async (s) => {
    if (!(await confirm(`Delete "${s.title}"?`, { title: 'Delete practice set', confirmLabel: 'Delete', danger: true }))) return;
    try { await db.del(`users/${user.uid}/practice/${s.id}`); toast('Deleted'); } catch (e) { fail(e); }
  };
  return (
    <div className="stack">
      <div className="row wrap"><Button icon="plus" onClick={() => setView({ name: 'new' })}>New practice set</Button><AddWithCode kind="practice" /></div>
      {list.loading ? <PageSkeleton rows={2} /> : list.error ? <ErrorBlock error={list.error} /> : sets.length === 0 ? (
        <Empty art="test" title="No practice sets yet" text="Paste your notes and get private practice questions. Teachers never see them." />
      ) : (
        <Card className="list-card">
          {sets.map((s) => {
            const last = (s.history || [])[(s.history || []).length - 1];
            return (
              <div className="item-row" style={{ flexWrap: 'wrap' }} key={s.id}>
                <button type="button" className="row grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer', color: 'inherit', minWidth: 0, flex: '1 1 210px' }} onClick={() => setView({ name: 'play', id: s.id })}>
                  <span className="grow">
                    <strong className="break">{s.title}</strong>
                    <span className="muted small" style={{ display: 'block' }}>{[plural(s.questions.length, 'question'), s.subject, fmtDate(s.createdAt)].filter(Boolean).join(', ')}</span>
                  </span>
                  {last ? <Badge tone={last.score / last.total >= 0.7 ? 'ok' : ''}>Last {Math.round((last.score / last.total) * 100)}%</Badge> : <Badge>New</Badge>}
                </button>
                <div className="row" style={{ gap: 2 }}><ShareButton kind="practice" item={s} />
                <Button size="sm" variant="ghost" onClick={() => remove(s)}>Delete</Button></div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

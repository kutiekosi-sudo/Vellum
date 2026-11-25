import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive, useAsync } from '../../lib/hooks.js';
import { cbt } from '../../lib/api.js';
import { href } from '../../lib/router.js';
import { fmtClock, fmtDateTime, plural } from '../../lib/util.js';
import { Badge, Button, Card, Empty, ErrorBlock, Notice, PageSkeleton, Progress, useConfirm } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

// ---------- list of published CBTs ----------
export function StudentCbts({ cls }) {
  const list = useLive(`classes/${cls.id}/cbts`, { where: [['published', '==', true]] });
  const items = (list.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const ids = items.map((c) => c.id).join(',');
  const mine = useAsync(() => (ids ? cbt('myResults', { classId: cls.id, cbtIds: ids.split(',') }) : Promise.resolve({ cbts: [] })), [cls.id, ids]);
  const byId = Object.fromEntries(((mine.data && mine.data.cbts) || []).map((r) => [r.cbtId, r]));
  if (list.loading) return <PageSkeleton rows={2} />;
  if (list.error) return <ErrorBlock error={list.error} />;
  if (!items.length) return <Empty art="test" title="No CBTs yet" text="When your teacher publishes a test, it will show up here." />;
  const now = Date.now();
  return (
    <Card className="list-card">
      {items.map((c) => {
        const r = byId[c.id];
        const used = r ? r.attemptsUsed : 0;
        const max = c.maxAttempts || 1;
        const notOpen = c.opensAt && now < c.opensAt;
        const closed = c.closesAt && now > c.closesAt;
        let badge = <Badge tone="ok">Open</Badge>;
        if (r && r.inProgress) badge = <Badge tone="info">In progress</Badge>;
        else if (notOpen) badge = <Badge>Opens {fmtDateTime(c.opensAt)}</Badge>;
        else if (used >= max) badge = <Badge>Done</Badge>;
        else if (closed) badge = <Badge tone="warn">Closed</Badge>;
        return (
          <div className="item-row" key={c.id}>
            <a className="row grow" style={{ textDecoration: 'none', color: 'inherit', minWidth: 0 }} href={href(`/class/${cls.id}/cbts/${c.id}`)}>
              <span className="ic"><Icon name="clipboard" /></span>
              <span className="grow">
                <strong className="break">{c.title}</strong>
                <span className="muted small" style={{ display: 'block' }}>
                  {[plural((c.questionCount || 0) + (c.theoryCount || 0), 'question'), c.timeLimitMin ? `${c.timeLimitMin} min` : 'untimed', closed ? '' : c.closesAt ? `closes ${fmtDateTime(c.closesAt)}` : ''].filter(Boolean).join(', ')}
                </span>
              </span>
              {badge}
            </a>
          </div>
        );
      })}
    </Card>
  );
}

// ---------- one CBT: intro, exam, results ----------
export function StudentCbt({ cls, tid }) {
  const meta = useLive(`classes/${cls.id}/cbts/${tid}`);
  const mine = useAsync(() => cbt('myResults', { classId: cls.id, cbtIds: [tid] }), [cls.id, tid]);
  const [session, setSession] = useState(null); // the started attempt
  const [justDone, setJustDone] = useState(null);
  const back = <a className="btn ghost sm" href={href(`/class/${cls.id}/cbts`)}><Icon name="left" />CBTs</a>;

  if (meta.loading || mine.loading) return <PageSkeleton rows={3} />;
  if (meta.error || mine.error) return <ErrorBlock error={meta.error || mine.error} onRetry={mine.reload} />;
  if (!meta.data || !meta.data.published) return <Empty art="search" title="CBT not found" text="It may not be published yet, or it was removed.">{back}</Empty>;
  const m = meta.data;
  const rec = (mine.data.cbts || [])[0] || { attemptsUsed: 0, results: [] };

  if (session) {
    return <Exam cls={cls} tid={tid} meta={m} session={session} onDone={(res) => { setSession(null); setJustDone(res); mine.reload(); }} />;
  }
  return <Intro cls={cls} tid={tid} meta={m} rec={rec} justDone={justDone} back={back} onStart={setSession} />;
}

function Intro({ cls, tid, meta, rec, justDone, back, onStart }) {
  const { fail } = useApp();
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const max = meta.maxAttempts || 1;
  const notOpen = meta.opensAt && now < meta.opensAt;
  const closed = meta.closesAt && now > meta.closesAt;
  const resuming = !!rec.inProgress;
  const canStart = !notOpen && (resuming || (!closed && rec.attemptsUsed < max));
  const results = rec.results || [];

  const start = async () => {
    setBusy(true);
    try {
      // Ask for fullscreen inside the tap, before anything async, so the browser allows it.
      try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* optional */ }
      const data = await cbt('start', { classId: cls.id, cbtId: tid });
      onStart({ ...data, clockOffset: data.serverNow - Date.now() });
    } catch (e) {
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
      fail(e); setBusy(false);
    }
  };

  return (
    <div className="stack lg">
      <div>{back}</div>
      <div>
        <h2 className="break" style={{ fontSize: 28 }}>{meta.title}</h2>
        {meta.topic && <p className="muted">{meta.topic}</p>}
      </div>
      {justDone && <ResultCard r={justDone} headline="Submitted" />}
      <Card className="stack">
        <h2 className="h-sm">Before you start</h2>
        <ul className="stack sm" style={{ paddingLeft: 20, margin: 0 }}>
          <li>{plural((meta.questionCount || 0), 'multiple-choice question')}{meta.theoryCount ? ` and ${plural(meta.theoryCount, 'written question')}` : ''}, {meta.totalPoints || 0} marks in all.</li>
          <li>{meta.timeLimitMin ? `You have ${meta.timeLimitMin} minutes. The clock runs on the server, so leaving the page does not pause it.` : 'There is no time limit.'}</li>
          <li>{max === 1 ? 'You get one attempt.' : `You get ${max} attempts. You have used ${rec.attemptsUsed}.`}</li>
          <li>Your answers save as you go. If your connection drops, reopen this page to continue.</li>
          <li>The test opens full screen. Leaving the tab or the full screen is recorded and your teacher can see it. Copying and pasting is switched off.</li>
        </ul>
        {meta.description && <Notice icon="info"><span className="pre">{meta.description}</span></Notice>}
        {notOpen && <Notice tone="warn">This CBT opens {fmtDateTime(meta.opensAt)}.</Notice>}
        {closed && !resuming && <Notice tone="warn">This CBT closed {fmtDateTime(meta.closesAt)}.</Notice>}
        {!notOpen && !closed && !resuming && rec.attemptsUsed >= max && <Notice icon="check">You have used all your attempts.</Notice>}
        {canStart && <div><Button size="lg" loading={busy} onClick={start}>{resuming ? 'Continue your attempt' : 'Start the test'}</Button></div>}
      </Card>
      {results.length > 0 && (
        <div className="stack">
          <h3>Your results</h3>
          {results.slice().reverse().map((r, i) => <ResultCard key={r.attemptId} r={r} headline={results.length > 1 ? `Attempt ${results.length - i}` : 'Your result'} review />)}
        </div>
      )}
    </div>
  );
}

function ResultCard({ r, headline, review }) {
  if (r.hidden) {
    return <Card className="stack sm"><h3>{headline}</h3><Notice icon="clock">Your answers are in. Your teacher has chosen to show scores later.</Notice></Card>;
  }
  return (
    <Card className="stack">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h3>{headline}</h3>
        {r.autoSubmitted && <Badge tone="warn">Submitted when time ran out</Badge>}
      </div>
      <div className="row wrap" style={{ gap: 24 }}>
        <div><div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{r.pct}%</div><div className="muted small">{r.score} of {r.total} on multiple choice</div></div>
        <div className="muted small">{r.correctCount} correct, {r.incorrectCount} wrong, {r.missedCount} unanswered</div>
      </div>
      <Progress value={r.pct} label="Score" />
      {r.theory && r.theory.length > 0 && (
        <div className="stack sm">
          {r.theoryGraded
            ? <Notice tone="ok" icon="check">Written answers marked: {r.theoryScore} of {r.theoryTotal}. Overall {r.combinedPct}%.</Notice>
            : <Notice icon="clock">Your written answers are waiting for your teacher to mark.</Notice>}
          {r.theoryGraded && r.theory.map((t, i) => (
            <div key={t.id} className="stack sm"><strong>Question {i + 1}: {t.mark} of {t.marks}</strong>{t.feedback && <p className="pre muted">{t.feedback}</p>}</div>
          ))}
        </div>
      )}
      {review && r.review && <Review items={r.review} />}
    </Card>
  );
}

function Review({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack sm">
      <div><Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>{open ? 'Hide answers' : 'Review your answers'}</Button></div>
      {open && items.map((q, i) => (
        <div key={q.id} className="stack sm" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <strong className="break">{i + 1}. {q.text}</strong>
          {q.options.map((o, j) => (
            <div key={j} className="row" style={{ gap: 8 }}>
              <Icon name={j === q.correctIndex ? 'check' : j === q.chosen ? 'x' : 'minus'} />
              <span style={j === q.correctIndex ? { color: 'var(--ok)', fontWeight: 650 } : undefined}>{o}{j === q.chosen && j !== q.correctIndex ? ' (your answer)' : ''}{j === q.correctIndex ? ' (correct)' : ''}</span>
            </div>
          ))}
          {q.chosen == null && <span className="muted small">You did not answer this one.</span>}
          {q.explanation && <p className="muted pre">{q.explanation}</p>}
        </div>
      ))}
    </div>
  );
}

// ---------- the exam itself ----------
function Exam({ cls, tid, meta, session, onDone }) {
  const { fail } = useApp();
  const confirm = useConfirm();
  const [answers, setAnswers] = useState(session.answers || {});
  const [theory, setTheory] = useState(session.theoryAnswers || {});
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('saved'); // saved | saving | offline
  const [warn, setWarn] = useState('');
  const events = useRef([]);
  const state = useRef({ answers, theory });
  const submitting = useRef(false);
  state.current = { answers, theory };

  const qs = session.questions;
  const th = session.theory || [];
  const total = qs.length + th.length;
  const timed = (session.durationMin || 0) > 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.round((session.expiresAt - (now + session.clockOffset)) / 1000));

  const idxRef = useRef(0);
  idxRef.current = idx;
  const log = (k) => { events.current.push({ k, t: Date.now() + session.clockOffset, q: idxRef.current }); };

  // Save progress: every few seconds when something changed, and after each answer.
  const dirty = useRef(false);
  const flush = async () => {
    if (submitting.current) return;
    const pending = events.current.splice(0, 40);
    setSaved('saving');
    try {
      await cbt('progress', { classId: cls.id, cbtId: tid, attemptId: session.attemptId, answers: state.current.answers, theory: state.current.theory, events: pending });
      dirty.current = false; setSaved('saved');
    } catch (e) {
      events.current.unshift(...pending);
      setSaved('offline');
      if (e && (e.code === 'finished' || e.code === 'expired')) submit(true);
    }
  };
  useEffect(() => {
    const t = setInterval(() => { if (dirty.current || events.current.length) flush(); }, 6000);
    return () => clearInterval(t);
  }, []);

  const submit = async (auto) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true);
    try {
      const res = await cbt('submit', { classId: cls.id, cbtId: tid, attemptId: session.attemptId, answers: state.current.answers, theory: state.current.theory, events: events.current.splice(0, 40) });
      try { if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ignore */ }
      onDone(res);
    } catch (e) {
      submitting.current = false; setBusy(false);
      fail(e);
    }
  };
  const askSubmit = async () => {
    const blank = qs.filter((q) => answers[q.id] == null).length;
    const msg = blank ? `You have ${plural(blank, 'unanswered question')}. Hand in anyway?` : 'Hand in your test now? You cannot change your answers afterwards.';
    if (await confirm(msg, { title: 'Hand in', confirmLabel: 'Hand in' })) submit(false);
  };

  // Out of time: hand in whatever is saved.
  useEffect(() => { if (timed && left <= 0) submit(true); }, [left, timed]);

  // Integrity signals: recorded for the teacher to review, never an automatic penalty.
  useEffect(() => {
    const onVis = () => { if (document.hidden) { log('hidden'); setWarn('You left the test page. Your teacher can see this.'); } };
    const onBlur = () => { log('blur'); };
    const onFs = () => { if (!document.fullscreenElement) { log('fullscreen_exit'); setWarn('You left full screen. Your teacher can see this.'); } };
    const onCopy = (e) => { e.preventDefault(); log('copy'); };
    const onPaste = (e) => { e.preventDefault(); log('paste'); };
    const stopMenu = (e) => e.preventDefault();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', stopMenu);
    const beforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', stopMenu);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);

  const choose = (qid, i) => { dirty.current = true; setAnswers((a) => ({ ...a, [qid]: i })); setTimeout(flush, 50); };
  const type = (id, v) => { dirty.current = true; setTheory((a) => ({ ...a, [id]: v.slice(0, 6000) })); };

  const isTheory = idx >= qs.length;
  const q = isTheory ? null : qs[idx];
  const t = isTheory ? th[idx - qs.length] : null;
  const answered = useMemo(() => qs.filter((x) => answers[x.id] != null).length + th.filter((x) => (theory[x.id] || '').trim()).length, [answers, theory]);
  const urgent = timed && left <= 60;

  return (
    <div className="exam" style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--bg, #F4F3EE)', overflowY: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, background: 'var(--surface, #fff)', borderBottom: '1px solid var(--line, #ddd)', padding: '10px 16px', zIndex: 2 }}>
        <div className="row" style={{ justifyContent: 'space-between', maxWidth: 760, margin: '0 auto', gap: 12 }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <strong className="break" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.title}</strong>
            <span className="muted small">Question {idx + 1} of {total}, {answered} answered{saved === 'offline' ? ', offline: keep going, it will save when you reconnect' : ''}</span>
          </div>
          {timed && <Badge tone={urgent ? 'warn' : 'info'} className="exam-timer"><span aria-live="off" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtClock(left)}</span></Badge>}
        </div>
        <div style={{ maxWidth: 760, margin: '8px auto 0' }}><Progress value={(answered / Math.max(1, total)) * 100} label="Answered" /></div>
      </div>

      <div className="stack lg" style={{ maxWidth: 760, margin: '0 auto', padding: 16, userSelect: 'none', WebkitUserSelect: 'none' }}>
        {warn && <Notice tone="warn">{warn} <Button variant="ghost" size="sm" onClick={() => { setWarn(''); try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch { /* ignore */ } }}>Dismiss</Button></Notice>}

        {q && (
          <Card className="stack">
            <h2 className="break" style={{ fontSize: 20 }}>{q.text}</h2>
            <div className="stack sm" role="radiogroup" aria-label="Answers">
              {q.options.map((o, i) => {
                const on = answers[q.id] === i;
                return (
                  <button key={i} type="button" role="radio" aria-checked={on} onClick={() => choose(q.id, i)}
                    style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 12, border: `2px solid ${on ? 'var(--accent, #1F5C4D)' : 'var(--line, #ddd)'}`, background: on ? 'var(--accent-soft, #e8f1ee)' : 'var(--surface, #fff)', fontSize: 16, cursor: 'pointer', minHeight: 48 }}>
                    <strong style={{ marginRight: 10 }}>{String.fromCharCode(65 + i)}</strong>{o}
                  </button>
                );
              })}
            </div>
            {answers[q.id] != null && <div><Button variant="ghost" size="sm" onClick={() => { dirty.current = true; setAnswers((a) => { const c = { ...a }; delete c[q.id]; return c; }); }}>Clear my answer</Button></div>}
          </Card>
        )}

        {t && (
          <Card className="stack">
            <div className="muted small">Written question, {t.marks} marks</div>
            <h2 className="break pre" style={{ fontSize: 20 }}>{t.text}</h2>
            <textarea rows={9} value={theory[t.id] || ''} onChange={(e) => type(t.id, e.target.value)} onBlur={flush}
              aria-label="Your answer" style={{ width: '100%', padding: 12, borderRadius: 12, border: '2px solid var(--line, #ddd)', font: 'inherit', userSelect: 'text' }} />
          </Card>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Back</Button>
          {idx < total - 1 ? <Button onClick={() => setIdx(idx + 1)}>Next</Button> : <Button loading={busy} onClick={askSubmit}>Hand in</Button>}
        </div>

        <Card className="stack sm">
          <div className="muted small">Jump to a question</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {Array.from({ length: total }, (_, i) => {
              const done = i < qs.length ? answers[qs[i].id] != null : !!(theory[th[i - qs.length].id] || '').trim();
              return (
                <button key={i} type="button" onClick={() => setIdx(i)} aria-label={`Question ${i + 1}${done ? ', answered' : ''}`} aria-current={i === idx ? 'true' : undefined}
                  style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${i === idx ? 'var(--ink, #222)' : 'var(--line, #ddd)'}`, background: done ? 'var(--accent-soft, #e8f1ee)' : 'var(--surface, #fff)', fontWeight: 650, cursor: 'pointer' }}>{i + 1}</button>
              );
            })}
          </div>
          <div><Button variant="ghost" size="sm" loading={busy} onClick={askSubmit}>Hand in now</Button></div>
        </Card>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive, useAsync } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { cbt } from '../../lib/api.js';
import { href } from '../../lib/router.js';
import { toLocalInput, fromLocalInput } from '../../lib/util.js';
import { Badge, Button, Card, Check, Empty, ErrorBlock, Notice, PageSkeleton, SectionTitle, SelectField, TextArea, TextField } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';
import { AddQuestions, McqCard, TheoryCard, blankMcq, blankTheory, mcqProblem, theoryProblem, withKey } from './CbtQuestions.jsx';

// Students can take a published CBT once the student test screen ships; until then publishing stays off.
export const PUBLISH_READY = false;

function Editor({ cls, tid, meta, initial }) {
  const { fail, toast } = useApp();
  const [s, setS] = useState({
    title: meta.title || '', topic: meta.topic || '', description: meta.description || '',
    timeLimitMin: String(meta.timeLimitMin ?? 0), maxAttempts: String(meta.maxAttempts || 1),
    opensAt: toLocalInput(meta.opensAt), closesAt: toLocalInput(meta.closesAt),
    shuffleQuestions: meta.shuffleQuestions !== false, shuffleOptions: meta.shuffleOptions !== false,
    resultsVisibility: meta.resultsVisibility || 'immediate', showReview: meta.showReview !== false, showExplanations: meta.showExplanations !== false,
  });
  const [qs, setQs] = useState(initial.questions.map(withKey));
  const [th, setTh] = useState(initial.theory.map(withKey));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const mark = (fn) => (...a) => { setDirty(true); return fn(...a); };
  const set = (k) => (e) => { setDirty(true); setS({ ...s, [k]: e.target.value }); };
  const tog = (k) => (v) => { setDirty(true); setS({ ...s, [k]: v }); };

  const move = (list, setList, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const c = [...list]; [c[i], c[j]] = [c[j], c[i]]; setList(c); };
  const addBatch = mark(({ questions, theory }) => {
    setQs((cur) => [...cur, ...(questions || []).map((q) => withKey({ points: 1, explanation: '', topic: '', skill: '', ...q, options: [...(q.options || [])] }))]);
    setTh((cur) => [...cur, ...(theory || []).map((q) => withKey({ marks: 5, guide: '', topic: '', ...q }))]);
  });

  const totalMarks = qs.reduce((n, q) => n + (Number(q.points) || 1), 0) + th.reduce((n, q) => n + (Number(q.marks) || 5), 0);

  const save = async () => {
    setShowErrors(true);
    if (!s.title.trim()) { toast('Give the CBT a title first.', 'error'); return false; }
    if (qs.some((q) => mcqProblem(q)) || th.some((q) => theoryProblem(q))) { toast('Some questions need fixing. They are marked in red.', 'error'); return false; }
    const open = fromLocalInput(s.opensAt); const close = fromLocalInput(s.closesAt);
    if (open && close && close <= open) { toast('The closing time must be after the opening time.', 'error'); return false; }
    setBusy(true);
    try {
      let questions = qs; let theory = th;
      if (qs.length || th.length) {
        const res = await cbt('saveQuestions', {
          classId: cls.id, cbtId: tid,
          questions: qs.map(({ id, text, options, correct, points, explanation, topic, skill }) => ({ id, text, options, correct, points: Number(points) || 1, explanation, topic, skill })),
          theory: th.map(({ id, text, marks, guide, topic }) => ({ id, text, marks: Number(marks) || 5, guide, topic })),
        });
        // Keep what the server cleaned (it assigns ids and trims blank options), but keep the AI-draft marker.
        const flags = new Map(qs.map((q) => [q._k, q.aiDraft]));
        questions = res.questions.map((q, i) => ({ ...withKey(q), aiDraft: flags.get(qs[i] && qs[i]._k) }));
        theory = res.theory.map((q, i) => ({ ...withKey(q), aiDraft: flags.get(th[i] && th[i]._k) }));
        setQs(questions); setTh(theory);
      }
      await db.update(`classes/${cls.id}/cbts/${tid}`, {
        title: s.title.trim(), topic: s.topic.trim(), description: s.description.trim(),
        timeLimitMin: Math.max(0, Math.min(300, Math.round(Number(s.timeLimitMin) || 0))),
        maxAttempts: Math.max(1, Math.min(3, Math.round(Number(s.maxAttempts) || 1))),
        opensAt: open, closesAt: close,
        shuffleQuestions: s.shuffleQuestions, shuffleOptions: s.shuffleOptions,
        resultsVisibility: s.resultsVisibility, showReview: s.showReview, showExplanations: s.showExplanations,
        questionCount: questions.length, theoryCount: theory.length,
        totalPoints: questions.reduce((n, q) => n + (Number(q.points) || 1), 0) + theory.reduce((n, q) => n + (Number(q.marks) || 5), 0),
        updatedAt: Date.now(),
      });
      setDirty(false); toast('Saved');
      return true;
    } catch (e) { fail(e); return false; } finally { setBusy(false); }
  };

  const del = (list, setList, i) => { setDirty(true); setList(list.filter((_, j) => j !== i)); };
  const dup = (list, setList, i) => { setDirty(true); const c = [...list]; c.splice(i + 1, 0, withKey({ ...list[i], id: undefined, aiDraft: false })); setList(c); };

  return (
    <div className="stack lg">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow">
          <a className="btn ghost sm" href={href(`/class/${cls.id}/cbts`)}><Icon name="left" />CBTs</a>
          <h1 className="break" style={{ fontSize: 26 }}>{s.title || 'Untitled CBT'}</h1>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <Badge>{qs.length} multiple-choice</Badge>{th.length > 0 && <Badge>{th.length} written</Badge>}<Badge>{totalMarks} marks</Badge>
            <Badge tone={meta.published ? 'ok' : 'warn'}>{meta.published ? 'Published' : 'Draft'}</Badge>
            {dirty && <Badge tone="info">Unsaved changes</Badge>}
          </div>
        </div>
        <div className="row wrap"><Button loading={busy} onClick={save}>Save</Button></div>
      </div>

      <Card className="stack">
        <h3>Settings</h3>
        <TextField label="Title" value={s.title} onChange={set('title')} maxLength={140} autoComplete="off" />
        <div className="grid cols-2">
          <TextField label="Topic (optional)" value={s.topic} onChange={set('topic')} maxLength={80} autoComplete="off" />
          <TextField label="Time limit in minutes (0 for none)" type="number" inputMode="numeric" min="0" max="300" value={s.timeLimitMin} onChange={set('timeLimitMin')} />
        </div>
        <TextArea label="Instructions for students (optional)" rows={2} value={s.description} onChange={set('description')} maxLength={1000} />
        <div className="grid cols-2">
          <TextField label="Opens (optional)" type="datetime-local" value={s.opensAt} onChange={set('opensAt')} />
          <TextField label="Closes (optional)" type="datetime-local" value={s.closesAt} onChange={set('closesAt')} />
        </div>
        <div className="grid cols-2">
          <SelectField label="Attempts allowed" value={s.maxAttempts} onChange={set('maxAttempts')}><option value="1">One attempt</option><option value="2">Two attempts</option><option value="3">Three attempts</option></SelectField>
          <SelectField label="Students see their score" value={s.resultsVisibility} onChange={set('resultsVisibility')}>
            <option value="immediate">Right after they finish</option><option value="after_close">After the CBT closes</option><option value="released_by_teacher">When I release results</option>
          </SelectField>
        </div>
        <Check label="Shuffle the order of questions" checked={s.shuffleQuestions} onChange={tog('shuffleQuestions')} />
        <Check label="Shuffle the answer options" checked={s.shuffleOptions} onChange={tog('shuffleOptions')} />
        <Check label="Let students review their answers afterwards" checked={s.showReview} onChange={tog('showReview')} />
        <Check label="Show explanations in the review" checked={s.showExplanations} onChange={tog('showExplanations')} />
      </Card>

      <AddQuestions cls={cls} onAdd={addBatch} onBlankMcq={mark(() => setQs((c) => [...c, blankMcq()]))} onBlankTheory={mark(() => setTh((c) => [...c, blankTheory()]))} />

      <SectionTitle title={`Multiple-choice questions (${qs.length})`} />
      {qs.length === 0 ? <Empty art="test" title="No multiple-choice questions yet" text="Add some above." /> : qs.map((q, i) => (
        <McqCard key={q._k} q={q} i={i} n={qs.length} showErrors={showErrors}
          onChange={mark((nq) => setQs(qs.map((x, j) => (j === i ? nq : x))))} onMove={mark((d) => move(qs, setQs, i, d))} onDup={() => dup(qs, setQs, i)} onDel={() => del(qs, setQs, i)} />
      ))}

      {(th.length > 0 || qs.length > 0) && <SectionTitle title={`Written (theory) questions (${th.length})`} />}
      {th.map((q, i) => (
        <TheoryCard key={q._k} q={q} i={i} n={th.length} showErrors={showErrors}
          onChange={mark((nq) => setTh(th.map((x, j) => (j === i ? nq : x))))} onMove={mark((d) => move(th, setTh, i, d))} onDup={() => dup(th, setTh, i)} onDel={() => del(th, setTh, i)} />
      ))}

      <Card className="stack">
        <h3>Publishing</h3>
        {PUBLISH_READY
          ? <p className="muted">Publish when you are happy with the questions. Students are told as soon as it is live.</p>
          : <Notice icon="clock">Publishing switches on with the student test screen, which is the next update. Until then you can build, import and save your CBTs.</Notice>}
        <div><Button disabled={!PUBLISH_READY}>Publish</Button></div>
      </Card>
    </div>
  );
}

export default function CbtEditor({ cls, tid }) {
  const meta = useLive(`classes/${cls.id}/cbts/${tid}`);
  const qdoc = useAsync(() => cbt('getQuestions', { classId: cls.id, cbtId: tid }), [cls.id, tid]);
  const back = <a className="btn ghost sm" href={href(`/class/${cls.id}/cbts`)}><Icon name="left" />CBTs</a>;
  if (meta.loading || qdoc.loading) return <PageSkeleton rows={3} />;
  if (meta.error || qdoc.error) return <ErrorBlock error={meta.error || qdoc.error} onRetry={qdoc.reload} />;
  if (!meta.data) return <Empty art="search" title="CBT not found" text="It may have been deleted.">{back}</Empty>;
  return <Editor cls={cls} tid={tid} meta={meta.data} initial={{ questions: qdoc.data.questions || [], theory: qdoc.data.theory || [] }} />;
}

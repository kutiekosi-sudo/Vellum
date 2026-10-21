// The pieces of the CBT editor that deal with questions: cards for multiple-choice and theory questions,
// pasting an existing paper, and asking the AI to draft questions from notes.
import { useMemo, useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { ai } from '../../lib/api.js';
import { parsePaper } from '../../lib/paperParser.js';
import { Badge, Button, Card, Check, IconButton, Notice, SelectField, TextArea, TextField, Seg } from '../../ui/kit.jsx';
import { AttachmentPicker } from '../../ui/Attachments.jsx';
import { Icon } from '../../ui/icons.jsx';

const LETTERS = 'ABCDEF';
export const blankMcq = () => ({ _k: Math.random().toString(36).slice(2), text: '', options: ['', '', '', ''], correct: -1, points: 1, explanation: '', topic: '', skill: '' });
export const blankTheory = () => ({ _k: Math.random().toString(36).slice(2), text: '', marks: 5, guide: '', topic: '' });
export const withKey = (q) => ({ _k: Math.random().toString(36).slice(2), ...q });

export function mcqProblem(q) {
  if (!q.text.trim()) return 'Write the question.';
  if (q.options.filter((o) => o.trim()).length < 2) return 'Give at least two answer options.';
  if (q.correct < 0 || !q.options[q.correct] || !q.options[q.correct].trim()) return 'Choose the correct answer.';
  return '';
}
export const theoryProblem = (q) => (q.text.trim() ? '' : 'Write the question.');

function Move({ i, n, onMove, onDup, onDel, label }) {
  return (
    <div className="row" style={{ gap: 2 }}>
      <IconButton icon="up" label={`Move ${label} up`} size="sm" disabled={i === 0} onClick={() => onMove(-1)} />
      <IconButton icon="down" label={`Move ${label} down`} size="sm" disabled={i === n - 1} onClick={() => onMove(1)} />
      <IconButton icon="copy" label={`Duplicate ${label}`} size="sm" onClick={onDup} />
      <IconButton icon="trash" label={`Delete ${label}`} size="sm" onClick={onDel} />
    </div>
  );
}

export function McqCard({ q, i, n, onChange, onMove, onDup, onDel, showErrors }) {
  const problem = showErrors ? mcqProblem(q) : '';
  const set = (patch) => onChange({ ...q, ...patch });
  const setOpt = (idx, v) => set({ options: q.options.map((o, j) => (j === idx ? v : o)) });
  const addOpt = () => q.options.length < 6 && set({ options: [...q.options, ''] });
  const delOpt = (idx) => {
    if (q.options.length <= 2) return;
    set({ options: q.options.filter((_, j) => j !== idx), correct: q.correct === idx ? -1 : q.correct > idx ? q.correct - 1 : q.correct });
  };
  return (
    <Card className="stack" style={problem ? { borderColor: 'var(--bad, #B3402F)' } : undefined}>
      <div className="row">
        <strong className="grow">Question {i + 1}</strong>
        {q.aiDraft && <Badge tone="info" icon="bulb">AI draft, check it</Badge>}
        <Move i={i} n={n} label={`question ${i + 1}`} onMove={onMove} onDup={onDup} onDel={onDel} />
      </div>
      <TextArea label="Question" rows={2} value={q.text} onChange={(e) => set({ text: e.target.value })} maxLength={2000} />
      <fieldset className="stack sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small strong" style={{ marginBottom: 6 }}>Answer options. Tap the circle beside the correct one.</legend>
        {q.options.map((o, idx) => (
          <div className="row" key={idx}>
            <input type="radio" name={`correct-${q._k}`} checked={q.correct === idx} onChange={() => set({ correct: idx })} aria-label={`Option ${LETTERS[idx]} is correct`} style={{ width: 22, height: 22, accentColor: 'var(--brand)', flex: 'none' }} />
            <span className="strong" aria-hidden="true" style={{ width: 18 }}>{LETTERS[idx]}</span>
            <input className="input grow" value={o} onChange={(e) => setOpt(idx, e.target.value)} placeholder={`Option ${LETTERS[idx]}`} aria-label={`Option ${LETTERS[idx]} text`} maxLength={500} />
            {q.options.length > 2 && <IconButton icon="x" label={`Remove option ${LETTERS[idx]}`} size="sm" onClick={() => delOpt(idx)} />}
          </div>
        ))}
        {q.options.length < 6 && <div><Button size="sm" variant="ghost" icon="plus" onClick={addOpt}>Add option</Button></div>}
      </fieldset>
      <div className="grid cols-2">
        <TextField label="Points" type="number" inputMode="numeric" min="1" max="10" value={q.points} onChange={(e) => set({ points: e.target.value })} />
        <TextField label="Topic (optional)" value={q.topic} onChange={(e) => set({ topic: e.target.value })} maxLength={80} />
      </div>
      <TextArea label="Explanation shown after the test (optional)" rows={2} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} maxLength={2000} />
      {problem && <div className="err" role="alert">{problem}</div>}
    </Card>
  );
}

export function TheoryCard({ q, i, n, onChange, onMove, onDup, onDel, showErrors }) {
  const problem = showErrors ? theoryProblem(q) : '';
  const set = (patch) => onChange({ ...q, ...patch });
  return (
    <Card className="stack" style={problem ? { borderColor: 'var(--bad, #B3402F)' } : undefined}>
      <div className="row">
        <strong className="grow">Theory question {i + 1}</strong>
        {q.aiDraft && <Badge tone="info" icon="bulb">AI draft, check it</Badge>}
        <Move i={i} n={n} label={`theory question ${i + 1}`} onMove={onMove} onDup={onDup} onDel={onDel} />
      </div>
      <TextArea label="Question" rows={3} value={q.text} onChange={(e) => set({ text: e.target.value })} maxLength={3000} />
      <div className="grid cols-2">
        <TextField label="Marks" type="number" inputMode="numeric" min="1" max="50" value={q.marks} onChange={(e) => set({ marks: e.target.value })} />
        <TextField label="Topic (optional)" value={q.topic} onChange={(e) => set({ topic: e.target.value })} maxLength={80} />
      </div>
      <TextArea label="Marking guide (only you see this)" rows={3} value={q.guide} onChange={(e) => set({ guide: e.target.value })} maxLength={3000} hint="The points a good answer should include. It helps you mark quickly and consistently." />
      {problem && <div className="err" role="alert">{problem}</div>}
    </Card>
  );
}

// ---------- paste a paper you already have ----------
export function PastePanel({ onAdd }) {
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState(null);
  const read = () => setResult(parsePaper(raw));
  const found = result ? result.questions.length + result.theory.length : 0;
  return (
    <div className="stack">
      <p className="muted small">Paste a question paper and its answers straight from Word, a PDF or a chat. Learnr reads numbered questions, A to D options and answers written as "Answer: B" or as a key at the end. Nothing is sent to the AI.</p>
      <TextArea label="Your question paper" rows={9} value={raw} onChange={(e) => { setRaw(e.target.value); setResult(null); }} placeholder={'1. What is the powerhouse of the cell?\nA. Nucleus\nB. Mitochondria\nC. Ribosome\nD. Golgi body\nAnswer: B'} maxLength={60000} />
      <div><Button variant="secondary" disabled={!raw.trim()} onClick={read}>Read my paper</Button></div>
      {result && (found === 0 ? (
        <Notice tone="warn">We could not find any numbered questions. Put each question on its own line starting with a number, like "1. ...", and each option on its own line starting with A, B, C or D.</Notice>
      ) : (
        <div className="stack sm">
          <Notice tone="ok">Found {result.questions.length} multiple-choice and {result.theory.length} written question{found === 1 ? '' : 's'}.</Notice>
          {result.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
          <div><Button onClick={() => { onAdd({ questions: result.questions, theory: result.theory }); setRaw(''); setResult(null); }}>Add {found} to this CBT</Button></div>
        </div>
      ))}
    </div>
  );
}

// ---------- AI from notes ----------
export function AiPanel({ cls, onAdd }) {
  const { fail, toast } = useApp();
  const resources = useLive(`classes/${cls.id}/resources`);
  const existing = useMemo(() => {
    const out = [];
    for (const r of resources.data || []) for (const a of r.attachments || []) if (a.kind === 'file') out.push({ ...a, from: r.title });
    return out;
  }, [resources.data]);
  const [ticked, setTicked] = useState([]);
  const [uploaded, setUploaded] = useState([]);
  const [notes, setNotes] = useState('');
  const [prompt, setPrompt] = useState('');
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState(cls.level || '');
  const [difficulty, setDifficulty] = useState('mixed');
  const [mcq, setMcq] = useState(10);
  const [theory, setTheory] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const fileIds = [...new Set([...ticked, ...uploaded.map((f) => f.id)])];
  const generate = async () => {
    if (!fileIds.length && !notes.trim() && !topic.trim() && !prompt.trim()) { setErr('Add some notes, tick a file, or tell the AI what to write about.'); return; }
    setErr(''); setBusy(true);
    const base = { classId: cls.id, fileIds, instructions: prompt.trim(), topic: topic.trim(), notes: notes.trim(), difficulty, level: level.trim(), className: cls.name, subject: cls.subject || '' };
    try {
      const qs = Number(mcq) > 0 ? await ai('teacher_generate', { ...base, kind: 'cbt_questions', count: Number(mcq) }) : { data: [] };
      const th = Number(theory) > 0 ? await ai('teacher_generate', { ...base, kind: 'theory_questions', count: Number(theory) }) : { data: [] };
      const questions = (Array.isArray(qs.data) ? qs.data : []).map((q) => ({ ...q, aiDraft: true }));
      const tq = (Array.isArray(th.data) ? th.data : []).map((q) => ({ ...q, aiDraft: true }));
      if (!questions.length && !tq.length) { setErr('The AI did not return any questions. Try again, or give it a little more to work with.'); setBusy(false); return; }
      onAdd({ questions, theory: tq });
      toast(`Added ${questions.length + tq.length} AI drafts. Please check each one.`);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const tick = (id, on) => setTicked(on ? [...ticked, id] : ticked.filter((x) => x !== id));
  return (
    <div className="stack">
      <p className="muted small">Give the AI your notes and, if you like, your own instructions. It drafts questions at your class level. Nothing reaches students until you check it and publish.</p>
      {existing.length > 0 && (
        <fieldset className="stack sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small strong" style={{ marginBottom: 6 }}>Use files already in this class</legend>
          {existing.map((f) => <Check key={f.id} label={f.name} hint={`From the resource "${f.from}"`} checked={ticked.includes(f.id)} onChange={(v) => tick(f.id, v)} />)}
        </fieldset>
      )}
      <div className="field"><label>Upload notes (PDF, photo or text file)</label>
        <AttachmentPicker value={uploaded} onChange={setUploaded} classId={cls.id} context="resource" allowLinks={false} label="Upload" /></div>
      <TextArea label="Or paste your notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={12000} />
      <TextArea label="Your instructions to the AI (optional)" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1500} placeholder="e.g. Focus on chapter 3, use Nigerian examples, make the last five questions about calculations" />
      <div className="grid cols-2">
        <TextField label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={120} />
        <TextField label="Class level" value={level} onChange={(e) => setLevel(e.target.value)} maxLength={40} hint="Sets how hard the questions are." />
      </div>
      <div className="grid cols-3">
        <SelectField label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="easy">Easy</option><option value="mixed">Balanced</option><option value="hard">Hard</option><option value="exam">Like an exam</option>
        </SelectField>
        <TextField label="Multiple-choice" type="number" inputMode="numeric" min="0" max="20" value={mcq} onChange={(e) => setMcq(e.target.value)} />
        <TextField label="Written (theory)" type="number" inputMode="numeric" min="0" max="10" value={theory} onChange={(e) => setTheory(e.target.value)} />
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <div><Button icon="bulb" loading={busy} onClick={generate}>{busy ? 'Drafting, this can take a minute' : 'Draft questions'}</Button></div>
    </div>
  );
}

export function AddQuestions({ cls, onAdd, onBlankMcq, onBlankTheory }) {
  const [mode, setMode] = useState('ai');
  return (
    <Card className="stack">
      <h3>Add questions</h3>
      <Seg label="How to add questions" value={mode} onChange={setMode} options={[{ value: 'ai', label: 'AI from notes' }, { value: 'paste', label: 'Paste a paper' }, { value: 'write', label: 'Write them' }]} />
      {mode === 'ai' && <AiPanel cls={cls} onAdd={onAdd} />}
      {mode === 'paste' && <PastePanel onAdd={onAdd} />}
      {mode === 'write' && (
        <div className="row wrap">
          <Button variant="secondary" icon="plus" onClick={onBlankMcq}>Multiple-choice question</Button>
          <Button variant="secondary" icon="plus" onClick={onBlankTheory}>Written (theory) question</Button>
        </div>
      )}
    </Card>
  );
}

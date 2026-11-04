import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { LEVELS, bankPath, filterBank, fromBank, saveToBank, toBank, validBank } from '../lib/qbank.js';
import { PastePanel } from './class/CbtQuestions.jsx';
import { Badge, Button, Card, Check, Empty, Notice, PageSkeleton, SelectField, TextArea, TextField, useConfirm } from '../ui/kit.jsx';

const LETTERS = 'ABCDEF';
const blank = () => ({ kind: 'mcq', text: '', options: ['', '', '', ''], correct: -1, points: 1, explanation: '', marks: 5, guide: '', topic: '', subject: '', difficulty: 'medium' });

export function useBank() {
  const { user } = useApp();
  const live = useLive(bankPath(user.uid));
  const list = useMemo(() => [...(live.data || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [live.data]);
  return { loading: live.loading, list };
}

function Filters({ f, setF, subjects }) {
  return (
    <div className="stack sm">
      <TextField label="Search questions" type="search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="A word from the question or its topic" autoComplete="off" />
      <div className="row wrap" style={{ gap: 10 }}>
        <SelectField label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} className="grow"><option value="">All</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</SelectField>
        <SelectField label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="grow"><option value="">All</option><option value="mcq">Multiple choice</option><option value="theory">Written</option></SelectField>
        <SelectField label="Level" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })} className="grow"><option value="">All</option>{LEVELS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}</SelectField>
      </div>
    </div>
  );
}

const noFilter = { q: '', subject: '', kind: '', difficulty: '' };

// Pick questions from the bank and hand them to a test being built.
export function BankPicker({ onAdd }) {
  const bank = useBank();
  const [f, setF] = useState(noFilter);
  const [pick, setPick] = useState([]);
  if (bank.loading) return <PageSkeleton rows={2} />;
  if (!bank.list.length) return <Notice icon="info">Your question bank is empty. Save questions from the Questions tab on the Calendar page, or use "Save these to my bank" below once a test has questions.</Notice>;
  const subjects = [...new Set(bank.list.map((b) => b.subject).filter(Boolean))].sort();
  const shown = filterBank(bank.list, f);
  const add = () => {
    const chosen = bank.list.filter((b) => pick.includes(b.id));
    onAdd({ questions: chosen.filter((b) => b.kind === 'mcq').map(fromBank), theory: chosen.filter((b) => b.kind === 'theory').map(fromBank) });
    setPick([]);
  };
  return (
    <div className="stack">
      <Filters f={f} setF={setF} subjects={subjects} />
      <div className="stack sm" aria-label="Bank questions">
        {shown.slice(0, 60).map((b) => (
          <Check key={b.id} label={<span><strong className="break">{b.text.slice(0, 140)}</strong><span className="muted small" style={{ display: 'block' }}>{[b.kind === 'mcq' ? 'Multiple choice' : 'Written', b.subject, b.topic, b.difficulty].filter(Boolean).join(' · ')}</span></span>} checked={pick.includes(b.id)} onChange={() => setPick(pick.includes(b.id) ? pick.filter((x) => x !== b.id) : [...pick, b.id])} />
        ))}
        {shown.length === 0 && <span className="muted">Nothing matches.</span>}
      </div>
      <div><Button disabled={!pick.length} onClick={add}>Add {pick.length || ''} selected to this test</Button></div>
    </div>
  );
}

function Form({ initial, subjects, onSave, onCancel }) {
  const [b, setB] = useState(initial);
  const [err, setErr] = useState('');
  const set = (p) => setB({ ...b, ...p });
  const setOpt = (i, v) => set({ options: b.options.map((o, j) => (j === i ? v : o)) });
  const save = () => { const e = validBank(b); if (e) { setErr(e); return; } setErr(''); onSave(b); };
  return (
    <Card className="stack">
      <div className="row wrap" style={{ gap: 8 }}>
        <Button size="sm" variant={b.kind === 'mcq' ? 'primary' : 'secondary'} onClick={() => set({ kind: 'mcq' })}>Multiple choice</Button>
        <Button size="sm" variant={b.kind === 'theory' ? 'primary' : 'secondary'} onClick={() => set({ kind: 'theory' })}>Written</Button>
      </div>
      <TextArea label="Question" rows={3} value={b.text} onChange={(e) => set({ text: e.target.value })} maxLength={1500} />
      {b.kind === 'mcq' ? (
        <fieldset className="stack sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small strong">Answer options. Tap the circle beside the correct one.</legend>
          {b.options.map((o, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <input type="radio" name="correct" checked={b.correct === i} onChange={() => set({ correct: i })} aria-label={`Option ${LETTERS[i]} is correct`} />
              <TextField label={`Option ${LETTERS[i]}`} value={o} onChange={(e) => setOpt(i, e.target.value)} className="grow" maxLength={300} />
            </div>
          ))}
          <TextField label="Why is it right? (shown after the test)" value={b.explanation} onChange={(e) => set({ explanation: e.target.value })} maxLength={1000} />
        </fieldset>
      ) : <TextArea label="Marking guide (only you see this)" rows={3} value={b.guide} onChange={(e) => set({ guide: e.target.value })} maxLength={3000} />}
      <div className="row wrap" style={{ gap: 10 }}>
        <TextField label="Subject" value={b.subject} onChange={(e) => set({ subject: e.target.value })} list="bank-subjects" className="grow" maxLength={40} />
        <TextField label="Topic" value={b.topic} onChange={(e) => set({ topic: e.target.value })} className="grow" maxLength={60} />
      </div>
      <datalist id="bank-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="row wrap" style={{ gap: 10 }}>
        <SelectField label="Level" value={b.difficulty} onChange={(e) => set({ difficulty: e.target.value })} className="grow">{LEVELS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}</SelectField>
        {b.kind === 'mcq' ? <TextField label="Points" type="number" min="1" max="50" value={b.points} onChange={(e) => set({ points: e.target.value })} className="grow" /> : <TextField label="Marks" type="number" min="1" max="100" value={b.marks} onChange={(e) => set({ marks: e.target.value })} className="grow" />}
      </div>
      {err && <Notice tone="warn">{err}</Notice>}
      <div className="row wrap"><Button onClick={save}>Save question</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </Card>
  );
}

export default function QuestionBank() {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const bank = useBank();
  const [f, setF] = useState(noFilter);
  const [view, setView] = useState(null); // null | { id?, initial } | 'paste'
  const [meta, setMeta] = useState({ subject: '', topic: '', difficulty: 'medium' });
  if (bank.loading) return <PageSkeleton rows={3} />;
  const subjects = [...new Set(bank.list.map((b) => b.subject).filter(Boolean))].sort();
  const shown = filterBank(bank.list, f);
  const save = async (b) => {
    try {
      const { id, ...data } = b;
      if (id) await db.set(`${bankPath(user.uid)}/${id}`, { ...data, createdAt: data.createdAt || Date.now(), updatedAt: Date.now() });
      else await db.add(bankPath(user.uid), { ...data, createdAt: Date.now() });
      toast('Question saved'); setView(null);
    } catch (e) { fail(e); }
  };
  const del = async (b) => { if (await confirm(`Delete this question from your bank? Tests that already use it keep their copy.`, { title: 'Delete question', confirmLabel: 'Delete', danger: true })) { try { await db.del(`${bankPath(user.uid)}/${b.id}`); } catch (e) { fail(e); } } };
  const fromPaste = async ({ questions, theory }) => {
    try {
      const items = [...(questions || []).map((q) => toBank(q, 'mcq', meta)), ...(theory || []).map((q) => toBank(q, 'theory', meta))];
      const n = await saveToBank(user.uid, bank.list, items);
      toast(n ? `${n} question${n === 1 ? '' : 's'} saved to your bank` : 'Those questions were already in your bank'); setView(null);
    } catch (e) { fail(e); }
  };
  if (view && view !== 'paste') return <Form key={view.initial.id || 'new'} initial={view.initial} subjects={subjects} onSave={save} onCancel={() => setView(null)} />;
  if (view === 'paste') {
    return (
      <Card className="stack">
        <h3>Paste a paper into your bank</h3>
        <p className="muted small">Everything pasted gets the subject, topic and level below.</p>
        <div className="row wrap" style={{ gap: 10 }}>
          <TextField label="Subject" value={meta.subject} onChange={(e) => setMeta({ ...meta, subject: e.target.value })} className="grow" maxLength={40} />
          <TextField label="Topic" value={meta.topic} onChange={(e) => setMeta({ ...meta, topic: e.target.value })} className="grow" maxLength={60} />
          <SelectField label="Level" value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: e.target.value })} className="grow">{LEVELS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}</SelectField>
        </div>
        <PastePanel onAdd={fromPaste} target="my bank" />
        <div><Button variant="ghost" onClick={() => setView(null)}>Back</Button></div>
      </Card>
    );
  }
  return (
    <div className="stack">
      <div className="row wrap"><Button icon="plus" onClick={() => setView({ initial: blank() })}>New question</Button><Button variant="secondary" onClick={() => setView('paste')}>Paste a paper</Button></div>
      {bank.list.length === 0 ? <Empty art="test" title="Your question bank is empty" text="Save questions once and use them in any test. You can write them, paste a paper, or save them from a test you built." /> : (
        <>
          <Filters f={f} setF={setF} subjects={subjects} />
          <span className="muted small">{shown.length} of {bank.list.length} questions</span>
          {shown.map((b) => (
            <Card key={b.id} className="stack sm" data-bank-q>
              <div className="row between wrap" style={{ gap: 8 }}><Badge>{b.kind === 'mcq' ? 'Multiple choice' : 'Written'}</Badge><span className="muted small">{[b.subject, b.topic, b.difficulty].filter(Boolean).join(' · ')}</span></div>
              <strong className="break">{b.text}</strong>
              {b.kind === 'mcq' && <ol type="A" style={{ margin: 0, paddingLeft: 22 }}>{b.options.map((o, i) => <li key={i} style={{ fontWeight: i === b.correct ? 700 : 400 }}>{o}{i === b.correct ? ' (correct)' : ''}</li>)}</ol>}
              <div className="row"><Button size="sm" variant="ghost" onClick={() => setView({ initial: { ...blank(), ...b } })}>Edit</Button><Button size="sm" variant="ghost" onClick={() => del(b)}>Delete</Button></div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

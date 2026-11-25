import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { ai } from '../lib/api.js';
import { fromTemplate, TEMPLATES, plansPath } from '../lib/plans.js';
import { notify, activeStudentIds } from '../lib/classwork.js';
import { fmtDate } from '../lib/util.js';
import { Button, Card, CopyButton, Notice, PageHead, PageSkeleton, SelectField, Seg, TextArea, TextField, useConfirm } from '../ui/kit.jsx';

const TASKS = [
  { id: 'lesson_outline', label: 'Lesson outline', hint: 'Objectives, hook, teaching steps with timings, check and closing task.' },
  { id: 'explain', label: 'Ways to explain an idea', hint: 'Plain explanation, real-life example, analogy, demo and discussion questions.' },
  { id: 'misconceptions', label: 'Common misconceptions', hint: 'What students usually get wrong and a quick fix for each.' },
  { id: 'differentiated', label: 'Practice at three levels', hint: 'Support, core and stretch tasks.' },
  { id: 'assignment_ideas', label: 'Assignment ideas', hint: 'Four ideas with instructions and a marking idea.' },
  { id: 'theory_notes', label: 'Revision notes', hint: 'Key points, a worked example and self-check questions.' },
  { id: 'announcement', label: 'Announcement draft', hint: 'A short, friendly message to students.' },
];

function ClassPick({ value, onChange, label = 'Class (optional)' }) {
  const { user } = useApp();
  const classes = useLive('classes', { where: [['teacherId', '==', user.uid]] });
  const list = classes.data || [];
  return <SelectField label={label} value={value} onChange={(e) => onChange(e.target.value, list.find((c) => c.id === e.target.value))}><option value="">No class</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>;
}

function Make() {
  const { user, fail, toast } = useApp();
  const [f, setF] = useState({ kind: 'lesson_outline', topic: '', instructions: '', classId: '', cls: null });
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const task = TASKS.find((t) => t.id === f.kind);
  const run = async () => {
    setBusy(true); setSaved('');
    try {
      const r = await ai('teacher_generate', { kind: f.kind, topic: f.topic.trim(), instructions: f.instructions.trim(), className: f.cls ? f.cls.name : '', subject: f.cls ? f.cls.subject || '' : '', level: '' });
      setOut(String(r.text || '').trim());
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const toPlan = async () => {
    try {
      const base = fromTemplate(TEMPLATES[0], 40);
      await db.add(plansPath(user.uid), { ...base, title: (f.topic.trim() || task.label).slice(0, 100), subject: f.cls ? (f.cls.subject || '').slice(0, 60) : '', notes: out.slice(0, 3000), createdAt: Date.now(), updatedAt: Date.now() });
      setSaved('plan'); toast('Saved to your lesson plans');
    } catch (e) { fail(e); }
  };
  const toClass = async () => {
    if (!f.cls) return;
    try {
      await db.add(`classes/${f.cls.id}/resources`, { title: (f.topic.trim() || task.label).slice(0, 120), description: out.slice(0, 2000), topic: f.topic.trim().slice(0, 80), attachments: [], published: false, createdAt: Date.now() });
      setSaved('class'); toast('Saved to the class as a draft only you can see');
    } catch (e) { fail(e); }
  };
  return (
    <div className="stack">
      <Card className="stack">
        <SelectField label="What do you need?" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{TASKS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</SelectField>
        <p className="muted small">{task.hint}</p>
        <TextField label="Topic" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={300} placeholder="For example: Photosynthesis, JSS2" autoComplete="off" />
        <ClassPick value={f.classId} onChange={(id, cls) => setF({ ...f, classId: id, cls: cls || null })} />
        <TextArea label="Anything else it should know (optional)" rows={3} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} maxLength={1500} hint="For example: 35 minute lesson, no projector, students have weak reading." />
        <div><Button loading={busy} disabled={!f.topic.trim()} onClick={run}>{out ? 'Make another version' : 'Make it'}</Button></div>
        <p className="muted small">Only the class name and subject are sent. No student names or marks are ever included.</p>
      </Card>
      {out && (
        <Card className="stack" aria-label="AI draft">
          <Notice icon="info">This is a draft for you to check and change. AI can make mistakes, so read it before you use it.</Notice>
          <div className="pre break" data-draft>{out}</div>
          <div className="row wrap">
            <CopyButton text={out} />
            <Button variant="secondary" onClick={toPlan} disabled={saved === 'plan'}>{saved === 'plan' ? 'Saved to lesson plans' : 'Save to my lesson plans'}</Button>
            {f.cls && <Button variant="secondary" onClick={toClass} disabled={saved === 'class'}>{saved === 'class' ? 'Saved as a class draft' : `Save as a draft in ${f.cls.name}`}</Button>}
          </div>
        </Card>
      )}
    </div>
  );
}

function Ask() {
  const { user, fail } = useApp();
  const confirm = useConfirm();
  const doc = useLive(`users/${user.uid}/aiChats`, { orderBy: ['at', 'desc'], limit: 60 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [cls, setCls] = useState({ id: '', c: null });
  const end = useRef(null);
  const messages = (doc.data || []).filter((m) => m.role && m.content).slice().sort((a, b) => a.at - b.at);
  useEffect(() => { if (end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: 'end' }); }, [messages.length, busy]);
  const send = async () => {
    const q = text.trim(); if (!q || busy) return;
    const at = Date.now(); const mine = { role: 'user', content: q, at };
    const history = [...messages, mine].slice(-14).map((m) => ({ role: m.role, content: m.content }));
    setText(''); setBusy(true);
    try {
      await db.add(`users/${user.uid}/aiChats`, mine);
      const res = await ai('teacher_coach', { messages: history, context: cls.c ? `Class: ${cls.c.name}. Subject: ${cls.c.subject || 'n/a'}.` : '' });
      await db.add(`users/${user.uid}/aiChats`, { role: 'assistant', content: String(res.text || '').slice(0, 6000), at: Math.max(Date.now(), at + 1) });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const clear = async () => {
    if (!(await confirm('Delete this whole conversation?', { title: 'Clear chat', confirmLabel: 'Delete all', danger: true }))) return;
    try { const all = await db.list(`users/${user.uid}/aiChats`); await db.batch(all.map((m) => ({ op: 'delete', path: `users/${user.uid}/aiChats/${m.id}` }))); } catch (e) { fail(e); }
  };
  if (doc.loading) return <PageSkeleton rows={2} />;
  return (
    <div className="stack">
      <Card className="stack" style={{ minHeight: 220 }} aria-live="polite">
        {messages.length === 0 && <p className="muted">Ask about teaching a topic, handling a tricky class, planning a term, or writing a rubric.</p>}
        {messages.map((m) => (
          <div key={m.id} className="coach-msg" style={m.role === 'user' ? { background: 'var(--accent-soft, #e8f1ee)', borderRadius: 12, padding: '10px 12px' } : undefined}>
            <span className="muted small">{m.role === 'user' ? 'You' : 'Learnr'}, {fmtDate(m.at)}</span>
            <p className="pre break">{m.content}</p>
          </div>
        ))}
        {busy && <p className="muted" role="status">Thinking...</p>}
        <div ref={end} />
      </Card>
      <Card className="stack sm">
        <ClassPick value={cls.id} onChange={(id, c) => setCls({ id, c: c || null })} label="Tell it which class (optional)" />
        <TextArea label="Ask a question" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
        <div className="row wrap"><Button loading={busy} disabled={!text.trim()} onClick={send} icon="send">Send</Button>{messages.length > 0 && <Button variant="ghost" onClick={clear} disabled={busy}>Clear chat</Button>}</div>
        <p className="muted small">Your conversation is private to you. Do not type students' names or personal details.</p>
      </Card>
    </div>
  );
}

export default function TeacherCoach() {
  const [tab, setTab] = useState('make');
  return (
    <div className="stack lg">
      <PageHead title="Coach" sub="Your teaching assistant. It drafts, you decide." />
      <Seg label="Coach sections" value={tab} onChange={setTab} options={[{ value: 'make', label: 'Make something' }, { value: 'ask', label: 'Ask' }]} />
      {tab === 'make' ? <Make /> : <Ask />}
    </div>
  );
}

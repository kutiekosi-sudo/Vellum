import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { TEMPLATES, fromTemplate, stageTotal, cleanPlan, planText, plansPath } from '../lib/plans.js';
import { notify, activeStudentIds } from '../lib/classwork.js';
import { plural, relative } from '../lib/util.js';
import { Badge, Button, Card, Empty, Modal, Notice, PageSkeleton, SectionTitle, SelectField, TextArea, TextField, useConfirm } from '../ui/kit.jsx';

function Editor({ start, onDone }) {
  const { user, fail, toast } = useApp();
  const [f, setF] = useState(start);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = stageTotal(f.stages);
  const diff = total - (Number(f.minutes) || 0);
  const setStage = (i, k, v) => setF({ ...f, stages: f.stages.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const move = (i, d) => { const a = [...f.stages]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setF({ ...f, stages: a }); };
  const save = async () => {
    const p = cleanPlan(f);
    if (!p.title) { toast('Give the plan a title'); return; }
    setBusy(true);
    try {
      if (f.id) await db.update(`${plansPath(user.uid)}/${f.id}`, { ...p, updatedAt: Date.now() });
      else await db.add(plansPath(user.uid), { ...p, createdAt: Date.now(), updatedAt: Date.now() });
      toast('Lesson plan saved'); onDone();
    } catch (e) { fail(e); setBusy(false); }
  };
  return (
    <Card className="stack">
      <TextField label="Lesson title" value={f.title} onChange={set('title')} maxLength={100} placeholder="For example: Acids and bases" autoComplete="off" />
      <div className="row wrap" style={{ gap: 12 }}>
        <TextField label="Subject" value={f.subject} onChange={set('subject')} maxLength={60} className="grow" autoComplete="off" />
        <TextField label="Class level" value={f.level} onChange={set('level')} maxLength={40} className="grow" autoComplete="off" />
        <TextField label="Minutes" type="number" inputMode="numeric" min="5" max="240" value={f.minutes} onChange={set('minutes')} className="grow" />
      </div>
      <TextArea label="Objectives (what students will be able to do)" rows={3} value={f.objectives} onChange={set('objectives')} maxLength={1500} />
      <div className="stack sm">
        <strong>Stages</strong>
        {f.stages.map((s, i) => (
          <div key={s.id} className="stack sm" data-stage style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <TextField label={`Stage ${i + 1} name`} value={s.title} onChange={(e) => setStage(i, 'title', e.target.value)} maxLength={80} className="grow" autoComplete="off" />
              <TextField label="Minutes" type="number" inputMode="numeric" min="0" max="240" value={s.minutes} onChange={(e) => setStage(i, 'minutes', e.target.value)} style={{ maxWidth: 110 }} />
            </div>
            <TextArea label="What happens" rows={2} value={s.activity} onChange={(e) => setStage(i, 'activity', e.target.value)} maxLength={600} />
            <div className="row" style={{ gap: 4 }}>
              <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>Move up</Button>
              <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === f.stages.length - 1}>Move down</Button>
              <Button size="sm" variant="ghost" onClick={() => setF({ ...f, stages: f.stages.filter((_, j) => j !== i) })}>Remove</Button>
            </div>
          </div>
        ))}
        {f.stages.length < 12 && <div><Button size="sm" variant="secondary" onClick={() => setF({ ...f, stages: [...f.stages, { id: Math.random().toString(36).slice(2, 8), title: '', minutes: 10, activity: '' }] })}>Add a stage</Button></div>}
        <Notice tone={diff === 0 ? undefined : 'warn'} icon="info"><span data-total>{diff === 0 ? `Stages add up to the ${total} minutes.` : diff > 0 ? `Stages add up to ${total} minutes, which is ${diff} more than the lesson.` : `Stages add up to ${total} minutes, which is ${-diff} less than the lesson.`}</span></Notice>
      </div>
      <TextArea label="Materials you will need" rows={2} value={f.materials} onChange={set('materials')} maxLength={1000} />
      <TextArea label="Homework" rows={2} value={f.homework} onChange={set('homework')} maxLength={1000} />
      <TextArea label="Notes to yourself (private)" rows={3} value={f.notes} onChange={set('notes')} maxLength={3000} />
      <div className="row wrap"><Button loading={busy} onClick={save}>Save plan</Button><Button variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button></div>
    </Card>
  );
}

function ShareToClass({ plan, onClose }) {
  const { user, fail, toast } = useApp();
  const classes = useLive('classes', { where: [['teacherId', '==', user.uid]] });
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const list = classes.data || [];
  const go = async () => {
    const cls = list.find((c) => c.id === id); if (!cls) return;
    setBusy(true);
    try {
      await db.add(`classes/${cls.id}/resources`, { title: plan.title, description: planText(plan), topic: plan.subject || '', attachments: [], published: true, createdAt: Date.now() });
      activeStudentIds(cls.id).then((ids) => notify(ids, { fromUid: user.uid, classId: cls.id, type: 'resource', title: `New resource in ${cls.name}`, body: plan.title, link: `/class/${cls.id}/resources` })).catch(console.error);
      toast(`Shared with ${cls.name}`); onClose();
    } catch (e) { fail(e); setBusy(false); }
  };
  return (
    <Modal title="Share with a class" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!id} onClick={go}>Share</Button></>}>
      <div className="stack">
        <p className="muted">Students get the objectives, the stages, what to bring and the homework. Your private notes are never shared.</p>
        {classes.loading ? <PageSkeleton rows={1} /> : list.length === 0 ? <p className="muted">You have no classes yet.</p> : (
          <SelectField label="Class" value={id} onChange={(e) => setId(e.target.value)}><option value="">Choose a class</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
        )}
      </div>
    </Modal>
  );
}

export default function LessonPlans() {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const live = useLive(plansPath(user.uid));
  const [view, setView] = useState({ name: 'list' });
  const [tid, setTid] = useState('direct');
  const [mins, setMins] = useState('40');
  const [sharing, setSharing] = useState(null);
  const plans = [...(live.data || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (view.name === 'edit') return <Editor key={view.key} start={view.start} onDone={() => setView({ name: 'list' })} />;
  const t = TEMPLATES.find((x) => x.id === tid);
  const dup = async (p) => { try { const { id, ...rest } = p; await db.add(plansPath(user.uid), { ...rest, title: `${p.title} (copy)`.slice(0, 100), createdAt: Date.now(), updatedAt: Date.now() }); toast('Copied'); } catch (e) { fail(e); } };
  const del = async (p) => { if (!(await confirm(`Delete "${p.title}"?`, { title: 'Delete lesson plan', confirmLabel: 'Delete', danger: true }))) return; try { await db.del(`${plansPath(user.uid)}/${p.id}`); toast('Deleted'); } catch (e) { fail(e); } };
  return (
    <div className="stack">
      <Card className="stack sm">
        <strong>Start a new plan from a template</strong>
        <SelectField label="Template" value={tid} onChange={(e) => setTid(e.target.value)}>{TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectField>
        <p className="muted small">{t.note}</p>
        <TextField label="Minutes in the lesson" type="number" inputMode="numeric" min="15" max="240" value={mins} onChange={(e) => setMins(e.target.value)} />
        <div><Button onClick={() => setView({ name: 'edit', key: Math.random(), start: fromTemplate(t, mins) })}>Use this template</Button></div>
      </Card>
      <SectionTitle>My lesson plans</SectionTitle>
      {live.loading ? <PageSkeleton rows={2} /> : plans.length === 0 ? <Empty art="desk" title="No lesson plans yet" text="Pick a template above, change it to suit your class, and save it. Plans are private to you." /> : (
        <Card className="list-card">
          {plans.map((p) => (
            <div className="item-row" style={{ flexWrap: 'wrap' }} key={p.id} data-plan>
              <span className="grow" style={{ flex: '1 1 200px', minWidth: 0 }}>
                <strong className="break">{p.title}</strong>
                <span className="muted small" style={{ display: 'block' }}>{[p.subject, p.level, `${p.minutes} min`, plural(p.stages.length, 'stage'), relative(p.updatedAt)].filter(Boolean).join(', ')}</span>
              </span>
              <div className="row wrap" style={{ gap: 2 }}>
                <Button size="sm" variant="ghost" onClick={() => setView({ name: 'edit', key: p.id, start: p })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setSharing(p)}>Share with class</Button>
                <Button size="sm" variant="ghost" onClick={() => dup(p)}>Copy</Button>
                <Button size="sm" variant="ghost" onClick={() => del(p)}>Delete</Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      {sharing && <ShareToClass plan={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}

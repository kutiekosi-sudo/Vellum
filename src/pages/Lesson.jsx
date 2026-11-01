import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive, useLocalState } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { SIZES } from '../lib/scheme.js';
import { SPANS, conceptsPath, giveCards, planLesson } from '../lib/lesson.js';
import { Badge, Button, Card, Empty, Notice, PageSkeleton, SectionTitle, SelectField, TextArea, TextField, useConfirm } from '../ui/kit.jsx';

const KIND = { settle: 'hsl(40 20% 92%)', starter: 'hsl(200 50% 93%)', teach: 'hsl(155 40% 91%)', practice: 'hsl(40 80% 91%)', wrap: 'hsl(270 35% 94%)' };

function Planner({ cards }) {
  const [f, setF] = useLocalState('learnr.lesson.form', { title: '', minutes: '40', size: 'medium', span: '12' });
  const [picked, setPicked] = useState([]);
  const p = planLesson({ minutes: f.minutes, size: f.size, span: Number(f.span) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const chosen = cards.filter((c) => picked.includes(c.id));
  const hand = p.ok ? giveCards(p.blocks, chosen) : new Map();
  return (
    <div className="stack">
      <Card className="stack">
        <TextField label="Lesson topic" value={f.title} onChange={set('title')} placeholder="For example: Photosynthesis" maxLength={80} />
        <div className="row wrap" style={{ gap: 12 }}>
          <TextField label="Minutes in the lesson" type="number" inputMode="numeric" min="15" max="180" value={f.minutes} onChange={set('minutes')} className="grow" />
          <SelectField label="Class size" value={f.size} onChange={set('size')} className="grow">{SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</SelectField>
        </div>
        <SelectField label="How long can they focus on one thing?" value={f.span} onChange={set('span')}>{SPANS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</SelectField>
      </Card>
      {cards.length > 0 && (
        <Card className="stack sm">
          <strong>Concept cards to teach (optional)</strong>
          <div className="row wrap" style={{ gap: 8 }}>
            {cards.map((c) => { const on = picked.includes(c.id); return <button key={c.id} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])}>{c.title}</button>; })}
          </div>
        </Card>
      )}
      {!p.ok ? <Notice icon="info">{p.reason}</Notice> : (
        <div className="stack sm" aria-label="Lesson plan">
          <SectionTitle title={f.title.trim() ? `${f.title.trim()}: ${p.total} minutes` : `${p.total}-minute lesson`} />
          {p.blocks.map((b, i) => (
            <Card key={i} className="stack sm" style={{ background: KIND[b.kind] }} data-kind={b.kind}>
              <div className="row between wrap" style={{ gap: 8 }}><strong>{b.title}</strong><Badge>{b.mins} min</Badge></div>
              <span className="muted small">Minute {b.from} to {b.from + b.mins}</span>
              {(hand.get(b) || []).map((c) => (
                <div key={c.id} className="stack sm"><strong>{c.title}</strong>{(c.points || []).length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{c.points.map((x, j) => <li key={j}>{x}</li>)}</ul>}{c.example && <span className="muted small">Example: {c.example}</span>}</div>
              ))}
            </Card>
          ))}
          <span className="muted small">The longest stretch of teaching in a row is {p.longest} minutes. This plan works without signal.</span>
        </div>
      )}
    </div>
  );
}

function Cards({ cards }) {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const [f, setF] = useState({ title: '', subject: '', points: '', example: '' });
  const add = async () => {
    if (!f.title.trim()) return;
    const id = Math.random().toString(36).slice(2, 10);
    try {
      await db.set(`${conceptsPath(user.uid)}/${id}`, { title: f.title.trim().slice(0, 80), subject: f.subject.trim().slice(0, 40), points: f.points.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 8).map((x) => x.slice(0, 200)), example: f.example.trim().slice(0, 300), createdAt: Date.now() });
      setF({ title: '', subject: '', points: '', example: '' }); toast('Concept card saved');
    } catch (e) { fail(e); }
  };
  const del = async (c) => { if (await confirm({ title: `Delete "${c.title}"?`, confirmLabel: 'Delete' })) { try { await db.delete(`${conceptsPath(user.uid)}/${c.id}`); } catch (e) { fail(e); } } };
  return (
    <div className="stack">
      <Card className="stack">
        <strong>New concept card</strong>
        <TextField label="Concept" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="For example: Osmosis" maxLength={80} />
        <TextField label="Subject (optional)" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={40} />
        <TextArea label="Key points, one per line" rows={4} value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} />
        <TextField label="Example (optional)" value={f.example} onChange={(e) => setF({ ...f, example: e.target.value })} maxLength={300} />
        <Button onClick={add} disabled={!f.title.trim()}>Save card</Button>
      </Card>
      {cards.length === 0 ? <Empty art="classroom" title="No concept cards yet" text="Write the key points of a concept once. Use it in any lesson plan, even with no signal." /> : cards.map((c) => (
        <Card key={c.id} className="stack sm">
          <div className="row between wrap" style={{ gap: 8 }}><strong>{c.title}</strong>{c.subject && <Badge>{c.subject}</Badge>}</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{(c.points || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
          {c.example && <span className="muted small">Example: {c.example}</span>}
          <div><Button variant="ghost" size="sm" onClick={() => del(c)}>Delete card</Button></div>
        </Card>
      ))}
    </div>
  );
}

export default function Lesson() {
  const { user } = useApp();
  const live = useLive(conceptsPath(user.uid));
  const [tab, setTab] = useState('plan');
  if (live.loading) return <PageSkeleton rows={3} />;
  const cards = [...(live.data || [])].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        <Button variant={tab === 'plan' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('plan')}>Lesson time</Button>
        <Button variant={tab === 'cards' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('cards')}>Concept cards ({cards.length})</Button>
      </div>
      {tab === 'plan' ? <Planner cards={cards} /> : <Cards cards={cards} />}
    </div>
  );
}

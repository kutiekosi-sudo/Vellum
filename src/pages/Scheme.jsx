import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { DAYS, SIZES, analyse, newTopic, schemePath, syncTopic } from '../lib/scheme.js';
import { dateInput, fromDateInput } from '../lib/calendar.js';
import { startOfDay } from '../lib/util.js';
import { Badge, Button, Card, Empty, Notice, PageSkeleton, Progress, SectionTitle, SelectField, TextField, useConfirm } from '../ui/kit.jsx';

const word = (n) => (Math.round(n * 10) / 10).toString();
const dayWord = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function Summary({ a }) {
  if (!a.ready) return <Notice icon="info">{a.missing === 'timetable' ? 'Add your weekly timetable (which days you teach this class and for how long) to see where you stand.' : 'Set the start and end dates of the term to see where you stand.'}</Notice>;
  if (!a.total) return <Notice icon="info">Add the topics you plan to teach this term. Learnr will check them against the time you have.</Notice>;
  const short = a.shortfall > 0.05;
  return (
    <div className="stack sm">
      <Progress value={a.total ? (a.doneCount / a.total) * 100 : 0} label="Topics taught" />
      <span className="muted small">{a.doneCount} of {a.total} topics taught</span>
      {a.behind.length > 0 ? (
        <Notice icon="info">You are behind. By today you should have finished {a.behind.length === 1 ? 'this topic' : `these ${a.behind.length} topics`}: {a.behind.map((x) => x.topic.title).join(', ')}. Teach them next, or move the dates of your plan.</Notice>
      ) : a.doneCount < a.total ? <p className="muted">You are on schedule so far.</p> : <p className="muted">Every topic is taught. Well done.</p>}
      {a.doneCount < a.total && (
        <Card className="stack sm" style={{ background: short ? 'hsl(8 70% 96%)' : 'hsl(150 40% 95%)' }}>
          <strong>{short ? 'This plan is bigger than the time you have' : 'The plan fits the time you have'}</strong>
          <span>You have {a.lessonsLeft} {a.lessonsLeft === 1 ? 'lesson' : 'lessons'} left this term, about {word(a.capacity)} periods of teaching, and the topics left need about {word(a.need)} periods{a.eff < 1 ? ` (allowing for the size of your class)` : ''}.</span>
          {short ? (
            <>
              <span>You are short by about {word(a.shortfall)} periods. Realistically you can cover {a.coverable.length ? <>up to <strong>{a.coverable[a.coverable.length - 1].topic.title}</strong></> : 'none of them'}.{a.atRisk.length ? <> These may not fit: <strong>{a.atRisk.map((x) => x.topic.title).join(', ')}</strong>.</> : null}</span>
              <span className="muted small">You could shorten a topic, combine two, cut revision time, or ask for an extra period.</span>
            </>
          ) : <span>You have about {word(a.spare)} spare periods for revision or tests.</span>}
        </Card>
      )}
    </div>
  );
}

export default function Scheme() {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const classes = useLive('classes', { where: [['teacherId', '==', user.uid]] });
  const [classId, setClassId] = useState('');
  const list = (classes.data || []).filter((c) => !c.archived);
  const cls = list.find((c) => c.id === classId) || list[0];
  const live = useLive(cls ? schemePath(user.uid, cls.id) : `users/${user.uid}/scheme/none`);
  const [title, setTitle] = useState('');
  const [periods, setPeriods] = useState('1');
  const [slot, setSlot] = useState({ day: '1', minutes: '40' });
  const [hol, setHol] = useState('');

  if (classes.loading) return <PageSkeleton rows={3} />;
  if (!cls) return <Empty art="classroom" title="Create a class first" text="Your scheme of work is kept per class. Create a class, then plan its topics here." />;
  const s = { timetable: [], topics: [], holidays: [], periodMinutes: 40, size: 'medium', ...(live.data || {}) };
  const a = analyse(s);
  const save = async (patch) => {
    try { await db.set(schemePath(user.uid, cls.id), { classId: cls.id, className: cls.name, timetable: s.timetable, topics: s.topics, holidays: s.holidays, periodMinutes: s.periodMinutes, size: s.size, termStart: s.termStart || 0, termEnd: s.termEnd || 0, ...patch, updatedAt: Date.now() }); } catch (e) { fail(e); }
  };
  const addTopic = async () => { if (!title.trim()) return; await save({ topics: [...s.topics, newTopic(title, periods)] }); setTitle(''); setPeriods('1'); };
  const move = (i, d) => { const t = s.topics.slice(); const j = i + d; if (j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j], t[i]]; return save({ topics: t }); };
  const edit = (i, patch) => save({ topics: s.topics.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const taught = async (t, done) => { try { await syncTopic(db, user.uid, cls.id, t.id, done); } catch (e) { fail(e); } };
  const addSlot = async () => { const m = Math.max(10, Math.min(240, Number(slot.minutes) || 40)); await save({ timetable: [...s.timetable, { day: Number(slot.day), minutes: m }] }); };
  const addHoliday = async () => { const t = fromDateInput(hol); if (Number.isNaN(t)) return; await save({ holidays: [...new Set([...s.holidays, t])].sort() }); setHol(''); };
  const toCalendar = async () => {
    try {
      const old = (await db.list(`users/${user.uid}/calendar`)).filter((e) => e.schemeClass === cls.id && !e.done);
      await Promise.all(old.map((e) => db.del(`users/${user.uid}/calendar/${e.id}`)));
      const fresh = a.plan.filter((x) => x.fits && x.start);
      await Promise.all(fresh.map((x) => db.add(`users/${user.uid}/calendar`, { title: x.topic.title, type: 'lesson', classId: cls.id, className: cls.name, notes: '', date: x.start, done: false, schemeClass: cls.id, topicId: x.topic.id, createdAt: Date.now() })));
      toast(`${fresh.length} ${fresh.length === 1 ? 'lesson' : 'lessons'} added to your calendar`);
    } catch (e) { fail(e); }
  };

  return (
    <div className="stack lg">
      {list.length > 1 && <SelectField label="Class" value={cls.id} onChange={(e) => setClassId(e.target.value)}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>}
      {live.loading ? <PageSkeleton rows={2} /> : <Summary a={a} />}

      <Card className="stack">
        <h3>Topics for {cls.name}</h3>
        {s.topics.length === 0 && <p className="muted">No topics yet. Add them in the order you plan to teach them.</p>}
        {s.topics.map((t, i) => (
          <div key={t.id} className="item-row" style={{ alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
            <input type="checkbox" aria-label={`${t.title} taught`} checked={!!t.done} onChange={(e) => taught(t, e.target.checked)} style={{ marginTop: 6 }} />
            <span style={{ flex: '1 1 160px', minWidth: 0 }}><strong className="break" style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</strong><span className="muted small" style={{ display: 'block' }}>{word(t.periods)} {t.periods === 1 ? 'period' : 'periods'}{(() => { const p = a.ready && a.plan.find((x) => x.topic.id === t.id); return p ? (p.fits && p.start ? `, planned ${dayWord(p.start)}` : ', may not fit this term') : ''; })()}</span></span>
            <span className="row wrap" style={{ gap: 4 }}>
              <Button size="sm" variant="ghost" aria-label={`Move ${t.title} up`} onClick={() => move(i, -1)} disabled={i === 0}>Up</Button>
              <Button size="sm" variant="ghost" aria-label={`Move ${t.title} down`} onClick={() => move(i, 1)} disabled={i === s.topics.length - 1}>Down</Button>
              <Button size="sm" variant="ghost" onClick={() => edit(i, { periods: Math.max(0.5, t.periods + 0.5) })} aria-label={`Longer ${t.title}`}>+ period</Button>
              <Button size="sm" variant="ghost" onClick={() => edit(i, { periods: Math.max(0.5, t.periods - 0.5) })} aria-label={`Shorter ${t.title}`}>- period</Button>
              <Button size="sm" variant="ghost" onClick={async () => { if (await confirm(`Remove "${t.title}"?`, { title: 'Remove topic', confirmLabel: 'Remove', danger: true })) save({ topics: s.topics.filter((_, j) => j !== i) }); }}>Remove</Button>
            </span>
          </div>
        ))}
        <div className="grid cols-2" style={{ alignItems: 'end' }}>
          <TextField label="New topic" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoComplete="off" placeholder="For example: Photosynthesis" onKeyDown={(e) => e.key === 'Enter' && addTopic()} />
          <TextField label="Periods needed" type="number" inputMode="decimal" min="0.5" step="0.5" value={periods} onChange={(e) => setPeriods(e.target.value)} />
        </div>
        <div className="row wrap"><Button disabled={!title.trim()} onClick={addTopic}>Add topic</Button>{a.ready && a.coverable.length > 0 && <Button variant="ghost" onClick={toCalendar}>Put my plan on the calendar</Button>}</div>
      </Card>

      <Card className="stack">
        <h3>Your time</h3>
        <div className="grid cols-2">
          <TextField label="Term starts" type="date" value={s.termStart ? dateInput(s.termStart) : ''} onChange={(e) => { const t = fromDateInput(e.target.value); if (!Number.isNaN(t)) save({ termStart: t }); }} />
          <TextField label="Term ends" type="date" value={s.termEnd ? dateInput(s.termEnd) : ''} onChange={(e) => { const t = fromDateInput(e.target.value); if (!Number.isNaN(t)) save({ termEnd: t }); }} />
        </div>
        <TextField label="One period lasts (minutes)" type="number" inputMode="numeric" min="10" max="120" value={s.periodMinutes} onChange={(e) => save({ periodMinutes: Math.max(10, Math.min(120, Number(e.target.value) || 40)) })} />
        <SelectField label="Class size" value={s.size} onChange={(e) => save({ size: e.target.value })} hint={(SIZES.find((x) => x.id === s.size) || SIZES[1]).note}>{SIZES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</SelectField>
        <SectionTitle title="Weekly timetable" />
        {s.timetable.length === 0 && <p className="muted">Add each day you teach this class and how long the lesson is. A double period is 80 minutes.</p>}
        {s.timetable.map((p, i) => (
          <div key={i} className="row between"><span>{DAYS[p.day]}, {p.minutes} minutes</span><Button size="sm" variant="ghost" onClick={() => save({ timetable: s.timetable.filter((_, j) => j !== i) })}>Remove</Button></div>
        ))}
        <div className="grid cols-2" style={{ alignItems: 'end' }}>
          <SelectField label="Day" value={slot.day} onChange={(e) => setSlot({ ...slot, day: e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</SelectField>
          <TextField label="Minutes" type="number" inputMode="numeric" min="10" max="240" value={slot.minutes} onChange={(e) => setSlot({ ...slot, minutes: e.target.value })} />
        </div>
        <div><Button variant="ghost" onClick={addSlot}>Add to timetable</Button></div>
        <SectionTitle title="Days with no lessons" />
        {s.holidays.length === 0 ? <p className="muted">Public holidays, exams and school events. Learnr leaves these days out.</p> : <div className="row wrap">{s.holidays.map((h) => <Badge key={h}>{dayWord(h)} <button type="button" aria-label={`Remove ${dayWord(h)}`} onClick={() => save({ holidays: s.holidays.filter((x) => x !== h) })} style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}>x</button></Badge>)}</div>}
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}><div className="grow"><TextField label="Add a day off" type="date" value={hol} onChange={(e) => setHol(e.target.value)} /></div><Button variant="ghost" disabled={!hol} onClick={addHoliday}>Add</Button></div>
      </Card>
    </div>
  );
}

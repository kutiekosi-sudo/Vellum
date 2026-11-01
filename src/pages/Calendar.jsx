import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { href } from '../lib/router.js';
import { DAY, startOfDay } from '../lib/util.js';
import { EVENT_TYPES, dateInput, dayShade, fromDateInput, monthHue, teachingStatus, typeOf } from '../lib/calendar.js';
import { Badge, Button, Card, Empty, Notice, PageHead, PageSkeleton, SectionTitle, SelectField, TextArea, TextField, useConfirm } from '../ui/kit.jsx';

const path = (uid) => `users/${uid}/calendar`;
const dateWord = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function useEvents() {
  const { user } = useApp();
  const live = useLive(path(user.uid));
  return { loading: live.loading, events: (live.data || []).filter((e) => typeof e.date === 'number') };
}

function Row({ e, onDone, onMove }) {
  const t = typeOf(e.type);
  return (
    <div className="item-row" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: t.color, marginTop: 7, flex: 'none' }} />
      <span style={{ flex: '1 1 170px', minWidth: 0 }}><strong className="break">{e.title}</strong><span className="muted small" style={{ display: 'block' }}>{t.label}{e.className ? `, ${e.className}` : ''}{e.date ? `, ${dateWord(e.date)}` : ''}</span></span>
      <span className="row wrap" style={{ gap: 6, marginLeft: 20 }}>
        {onMove && !e.done && <Button size="sm" variant="ghost" onClick={() => onMove(e)}>Move to today</Button>}
        {onDone && (e.done ? <Badge tone="ok">{e.type === 'lesson' ? 'Taught' : 'Done'}</Badge> : <Button size="sm" onClick={() => onDone(e)}>{e.type === 'lesson' ? 'Mark taught' : 'Mark done'}</Button>)}
      </span>
    </div>
  );
}

// What should be taught today and where the teacher is behind. Used on the teacher's home page and the calendar.
export function TeachingToday({ compact }) {
  const { user, fail } = useApp();
  const { loading, events } = useEvents();
  if (loading) return null;
  const s = teachingStatus(events);
  const done = async (e) => { try { await db.update(`${path(user.uid)}/${e.id}`, { done: true, doneAt: Date.now() }); } catch (er) { fail(er); } };
  const move = async (e) => { try { await db.update(`${path(user.uid)}/${e.id}`, { date: startOfDay() }); } catch (er) { fail(er); } };
  const lessonsToday = s.today.filter((e) => e.type === 'lesson');
  const behind = s.behind.length + s.overdueTasks.length;
  if (!events.length && compact) return (
    <Card className="stack sm"><strong>Teaching today</strong><p className="muted">Plan your lessons in the calendar and Learnr will tell you each day what you should be teaching and where you are behind.</p><div><a className="btn" href={href('/calendar')}>Open calendar</a></div></Card>
  );
  return (
    <Card className="stack" aria-label="Teaching today">
      <div className="row between wrap"><h3>Teaching today</h3>{compact && <a className="btn ghost sm" href={href('/calendar')}>Open calendar</a>}</div>
      {s.today.length === 0 ? <p className="muted">Nothing is scheduled for today.</p> : s.today.map((e) => <Row key={e.id} e={e} onDone={done} />)}
      {behind > 0 ? (
        <div className="stack sm">
          <Notice icon="info">You are behind on {s.behind.length ? `${s.behind.length} ${s.behind.length === 1 ? 'lesson' : 'lessons'}` : ''}{s.behind.length && s.overdueTasks.length ? ' and ' : ''}{s.overdueTasks.length ? `${s.overdueTasks.length} ${s.overdueTasks.length === 1 ? 'task' : 'tasks'}` : ''}. Mark them taught when done, or move them to today.</Notice>
          {[...s.behind, ...s.overdueTasks].slice(0, compact ? 4 : 30).map((e) => <Row key={e.id} e={e} onDone={done} onMove={move} />)}
        </div>
      ) : lessonsToday.length > 0 || events.length > 0 ? <p className="muted">You are on track. No overdue lessons or tasks.</p> : null}
    </Card>
  );
}

function EventForm({ initial, classes, onSave, onCancel }) {
  const [f, setF] = useState({ title: '', type: 'lesson', classId: '', notes: '', date: dateInput(Date.now()), ...initial });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.title.trim() && !Number.isNaN(fromDateInput(f.date));
  return (
    <Card className="stack sm">
      <TextField label="Title or topic" value={f.title} onChange={set('title')} maxLength={80} autoComplete="off" placeholder="For example: Photosynthesis, Mock exam marking" />
      <div className="grid cols-2">
        <SelectField label="Type" value={f.type} onChange={set('type')}>{EVENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</SelectField>
        <TextField label="Date" type="date" value={f.date} onChange={set('date')} />
      </div>
      <SelectField label="Class (optional)" value={f.classId} onChange={set('classId')}>
        <option value="">No class</option>
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      <TextArea label="Notes (optional)" rows={3} value={f.notes} onChange={set('notes')} maxLength={300} />
      <div className="row wrap"><Button loading={busy} disabled={!ok} onClick={async () => { setBusy(true); try { await onSave({ ...f, title: f.title.trim().slice(0, 80), date: fromDateInput(f.date), className: (classes.find((c) => c.id === f.classId) || {}).name || '' }); } finally { setBusy(false); } }}>Save</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </Card>
  );
}

export default function Calendar() {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const { loading, events } = useEvents();
  const classes = useLive('classes', { where: [['teacherId', '==', user.uid]] });
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); });
  const [picked, setPicked] = useState(() => startOfDay());
  const [form, setForm] = useState(null); // null | {} (new) | event (edit)
  const today = startOfDay();

  const first = month; const lead = (new Date(first).getDay() + 6) % 7;
  const dim = new Date(new Date(first).getFullYear(), new Date(first).getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + dim) / 7) * 7 }, (_, i) => first - lead * DAY + i * DAY);
  const byDate = new Map(); for (const e of events) { const l = byDate.get(e.date) || []; l.push(e); byDate.set(e.date, l); }
  const move = (n) => { const d = new Date(first); setMonth(new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()); };
  const dayEvents = (byDate.get(picked) || []).slice().sort((a, b) => (a.type === 'lesson' ? -1 : 1) - (b.type === 'lesson' ? -1 : 1));
  const hue = monthHue(first);

  const save = async (data) => {
    const body = { title: data.title, type: data.type, classId: data.classId || '', className: data.className || '', notes: (data.notes || '').slice(0, 300), date: data.date, done: !!data.done };
    try {
      if (data.id) await db.update(`${path(user.uid)}/${data.id}`, body); else await db.add(path(user.uid), { ...body, createdAt: Date.now() });
      setForm(null); setPicked(data.date); toast('Saved to your calendar');
    } catch (e) { fail(e); }
  };
  const toggle = async (e) => { try { await db.update(`${path(user.uid)}/${e.id}`, { done: !e.done, doneAt: e.done ? 0 : Date.now() }); } catch (er) { fail(er); } };
  const remove = async (e) => { if (!(await confirm(`Delete "${e.title}"?`, { title: 'Delete', confirmLabel: 'Delete', danger: true }))) return; try { await db.del(`${path(user.uid)}/${e.id}`); } catch (er) { fail(er); } };

  return (
    <div className="stack lg">
      <PageHead title="Calendar" sub="Plan lessons, tasks, deadlines and exams. Learnr tells you what to teach today and where you are behind." />
      <TeachingToday />
      {loading ? <PageSkeleton rows={3} /> : (
        <Card className="stack" style={{ background: `hsl(${hue} 40% 97%)` }}>
          <div className="row between" style={{ alignItems: 'center' }}>
            <button type="button" className="pod-iconbtn" style={{ color: 'inherit' }} aria-label="Previous month" onClick={() => move(-1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
            <strong>{new Date(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
            <button type="button" className="pod-iconbtn" style={{ color: 'inherit' }} aria-label="Next month" onClick={() => move(1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
          </div>
          <div className="stats-cal" role="grid" aria-label="Calendar">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="muted small stats-dow">{d}</span>)}
            {cells.map((t) => {
              const inMonth = t >= first && t < first + dim * DAY + DAY; const list = byDate.get(t) || [];
              const inM = new Date(t).getMonth() === new Date(first).getMonth();
              return (
                <button key={t} type="button" className="cal-cell" data-sel={t === picked ? '1' : undefined} data-today={t === today ? '1' : undefined} style={{ background: dayShade(t, hue), opacity: inM && inMonth ? 1 : 0.4 }} onClick={() => setPicked(t)} aria-label={`${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}${list.length ? `, ${list.length} ${list.length === 1 ? 'item' : 'items'}` : ''}`}>
                  <span>{new Date(t).getDate()}</span>
                  <span className="cal-dots">{list.slice(0, 4).map((e) => <i key={e.id} style={{ background: typeOf(e.type).color, opacity: e.done ? 0.35 : 1 }} />)}</span>
                </button>
              );
            })}
          </div>
          <div className="row wrap" aria-label="Colour key">{EVENT_TYPES.map((t) => <span key={t.id} className="row small muted" style={{ gap: 6 }}><i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: t.color, display: 'inline-block' }} />{t.label}</span>)}</div>
        </Card>
      )}
      <div className="row between wrap"><SectionTitle title={new Date(picked).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} /><Button size="sm" onClick={() => setForm({ date: dateInput(picked) })}>Add to this day</Button></div>
      {form && <EventForm key={form.id || 'new'} initial={form} classes={(classes.data || []).map((c) => ({ id: c.id, name: c.name || c.className }))} onSave={(d) => save({ ...d, id: form.id, done: form.done })} onCancel={() => setForm(null)} />}
      {dayEvents.length === 0 ? <Empty art="desk" title="Nothing on this day" text="Add a lesson, task, deadline or exam." /> : (
        <Card className="list-card">
          {dayEvents.map((e) => (
            <div key={e.id} className="item-row" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: typeOf(e.type).color, marginTop: 7, flex: 'none' }} />
              <span style={{ flex: '1 1 170px', minWidth: 0 }}><strong className="break" style={{ textDecoration: e.done ? 'line-through' : 'none' }}>{e.title}</strong><span className="muted small" style={{ display: 'block' }}>{typeOf(e.type).label}{e.className ? `, ${e.className}` : ''}</span>{e.notes && <span className="pre muted small" style={{ display: 'block' }}>{e.notes}</span>}</span>
              <span className="row wrap" style={{ gap: 6, marginLeft: 20 }}>
                <Button size="sm" variant={e.done ? 'ghost' : 'primary'} onClick={() => toggle(e)}>{e.done ? 'Undo' : e.type === 'lesson' ? 'Taught' : 'Done'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setForm({ ...e, date: dateInput(e.date) })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(e)}>Delete</Button>
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

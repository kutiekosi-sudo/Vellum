import { useMemo, useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { DAY, dayKey, fmtTime, startOfDay } from '../../lib/util.js';
import { Card, Empty, PageSkeleton, SectionTitle, SelectField, Seg } from '../../ui/kit.jsx';

const hms = (sec) => { sec = Math.max(0, Math.round(sec)); const p = (n) => String(n).padStart(2, '0'); return `${Math.floor(sec / 3600)}:${p(Math.floor((sec % 3600) / 60))}:${p(sec % 60)}`; };
const hm = (sec) => { const m = Math.round(sec / 60); const h = Math.floor(m / 60); return h ? `${h}:${String(m % 60).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`; };
const word = (sec) => { const m = Math.round(sec / 60); const h = Math.floor(m / 60); return h ? (m % 60 ? `${h} h ${m % 60} min` : `${h} h`) : `${m} min`; };
const mondayOf = (t) => { const d = new Date(startOfDay(t)); const wd = (d.getDay() + 6) % 7; return d.getTime() - wd * DAY; };
const monthStart = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const addMonths = (t, n) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };
const UNSET = 'Not set';
const levelOf = (sec) => (sec <= 0 ? 0 : sec < 1800 ? 1 : sec < 5400 ? 2 : sec < 10800 ? 3 : 4);
const LEVEL_PCT = [0, 18, 38, 62, 90];

function Bars({ rows, total }) {
  if (!rows.length) return <p className="muted">No study time in this period yet.</p>;
  return (
    <div className="stack sm">
      {rows.map(([name, sec]) => (
        <div key={name} className="stack" style={{ gap: 4 }}>
          <div className="row between"><strong className="break">{name}</strong><span className="muted small">{word(sec)} · {Math.round((sec / total) * 100)}%</span></div>
          <div role="img" aria-label={`${name}: ${word(sec)}`} style={{ height: 10, borderRadius: 6, background: 'var(--surface-2, #EEEDE6)' }}><div style={{ width: `${Math.max(3, (sec / total) * 100)}%`, height: '100%', borderRadius: 6, background: 'var(--accent, #1F5C4D)' }} /></div>
        </div>
      ))}
    </div>
  );
}

function Nav({ label, onPrev, onNext, nextDisabled }) {
  const arrow = (d) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="row between" style={{ alignItems: 'center' }}>
      <button type="button" className="pod-iconbtn" style={{ color: 'inherit' }} aria-label="Previous" onClick={onPrev}>{arrow('M15 5l-7 7 7 7')}</button>
      <strong>{label}</strong>
      <button type="button" className="pod-iconbtn" style={{ color: 'inherit', opacity: nextDisabled ? 0.3 : 1 }} aria-label="Next" disabled={nextDisabled} onClick={onNext}>{arrow('M9 5l7 7-7 7')}</button>
    </div>
  );
}

export default function Stats() {
  const { user } = useApp();
  const sessions = useLive(`users/${user.uid}/studySessions`);
  const [view, setView] = useState('day');
  const [subject, setSubject] = useState('');
  const [month, setMonth] = useState(() => monthStart(Date.now()));
  const [picked, setPicked] = useState(() => startOfDay(Date.now()));
  const [week, setWeek] = useState(() => mondayOf(Date.now()));

  const all = sessions.data || [];
  const names = useMemo(() => [...new Set(all.map((s) => s.subject || '').filter(Boolean))].sort(), [all.length]);
  const rows = useMemo(() => all.filter((s) => !subject || (subject === UNSET ? !s.subject : s.subject === subject)), [all, subject]);
  const byDay = useMemo(() => { const m = new Map(); for (const s of rows) { const k = dayKey(s.startedAt || 0); m.set(k, (m.get(k) || 0) + (Number(s.durationSec) || 0)); } return m; }, [rows]);
  const inRange = (from, to) => rows.filter((s) => s.startedAt >= from && s.startedAt < to);
  const split = (list) => { const m = new Map(); for (const s of list) { const n = s.subject || UNSET; m.set(n, (m.get(n) || 0) + (Number(s.durationSec) || 0)); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const sum = (list) => list.reduce((n, s) => n + (Number(s.durationSec) || 0), 0);

  if (sessions.loading) return <PageSkeleton rows={3} />;
  const today = startOfDay(Date.now());

  const filter = (
    <SelectField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
      <option value="">All subjects</option>
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
      <option value={UNSET}>No subject</option>
    </SelectField>
  );

  // ----- month calendar with shades, used by Day and Month -----
  const calendar = (selectable) => {
    const first = month; const lead = (new Date(first).getDay() + 6) % 7;
    const start = first - lead * DAY; const dim = new Date(new Date(first).getFullYear(), new Date(first).getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((lead + dim) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => start + i * DAY);
    const monthTotal = cells.filter((t) => t >= first && t < addMonths(first, 1)).reduce((n, t) => n + (byDay.get(dayKey(t)) || 0), 0);
    return (
      <div className="stack sm">
        <Nav label={new Date(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} onPrev={() => setMonth(addMonths(month, -1))} onNext={() => setMonth(addMonths(month, 1))} nextDisabled={addMonths(month, 1) > today} />
        <div className="stats-cal" role="grid" aria-label="Study time per day">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="muted small stats-dow">{d}</span>)}
          {cells.map((t) => {
            const sec = byDay.get(dayKey(t)) || 0; const inMonth = t >= first && t < addMonths(first, 1); const lv = levelOf(sec);
            const Tag = selectable && inMonth && t <= today ? 'button' : 'div';
            return (
              <Tag key={t} type={Tag === 'button' ? 'button' : undefined} className="stats-cell" data-sel={selectable && t === picked ? '1' : undefined} data-level={lv} style={{ opacity: inMonth ? 1 : 0.35, '--p': `${LEVEL_PCT[lv]}%` }} onClick={Tag === 'button' ? () => setPicked(t) : undefined} aria-label={`${new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}: ${word(sec)}`}>
                <span>{new Date(t).getDate()}</span><span className="t">{sec ? hm(sec) : ''}</span>
              </Tag>
            );
          })}
        </div>
        <div className="row between wrap"><span className="row" style={{ gap: 6 }} aria-hidden="true">{[0, 1, 2, 3, 4].map((l) => <span key={l} className="stats-key" style={{ '--p': `${LEVEL_PCT[l]}%` }} />)}<span className="muted small">more time</span></span><span className="muted small">{new Date(first).toLocaleDateString(undefined, { month: 'long' })}: {word(monthTotal)}</span></div>
      </div>
    );
  };

  let body;
  if (view === 'day') {
    const list = inRange(picked, picked + DAY);
    const total = sum(list); const longest = Math.max(0, ...list.map((s) => Number(s.durationSec) || 0));
    const started = list.length ? Math.min(...list.map((s) => s.startedAt)) : 0; const finished = list.length ? Math.max(...list.map((s) => s.startedAt + (Number(s.durationSec) || 0) * 1000)) : 0;
    body = (
      <>
        {calendar(true)}
        <Card className="stack">
          <h3 style={{ textAlign: 'center' }}>{new Date(picked).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
          <div className="grid cols-2" style={{ textAlign: 'center', rowGap: 14 }}>
            <div><div className="muted small">Total</div><strong style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{hms(total)}</strong></div>
            <div><div className="muted small">Longest focus</div><strong style={{ fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>{hms(longest)}</strong></div>
            <div><div className="muted small">Started</div><strong style={{ fontSize: 22 }}>{started ? fmtTime(started) : '-'}</strong></div>
            <div><div className="muted small">Finished</div><strong style={{ fontSize: 22 }}>{finished ? fmtTime(finished) : '-'}</strong></div>
          </div>
          <SectionTitle title="By subject" />
          <Bars rows={split(list)} total={total || 1} />
        </Card>
      </>
    );
  } else if (view === 'week') {
    const days = Array.from({ length: 7 }, (_, i) => week + i * DAY);
    const secs = days.map((t) => byDay.get(dayKey(t)) || 0); const max = Math.max(1800, ...secs);
    const list = inRange(week, week + 7 * DAY); const total = sum(list); const active = secs.filter(Boolean).length;
    body = (
      <>
        <Nav label={`${new Date(week).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} to ${new Date(week + 6 * DAY).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`} onPrev={() => setWeek(week - 7 * DAY)} onNext={() => setWeek(week + 7 * DAY)} nextDisabled={week + 7 * DAY > today} />
        <Card className="stack">
          <div className="row" style={{ alignItems: 'flex-end', gap: 8, height: 150 }} role="img" aria-label={`Study time each day: ${days.map((t, i) => `${new Date(t).toLocaleDateString(undefined, { weekday: 'short' })} ${word(secs[i])}`).join(', ')}`}>
            {days.map((t, i) => (
              <div key={t} style={{ flex: 1, textAlign: 'center' }}>
                <div className="muted small" style={{ minHeight: 18 }}>{secs[i] ? hm(secs[i]) : ''}</div>
                <div style={{ height: Math.max(4, (secs[i] / max) * 100), background: 'var(--accent, #1F5C4D)', opacity: secs[i] ? 1 : 0.18, borderRadius: 6 }} />
                <div className="muted small">{new Date(t).toLocaleDateString(undefined, { weekday: 'short' })}</div>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid cols-2">
          <Card className="stack sm"><div className="muted small">Total this week</div><strong style={{ fontSize: 26 }}>{word(total)}</strong></Card>
          <Card className="stack sm"><div className="muted small">Average on days you studied</div><strong style={{ fontSize: 26 }}>{active ? word(total / active) : '-'}</strong></Card>
        </div>
        <Card className="stack"><h3>By subject</h3><Bars rows={split(list)} total={total || 1} /></Card>
      </>
    );
  } else {
    const end = addMonths(month, 1); const list = inRange(month, end); const total = sum(list);
    const dayTotals = [...byDay.entries()].filter(([k]) => { const t = new Date(k + 'T00:00:00').getTime(); return t >= month && t < end; });
    const best = dayTotals.sort((a, b) => b[1] - a[1])[0];
    body = (
      <>
        {calendar(false)}
        <div className="grid cols-2">
          <Card className="stack sm"><div className="muted small">Total this month</div><strong style={{ fontSize: 26 }}>{word(total)}</strong></Card>
          <Card className="stack sm"><div className="muted small">Days studied</div><strong style={{ fontSize: 26 }}>{dayTotals.length}</strong></Card>
          <Card className="stack sm"><div className="muted small">Average on those days</div><strong style={{ fontSize: 26 }}>{dayTotals.length ? word(total / dayTotals.length) : '-'}</strong></Card>
          <Card className="stack sm"><div className="muted small">Best day</div><strong style={{ fontSize: 26 }}>{best ? `${new Date(best[0] + 'T00:00:00').getDate()}: ${word(best[1])}` : '-'}</strong></Card>
        </div>
        <Card className="stack"><h3>By subject</h3><Bars rows={split(list)} total={total || 1} /></Card>
      </>
    );
  }

  if (!all.length) return <Empty art="chart" title="No study time yet" text="Start the timer on the Timer tab. Every session of a minute or more shows up here, by day, week and month, split by subject." />;
  return (
    <div className="stack lg">
      <Seg label="Period" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      {filter}
      {body}
    </div>
  );
}

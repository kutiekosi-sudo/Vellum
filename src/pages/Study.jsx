import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive, useNow } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { PHASES, summarize, beep, minutesOf } from '../lib/study.js';
import { fmtClock, fmtDateTime, plural } from '../lib/util.js';
import { Badge, Button, Card, Empty, PageHead, Progress, SectionTitle, SelectField, Seg, TextField } from '../ui/kit.jsx';

const KEY = 'learnr.timer.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const write = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* optional */ } };

const SETTINGS_KEY = 'learnr.timer.settings';
const loadSettings = () => { try { return { focus: 25, short: 5, long: 15, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; } catch { return { focus: 25, short: 5, long: 15 }; } };

export default function Study() {
  const { user, toast, fail } = useApp();
  const sessions = useLive(`users/${user.uid}/studySessions`);
  const memberships = useLive(`users/${user.uid}/memberships`);
  const goalDoc = useLive(`users/${user.uid}/goals/daily`);
  const now = useNow(500);

  const [settings, setSettings] = useState(loadSettings);
  const [timer, setTimerState] = useState(() => read() || { phase: 'focus', status: 'idle', cycles: 0 });
  const [mode, setMode] = useState(() => (read() || {}).mode || 'solo');
  const [classId, setClassId] = useState(() => (read() || {}).classId || '');
  const [topic, setTopic] = useState(() => (read() || {}).topic || '');
  const finishing = useRef(false);

  const setTimer = (t) => { setTimerState(t); write(t); };
  const classes = memberships.data || [];
  const goal = (goalDoc.data && goalDoc.data.minutes) || 60;
  const list = (sessions.data || []).slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  const sum = summarize(list, now);

  const totalMs = (settings[timer.phase] || PHASES[timer.phase].defaultMin) * 60 * 1000;
  const leftMs = timer.status === 'running' ? Math.max(0, timer.endsAt - now) : timer.status === 'paused' ? timer.remainingMs : totalMs;
  const leftSec = Math.ceil(leftMs / 1000);

  const cls = classes.find((c) => (c.classId || c.id) === classId);
  const saveSession = async (durationSec, startedAt, completed) => {
    if (durationSec < 60) return false; // under a minute is not a study session
    try {
      await db.add(`users/${user.uid}/studySessions`, {
        startedAt, durationSec: Math.round(durationSec), completed, mode: timer.mode || mode,
        classId: (timer.mode || mode) === 'class' ? (timer.classId || classId || null) : null,
        className: (timer.mode || mode) === 'class' ? (timer.className || (cls && cls.className) || '') : '',
        topic: (timer.topic || topic || '').slice(0, 80), createdAt: Date.now(),
      });
      return true;
    } catch (e) { fail(e); return false; }
  };

  // The timer runs on timestamps, so it stays right if the tab sleeps or the page is reopened.
  useEffect(() => {
    if (timer.status !== 'running' || now < timer.endsAt || finishing.current) return;
    finishing.current = true;
    (async () => {
      if (timer.phase === 'focus') await saveSession(totalMs / 1000, timer.startedAt, true); // planned length, so time spent paused is not counted
      beep();
      const cycles = timer.phase === 'focus' ? (timer.cycles || 0) + 1 : timer.cycles || 0;
      const next = timer.phase === 'focus' ? (cycles % 4 === 0 ? 'long' : 'short') : 'focus';
      setTimer({ phase: next, status: 'idle', cycles, mode, classId, topic });
      toast(timer.phase === 'focus' ? 'Focus block done. Take a break.' : 'Break over. Ready when you are.');
      finishing.current = false;
    })();
  });

  useEffect(() => {
    document.title = timer.status === 'running' ? `${fmtClock(leftSec)} ${PHASES[timer.phase].label} - Learnr` : 'Learnr';
    return () => { document.title = 'Learnr'; };
  }, [timer.status, leftSec, timer.phase]);

  const start = () => {
    if (mode === 'class' && !classId) { toast('Pick which class you are studying for.', 'error'); return; }
    const t = Date.now();
    setTimer({
      ...timer, status: 'running', startedAt: timer.status === 'paused' ? timer.startedAt : t, endsAt: t + leftMs,
      mode, classId: mode === 'class' ? classId : '', className: cls ? cls.className : '', topic: topic.trim(),
    });
  };
  const pause = () => setTimer({ ...timer, status: 'paused', remainingMs: Math.max(0, timer.endsAt - Date.now()) });
  const stop = async () => {
    // Stop early: keep the time actually studied.
    if (timer.phase === 'focus' && timer.status !== 'idle') {
      const elapsed = (totalMs - leftMs) / 1000;
      if (await saveSession(elapsed, timer.startedAt, false)) toast(elapsed >= 60 ? `Saved ${plural(Math.round(elapsed / 60), 'minute')} of study.` : 'Stopped.');
    }
    setTimer({ phase: timer.phase, status: 'idle', cycles: timer.cycles || 0, mode, classId, topic });
  };
  const skipTo = (phase) => setTimer({ phase, status: 'idle', cycles: timer.cycles || 0, mode, classId, topic });

  const changeSetting = (k) => (e) => {
    const next = { ...settings, [k]: Math.max(1, Math.min(180, Number(e.target.value) || 1)) };
    setSettings(next); try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* optional */ }
  };
  const setGoal = async (e) => {
    const minutes = Math.max(10, Math.min(600, Number(e.target.value) || 60));
    try { await db.set(`users/${user.uid}/goals/daily`, { minutes, updatedAt: Date.now() }); } catch (er) { fail(er); }
  };

  const running = timer.status === 'running';
  const idle = timer.status === 'idle';
  const maxDay = Math.max(goal, ...sum.week.map((d) => d.min), 1);

  return (
    <div className="stack lg">
      <PageHead title="Study" sub="Study on your own or for one of your classes. Both count the same." />

      <Card className="stack" style={{ textAlign: 'center' }}>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <Seg label="Timer" value={timer.phase} onChange={skipTo} options={Object.entries(PHASES).map(([k, v]) => ({ value: k, label: v.label }))} />
        </div>
        <div aria-live="off" style={{ fontSize: 'clamp(56px, 18vw, 96px)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }} role="timer" aria-label={`${fmtClock(leftSec)} left`}>{fmtClock(leftSec)}</div>
        <Progress value={totalMs ? ((totalMs - leftMs) / totalMs) * 100 : 0} label="Timer progress" />
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          {running ? <Button size="lg" onClick={pause} icon="pause">Pause</Button> : <Button size="lg" onClick={start} icon="play">{timer.status === 'paused' ? 'Resume' : timer.phase === 'focus' ? 'Start focus' : 'Start break'}</Button>}
          {!idle && <Button size="lg" variant="ghost" onClick={stop}>{timer.phase === 'focus' ? 'Stop and save' : 'Skip break'}</Button>}
        </div>
        {timer.cycles > 0 && <p className="muted small">{plural(timer.cycles, 'focus block')} finished in this run. Every fourth block earns a long break.</p>}
      </Card>

      <Card className="stack">
        <h3>What are you studying?</h3>
        <Seg label="Study type" value={mode} onChange={(m) => { if (idle) setMode(m); }} options={[{ value: 'solo', label: 'On my own' }, { value: 'class', label: 'For a class' }]} />
        {mode === 'class' && (classes.length ? (
          <SelectField label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={!idle}>
            <option value="">Choose a class</option>
            {classes.map((c) => <option key={c.classId || c.id} value={c.classId || c.id}>{c.className}</option>)}
          </SelectField>
        ) : <p className="muted">You have not joined a class yet. You can still study on your own.</p>)}
        <TextField label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={80} disabled={!idle} placeholder="For example: photosynthesis" autoComplete="off" />
        {!idle || <details>
          <summary className="muted">Timer lengths</summary>
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <TextField label="Focus (min)" type="number" inputMode="numeric" min="1" max="180" value={settings.focus} onChange={changeSetting('focus')} />
            <TextField label="Short break (min)" type="number" inputMode="numeric" min="1" max="60" value={settings.short} onChange={changeSetting('short')} />
            <TextField label="Long break (min)" type="number" inputMode="numeric" min="1" max="60" value={settings.long} onChange={changeSetting('long')} />
          </div>
        </details>}
      </Card>

      <div className="grid cols-2">
        <Card className="stack sm">
          <div className="muted small">Today</div>
          <strong style={{ fontSize: 30 }}>{sum.today} min</strong>
          <Progress value={(sum.today / goal) * 100} label="Daily goal" />
          <TextField label="Daily goal (minutes)" type="number" inputMode="numeric" min="10" max="600" defaultValue={goal} key={goal} onBlur={setGoal} />
        </Card>
        <Card className="stack sm">
          <div className="muted small">Streak</div>
          <strong style={{ fontSize: 30 }}>{plural(sum.streak, 'day')}</strong>
          <span className="muted small">{sum.streak ? 'Study a little each day to keep it going.' : 'Study today to start a streak.'}</span>
          <span className="muted small">This week: {sum.weekTotal} min</span>
        </Card>
      </div>

      <Card className="stack sm">
        <h3>Last 7 days</h3>
        <div className="row" style={{ alignItems: 'flex-end', gap: 8, height: 120 }} role="img" aria-label={`Minutes studied each day this week: ${sum.week.map((d) => `${d.label} ${d.min}`).join(', ')}`}>
          {sum.week.map((d) => (
            <div key={d.t} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: Math.max(3, (d.min / maxDay) * 90), background: d.min >= goal ? 'var(--accent, #1F5C4D)' : 'color-mix(in srgb, var(--accent, #1F5C4D) 45%, #fff)', borderRadius: 6 }} title={`${d.min} min`} />
              <div className="muted small">{d.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <SectionTitle title="Recent sessions" />
      {sessions.loading ? null : list.length === 0 ? (
        <Empty art="focus" title="No study sessions yet" text="Start a focus block above. Anything over a minute is saved." />
      ) : (
        <Card className="list-card">
          {list.slice(0, 15).map((s) => (
            <div className="item-row" key={s.id}>
              <span className="grow">
                <strong className="break">{s.topic || (s.mode === 'class' ? s.className : 'Studying on my own')}</strong>
                <span className="muted small" style={{ display: 'block' }}>{fmtDateTime(s.startedAt)}{s.mode === 'class' && s.className ? `, ${s.className}` : ''}</span>
              </span>
              <Badge tone={s.completed ? 'ok' : ''}>{minutesOf(s)} min{s.completed ? '' : ', stopped early'}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

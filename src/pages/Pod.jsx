import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive, useNow } from '../lib/hooks.js';
import StudentIcon from '../ui/StudentIcon.jsx';
import { db } from '../backend/index.js';
import { createPod, joinPod, leavePod, closePod, syncMyStats, pushState } from '../lib/pods.js';
import { CLASS_COLORS, fmtDate, fmtMinutes, plural, relative, shortName } from '../lib/util.js';
import { Badge, Button, Card, CopyButton, Empty, Notice, PageHead, PageSkeleton, Seg, TextArea, TextField, useConfirm } from '../ui/kit.jsx';

const stateOf = (x, now) => (x.state === 'studying' || x.state === 'break') && x.stateEndsAt > now ? x.state : (x.state === 'break' && !x.stateEndsAt && x.stateSince > now - 15 * 60000 ? 'break' : 'idle');
const todayOf = (x, now) => {
  const base = x.todayDay === new Date(now).toDateString() ? (x.todayMin || 0) : 0;
  return stateOf(x, now) === 'studying' && x.stateSince ? base + Math.max(0, Math.floor((now - x.stateSince) / 60000)) : base;
};

const hms = (sec) => { sec = Math.max(0, Math.floor(sec)); const p = (n) => String(n).padStart(2, '0'); return `${Math.floor(sec / 3600)}:${p(Math.floor((sec % 3600) / 60))}:${p(sec % 60)}`; };
const ORDER = { studying: 0, break: 1, idle: 2 };

const PRESETS = [{ m: 30, l: '30 min' }, { m: 60, l: '1 hour' }, { m: 120, l: '2 hours' }, { m: 180, l: '3 hours' }, { m: 300, l: '5 hours' }];

function Countdown({ podId, now, mode = 'setup' }) {
  const { user, profile, fail } = useApp();
  const doc = useLive(`pods/${podId}/state/countdown`);
  const [custom, setCustom] = useState('');
  const c = doc.data;
  const live = c && c.active && c.endsAt > now;
  const set = async (minutes) => {
    if (!(minutes >= 5 && minutes <= 720)) return;
    const t = Date.now();
    try { await db.set(`pods/${podId}/state/countdown`, { minutes, startedAt: t, endsAt: t + minutes * 60000, by: shortName(profile.displayName), byUid: user.uid, active: true }); setCustom(''); } catch (e) { fail(e); }
  };
  const end = async () => { try { await db.set(`pods/${podId}/state/countdown`, { minutes: c.minutes, startedAt: c.startedAt, endsAt: c.endsAt, by: c.by || '', active: false, byUid: user.uid }); } catch (e) { fail(e); } };
  if (mode === 'display' && !live) return null;
  if (live) {
    const left = Math.ceil((c.endsAt - now) / 1000);
    const h = Math.floor(left / 3600); const mm = Math.floor((left % 3600) / 60); const ss = left % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return (
      <div className="stack sm" style={{ textAlign: 'center', padding: '8px 0' }}>
        <span className="muted small">{c.by || 'Someone'} started a {fmtMinutes(c.minutes)} group session</span>
        <strong role="timer" style={{ fontSize: 40, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>{h ? `${h}:` : ''}{pad(mm)}:{pad(ss)}</strong>
        <div><Button size="sm" variant="ghost" onClick={end}>End countdown</Button></div>
      </div>
    );
  }
  return (
    <div className="stack sm">
      <span className="muted small">Group countdown: agree to study together for a set time</span>
      <div className="row wrap">
        {PRESETS.map((x) => <Button key={x.m} size="sm" variant="ghost" onClick={() => set(x.m)}>{x.l}</Button>)}
        <input className="input" style={{ width: 90 }} type="number" inputMode="numeric" min="5" max="720" placeholder="Minutes" aria-label="Custom minutes" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <Button size="sm" disabled={!(Number(custom) >= 5)} onClick={() => set(Math.round(Number(custom)))}>Start</Button>
      </div>
    </div>
  );
}

const HUES = [
  { id: 'periwinkle', name: 'Periwinkle', h: 236, s: 62 }, { id: 'rose', name: 'Rose', h: 338, s: 55 }, { id: 'teal', name: 'Teal', h: 178, s: 50 },
  { id: 'burgundy', name: 'Burgundy', h: 349, s: 55 }, { id: 'sage', name: 'Sage', h: 140, s: 25 }, { id: 'lavender', name: 'Lavender', h: 262, s: 50 },
  { id: 'blue', name: 'Blue', h: 215, s: 65 }, { id: 'green', name: 'Green', h: 130, s: 45 }, { id: 'gold', name: 'Gold', h: 42, s: 60 }, { id: 'beige', name: 'Beige', h: 36, s: 28 },
];
const SHADE_L = [9, 20, 40, 78, 91];
// Dark shades get light icons and text; light shades get dark ones.
export const themeOf = (hue, i) => {
  const l = SHADE_L[i]; const bg = `hsl(${hue.h} ${Math.max(10, hue.s - (l < 15 ? 20 : 0))}% ${l}%)`;
  const fg = l < 50 ? `hsl(${hue.h} ${Math.min(90, hue.s + 20)}% 74%)` : `hsl(${hue.h} ${hue.s}% 24%)`;
  return { hue: hue.id, shade: i, bg, fg };
};

function ThemePicker({ podId, current }) {
  const { user, fail } = useApp();
  const [open, setOpen] = useState(current && current.hue ? current.hue : '');
  const save = async (t) => { try { await db.update(`users/${user.uid}/podMemberships/${podId}`, { theme: t }); } catch (e) { fail(e); } };
  const hue = HUES.find((h) => h.id === open);
  return (
    <div className="stack sm"><span className="muted small">Colour theme for how you see this pod (only you see it)</span>
      <div className="row wrap">{HUES.map((h) => <button key={h.id} type="button" title={h.name} aria-label={h.name} aria-pressed={open === h.id} onClick={() => setOpen(h.id)} style={{ width: 34, height: 34, borderRadius: 17, background: `hsl(${h.h} ${h.s}% 50%)`, border: open === h.id ? '3px solid #1F2328' : '2px solid #fff', boxShadow: '0 0 0 1px #c9c9c2' }} />)}</div>
      {hue && <div className="row wrap" role="group" aria-label={`${hue.name} shades`}>{SHADE_L.map((_, i) => { const t = themeOf(hue, i); return <button key={i} type="button" aria-label={`${hue.name} shade ${i + 1}`} aria-pressed={current && current.hue === hue.id && current.shade === i} onClick={() => save(t)} style={{ width: 46, height: 34, borderRadius: 10, background: t.bg, border: current && current.hue === hue.id && current.shade === i ? '3px solid #1F2328' : '1px solid #c9c9c2', color: t.fg, fontWeight: 700 }}>A</button>; })}</div>}
      {current && current.hue && <div><Button size="sm" variant="ghost" onClick={() => { setOpen(''); save({}); }}>Back to the default look</Button></div>}
    </div>
  );
}

function SpaceView({ list, now, user, theme }) {
  const rows = list.map((x) => {
    const st = stateOf(x, now);
    const base = (x.todayDay === new Date(now).toDateString() ? (x.todayMin || 0) : 0) * 60;
    const sec = st === 'studying' && x.stateSince ? base + Math.max(0, (now - x.stateSince) / 1000) : base;
    return { x, st, sec, min: sec / 60 };
  }).sort((a, b) => ORDER[a.st] - ORDER[b.st] || b.sec - a.sec);
  const themed = theme && theme.bg;
  return (
    <div className="stack">
      <div className={`pod-space${themed ? ' themed' : ''}`} style={themed ? { background: theme.bg, '--seat': theme.fg } : { '--seat': '#1F5C4D' }}>
        {rows.map(({ x, st, sec, min }) => (
          <div key={x.id} className="pod-seat" data-state={st}>
            <StudentIcon color={themed ? theme.fg : '#1F5C4D'} state={st} minutes={min} size={76} />
            <span className="nm">{x.name || 'Student'}</span>
            <span className="tm">{hms(sec)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PodChat({ m, isOwner }) {
  const { user, profile, fail } = useApp();
  const confirm = useConfirm();
  const msgs = useLive(`pods/${m.podId}/messages`, { orderBy: ['createdAt', 'desc'], limit: 100 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (msgs.data || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try { await db.add(`pods/${m.podId}/messages`, { uid: user.uid, name: shortName(profile.displayName), text: t.slice(0, 400), createdAt: Date.now() }); setText(''); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const remove = async (x) => { if (!(await confirm('Delete this message?', { title: 'Delete message', confirmLabel: 'Delete', danger: true }))) return; try { await db.del(`pods/${m.podId}/messages/${x.id}`); } catch (e) { fail(e); } };
  return (
    <div className="stack">
      <div className="stack sm">
        <TextArea label="Message your pod" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} rows={2} />
        <div><Button loading={busy} disabled={!text.trim()} onClick={send}>Send</Button></div>
      </div>
      {msgs.loading ? <PageSkeleton rows={2} /> : list.length === 0 ? <p className="muted">No messages yet. Say hello.</p> : (
        <Card className="list-card">
          {list.map((x) => (
            <div className="item-row" key={x.id} style={{ alignItems: 'flex-start' }}>
              <span className="grow"><strong>{x.name || 'Student'}</strong> <span className="muted small">{relative(x.createdAt)}</span><span className="pre break" style={{ display: 'block' }}>{x.text}</span></span>
              {(x.uid === user.uid || isOwner) && <Button size="sm" variant="ghost" onClick={() => remove(x)}>Delete</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function PodNotes({ m, isOwner }) {
  const { user, profile, fail, toast } = useApp();
  const confirm = useConfirm();
  const notes = useLive(`pods/${m.podId}/notes`, { orderBy: ['createdAt', 'desc'], limit: 50 });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (notes.data || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const share = async () => {
    setBusy(true);
    try { await db.add(`pods/${m.podId}/notes`, { uid: user.uid, name: shortName(profile.displayName), title: title.trim().slice(0, 100), body: body.trim().slice(0, 6000), createdAt: Date.now() }); setTitle(''); setBody(''); setOpen(false); toast('Notes shared with your pod'); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const remove = async (x) => { if (!(await confirm('Delete these notes for the whole pod?', { title: 'Delete notes', confirmLabel: 'Delete', danger: true }))) return; try { await db.del(`pods/${m.podId}/notes/${x.id}`); } catch (e) { fail(e); } };
  return (
    <div className="stack">
      {open ? (
        <Card className="stack sm">
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} autoComplete="off" />
          <TextArea label="Notes" value={body} onChange={(e) => setBody(e.target.value)} maxLength={6000} rows={8} />
          <div className="row wrap"><Button loading={busy} disabled={!title.trim() || !body.trim()} onClick={share}>Share with pod</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </Card>
      ) : <div><Button onClick={() => setOpen(true)}>Share notes</Button></div>}
      {notes.loading ? <PageSkeleton rows={2} /> : list.length === 0 ? <p className="muted">No shared notes yet.</p> : list.map((x) => (
        <Card key={x.id} className="stack sm">
          <div className="row between wrap"><strong className="break">{x.title}</strong><span className="muted small">{x.name || 'Student'}, {relative(x.createdAt)}</span></div>
          <div className="pre break">{x.body}</div>
          {(x.uid === user.uid || isOwner) && <div><Button size="sm" variant="ghost" onClick={() => remove(x)}>Delete</Button></div>}
        </Card>
      ))}
    </div>
  );
}

function PodView({ m, sessions }) {
  const { user, profile, fail, toast } = useApp();
  const confirm = useConfirm();
  const now = useNow(1000);
  const pod = useLive(`pods/${m.podId}`);
  const members = useLive(`pods/${m.podId}/members`);
  const [tab, setTab] = useState('space');
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || !pod.data || !sessions) return;
    synced.current = true;
    syncMyStats(user, profile, m.podId, sessions).catch(() => {});
  }, [pod.data, sessions]);

  const gone = !pod.loading && (!pod.data || pod.error);
  const list = (members.data || []).slice().sort((a, b) => (b.weekMinutes || 0) - (a.weekMinutes || 0));
  const me = list.find((x) => (x.uid || x.id) === user.uid);
  const ahead = me ? list.filter((x) => (x.uid || x.id) !== user.uid && (x.weekMinutes || 0) > (me.weekMinutes || 0)).length : 0;
  const others = list.length - 1;
  const remove = async (x) => {
    if (!(await confirm(`Remove ${x.name || 'this member'} from the pod?`, { title: 'Remove member', confirmLabel: 'Remove', danger: true }))) return;
    try { await db.del(`pods/${m.podId}/members/${x.uid || x.id}`); } catch (e) { fail(e); }
  };
  const leave = async () => {
    if (!(await confirm('Leave this pod?', { title: 'Leave pod', confirmLabel: 'Leave', danger: true }))) return;
    try { await leavePod(user, m.podId); toast('You left the pod'); } catch (e) { fail(e); }
  };
  const close = async () => {
    if (!(await confirm('Close this pod for everyone? The code stops working.', { title: 'Close pod', confirmLabel: 'Close pod', danger: true }))) return;
    try { await closePod(user, { id: m.podId, code: m.code }); toast('Pod closed'); } catch (e) { fail(e); }
  };

  if (gone) {
    return (
      <Card className="stack sm"><strong>{m.name}</strong><p className="muted">This pod was closed by its owner.</p><div><Button variant="ghost" size="sm" onClick={() => db.del(`users/${user.uid}/podMemberships/${m.podId}`).catch(fail)}>Remove from my list</Button></div></Card>
    );
  }
  return (
    <Card className="stack">
      <div className="row between wrap"><h3 className="break">{m.name}</h3><div className="row"><Badge>{m.code}</Badge><CopyButton text={m.code} /></div></div>
      <Seg label={`${m.name} sections`} value={tab} onChange={setTab} options={[{ value: 'space', label: 'Space' }, { value: 'chat', label: 'Chat' }, { value: 'notes', label: 'Notes' }, { value: 'board', label: 'This week' }, { value: 'settings', label: 'Settings' }]} />
      {members.loading ? <PageSkeleton rows={1} /> : tab === 'space' ? (
        <>
          <Countdown podId={m.podId} now={now} mode="display" />
          <SpaceView list={list} now={now} user={user} theme={m.theme} />
        </>
      ) : tab === 'settings' ? (
        <div className="stack lg">
          <div className="stack sm"><strong>Invite friends</strong><p className="muted">Share the pod name <strong>{m.name}</strong> and the code <strong>{m.code}</strong>. They need both to join, so the pod stays private.</p></div>
          <ThemePicker podId={m.podId} current={m.theme} />
          <Countdown podId={m.podId} now={now} />
          <p className="muted small">Study for 2 hours today and dots appear beside your head. Reach 5 hours and a flame appears above it. A faded icon means a break or away. The time under each name is today's study time. Pod members see your first name and last initial, whether you are studying, your minutes and your streak. Nothing else from your study space is shared.</p>
          <div className="row wrap">{m.owner ? <Button variant="ghost" size="sm" onClick={close}>Close pod</Button> : <Button variant="ghost" size="sm" onClick={leave}>Leave pod</Button>}</div>
        </div>
      ) : tab === 'chat' ? <PodChat m={m} isOwner={m.owner} /> : tab === 'notes' ? <PodNotes m={m} isOwner={m.owner} /> : (
        <>
          {others > 0 && me && (
            <Notice icon="info">{ahead === 0 ? 'You are ahead of everyone in your pod this week. Nicely done.' : ahead === others ? 'Everyone in your pod has studied more than you this week. A short session today would help you catch up. No pressure.' : `${ahead} of ${others} pod members have studied more than you this week.`}</Notice>
          )}
          <div className="stack sm">
            {list.map((x, i) => (
              <div key={x.id} className="row between" style={{ gap: 12 }}>
                <span className="break"><span className="muted small" style={{ marginRight: 8 }}>{i + 1}</span><strong>{x.name || 'Student'}</strong>{(x.uid || x.id) === user.uid ? ' (you)' : ''}</span>
                <span className="row" style={{ gap: 8 }}>
                  <Badge tone={x.streak ? 'ok' : ''}>{plural(x.streak || 0, 'day')} streak</Badge>
                  <Badge>{fmtMinutes(x.weekMinutes || 0)}</Badge>
                  {m.owner && (x.uid || x.id) !== user.uid && <Button size="sm" variant="ghost" onClick={() => remove(x)}>Remove</Button>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function Pods() {
  const { user, profile, fail, toast } = useApp();
  const mine = useLive(`users/${user.uid}/podMemberships`);
  const sessions = useLive(`users/${user.uid}/studySessions`);
  const [name, setName] = useState('');
  const [jname, setJname] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const list = (mine.data || []).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const create = async () => { setBusy('c'); try { await createPod(user, profile, name); setName(''); toast('Pod created. Share its name and code.'); } catch (e) { fail(e); } finally { setBusy(''); } };
  const join = async () => { setBusy('j'); try { await joinPod(user, profile, code, jname); setCode(''); setJname(''); toast('You joined the pod'); } catch (e) { fail(e); } finally { setBusy(''); } };
  return (
    <div className="stack lg">
      {list.length === 0 && !mine.loading && <p className="muted">A study pod is a small private group of friends who keep each other going. You see who is studying, who is on a break, and each other's minutes. It works whether or not you are in a class.</p>}
      {mine.loading ? <PageSkeleton rows={2} /> : list.length === 0 ? <Empty art="pod" title="You are not in a pod yet" text="Create one and share its name and code, or join a friend's pod." /> : list.map((m) => <PodView key={m.podId} m={m} sessions={sessions.data} />)}
      <details open={list.length === 0}>
      <summary className="muted" style={{ cursor: 'pointer', marginBottom: 12 }}>Start or join another pod</summary>
      <div className="grid cols-2">
        <Card className="stack sm"><strong>Start a pod</strong><TextField label="Pod name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" /><div><Button loading={busy === 'c'} disabled={!name.trim()} onClick={create}>Create pod</Button></div></Card>
        <Card className="stack sm"><strong>Join a pod</strong><TextField label="Pod name" value={jname} onChange={(e) => setJname(e.target.value)} maxLength={60} autoComplete="off" /><TextField label="Pod code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="POD-XXXX" maxLength={12} autoComplete="off" /><div><Button loading={busy === 'j'} disabled={code.trim().length < 5 || !jname.trim()} onClick={join}>Join pod</Button></div></Card>
      </div>
      </details>
    </div>
  );
}

const TYPE_LABEL = { plan: 'Study plan', time: 'Short on time', next: 'Next step' };

function Trail() {
  const { user } = useApp();
  const doc = useLive(`users/${user.uid}/goals/ledger`);
  const entries = ((doc.data && doc.data.entries) || []).slice().reverse();
  if (doc.loading) return <PageSkeleton rows={2} />;
  if (!entries.length) return <Empty art="chart" title="No decisions yet" text="When Learnr makes you a plan or tells you what to do next, the reasons are kept here." />;
  return (
    <div className="stack">
      <p className="muted">Why Learnr suggested what it did. Only you can see this.</p>
      <Card className="list-card">
        {entries.map((e, i) => (
          <div key={i} className="item-row" style={{ alignItems: 'flex-start' }}>
            <span className="grow"><strong className="break">{e.title}</strong><span className="pre muted" style={{ display: 'block' }}>{e.reasoning}</span></span>
            <span className="stack sm" style={{ alignItems: 'flex-end' }}><Badge>{TYPE_LABEL[e.type] || 'Note'}</Badge><span className="muted small">{fmtDate(e.at)}</span></span>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function Pod() {
  const [tab, setTab] = useState('pod');
  return (
    <div className="stack lg">
      <PageHead title="Study Pod" sub="Study with friends and see why Learnr suggests what it does." />
      <Seg label="Pod sections" value={tab} onChange={setTab} options={[{ value: 'pod', label: 'My pods' }, { value: 'trail', label: 'Reasoning trail' }]} />
      {tab === 'pod' ? <Pods /> : <Trail />}
    </div>
  );
}

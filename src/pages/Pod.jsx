import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive, useNow } from '../lib/hooks.js';
import StudentIcon, { DEFAULT_ICON, ICON_COLORS, ICON_STYLES, SKIN_TONES, HEAT_FIRE_MIN, HEAT_WAVES_MIN } from '../ui/StudentIcon.jsx';
import { db } from '../backend/index.js';
import { createPod, joinPod, leavePod, closePod, syncMyStats } from '../lib/pods.js';
import { fmtDate, fmtMinutes, plural, relative, shortName } from '../lib/util.js';
import { Badge, Button, Card, CopyButton, Empty, Notice, PageHead, PageSkeleton, Seg, TextArea, TextField, useConfirm } from '../ui/kit.jsx';

const stateOf = (x, now) => (x.state === 'studying' || x.state === 'break') && x.stateEndsAt > now ? x.state : (x.state === 'break' && !x.stateEndsAt && x.stateSince > now - 15 * 60000 ? 'break' : 'idle');
const todayOf = (x, now) => {
  const base = x.todayDay === new Date(now).toDateString() ? (x.todayMin || 0) : 0;
  return stateOf(x, now) === 'studying' && x.stateSince ? base + Math.max(0, Math.floor((now - x.stateSince) / 60000)) : base;
};
const SPACE_GROUPS = [['studying', 'Studying now'], ['break', 'On a break'], ['idle', 'Not studying right now']];

function IconEditor({ onClose }) {
  const { profile, patchProfile, fail, toast } = useApp();
  const cur = { ...DEFAULT_ICON, ...((profile.settings && profile.settings.avatar) || {}) };
  const [icon, setIcon] = useState(cur);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await patchProfile({ settings: { ...(profile.settings || {}), avatar: icon } });
      toast('Your student is saved');
      onClose(icon);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Card className="stack">
      <div className="row between wrap"><h3>Your student</h3><StudentIcon icon={icon} state="studying" size={80} /></div>
      <div className="stack sm"><span className="muted small">Style</span>
        <div className="row wrap">{ICON_STYLES.map((s) => <Button key={s.id} size="sm" variant={icon.style === s.id ? 'primary' : 'ghost'} onClick={() => setIcon({ ...icon, style: s.id })}>{s.label}</Button>)}</div></div>
      <div className="stack sm"><span className="muted small">Colour</span>
        <div className="row wrap">{ICON_COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={icon.color === c} onClick={() => setIcon({ ...icon, color: c })} style={{ width: 36, height: 36, borderRadius: 18, background: c, border: icon.color === c ? '3px solid #1F2328' : '2px solid #fff', boxShadow: '0 0 0 1px #c9c9c2' }} />)}</div></div>
      <div className="stack sm"><span className="muted small">Skin tone</span>
        <div className="row wrap">{SKIN_TONES.map((c) => <button key={c} type="button" aria-label={`Skin tone ${c}`} aria-pressed={icon.skin === c} onClick={() => setIcon({ ...icon, skin: c })} style={{ width: 36, height: 36, borderRadius: 18, background: c, border: icon.skin === c ? '3px solid #1F2328' : '2px solid #fff', boxShadow: '0 0 0 1px #c9c9c2' }} />)}</div></div>
      <div className="row wrap"><Button loading={busy} onClick={save}>Save my student</Button><Button variant="ghost" onClick={() => onClose(null)}>Cancel</Button></div>
    </Card>
  );
}

function SpaceView({ m, list, now, user }) {
  const { profile } = useApp();
  const [editing, setEditing] = useState(false);
  const myIcon = (profile.settings && profile.settings.avatar) || null;
  const rows = list.map((x) => ({ x, st: stateOf(x, now), min: todayOf(x, now) }));
  return (
    <div className="stack">
      {editing ? <IconEditor onClose={() => setEditing(false)} /> : <div><Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Change my student</Button></div>}
      {SPACE_GROUPS.map(([k, label]) => {
        const group = rows.filter((r) => r.st === k);
        if (!group.length) return null;
        return (
          <div className="stack sm" key={k}>
            <strong>{label} <span className="muted small">({group.length})</span></strong>
            <div className="pod-space" data-group={k}>
              {group.map(({ x, st, min }) => {
                const mine = (x.uid || x.id) === user.uid;
                return (
                  <div key={x.id} className={`pod-seat${mine ? ' is-me' : ''}`} data-state={st}>
                    <StudentIcon icon={mine && myIcon ? myIcon : x.avatar} state={st} minutes={min} size={64} />
                    <span className="nm">{x.name || 'Student'}{mine ? ' (you)' : ''}</span>
                    <span className="muted small">{min > 0 ? `${fmtMinutes(min)} today` : 'Not yet today'}</span>
                    {st === 'studying' && min >= HEAT_FIRE_MIN && <Badge tone="warn">On fire</Badge>}
                    {st === 'studying' && min >= HEAT_WAVES_MIN && min < HEAT_FIRE_MIN && <Badge>Heating up</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="muted small">Study for 2 hours today and your student heats up. Reach 5 hours and it catches fire. A grey student is on a break.</p>
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
  const now = useNow(30000);
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
      <Seg label={`${m.name} sections`} value={tab} onChange={setTab} options={[{ value: 'space', label: 'Space' }, { value: 'chat', label: 'Chat' }, { value: 'notes', label: 'Notes' }, { value: 'board', label: 'This week' }]} />
      {members.loading ? <PageSkeleton rows={1} /> : tab === 'space' ? (
        <>
          {others === 0 && <p className="muted">Share the pod name <strong>{m.name}</strong> and code <strong>{m.code}</strong> with friends. They need both to join.</p>}
          <SpaceView m={m} list={list} now={now} user={user} />
        </>
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
      <p className="muted small">Pod members see your first name and last initial, your student icon, whether you are studying, minutes studied and your streak. Nothing else from your study space is shared. The pod is private: people need both its name and code to join.</p>
      <div className="row wrap">{m.owner ? <Button variant="ghost" size="sm" onClick={close}>Close pod</Button> : <Button variant="ghost" size="sm" onClick={leave}>Leave pod</Button>}</div>
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
      <p className="muted">A study pod is a small private group of friends who keep each other going. You see who is studying, who is on a break, and each other's minutes. It works whether or not you are in a class.</p>
      {mine.loading ? <PageSkeleton rows={2} /> : list.length === 0 ? <Empty art="pod" title="You are not in a pod yet" text="Create one and share its name and code, or join a friend's pod." /> : list.map((m) => <PodView key={m.podId} m={m} sessions={sessions.data} />)}
      <div className="grid cols-2">
        <Card className="stack sm"><strong>Start a pod</strong><TextField label="Pod name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" /><div><Button loading={busy === 'c'} disabled={!name.trim()} onClick={create}>Create pod</Button></div></Card>
        <Card className="stack sm"><strong>Join a pod</strong><TextField label="Pod name" value={jname} onChange={(e) => setJname(e.target.value)} maxLength={60} autoComplete="off" /><TextField label="Pod code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="POD-XXXX" maxLength={12} autoComplete="off" /><div><Button loading={busy === 'j'} disabled={code.trim().length < 5 || !jname.trim()} onClick={join}>Join pod</Button></div></Card>
      </div>
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

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { createPod, joinPod, leavePod, closePod, syncMyStats } from '../lib/pods.js';
import { fmtDate, plural } from '../lib/util.js';
import { Badge, Button, Card, CopyButton, Empty, Notice, PageHead, PageSkeleton, Seg, TextField, useConfirm } from '../ui/kit.jsx';

function PodView({ m, sessions }) {
  const { user, profile, fail, toast } = useApp();
  const confirm = useConfirm();
  const pod = useLive(`pods/${m.podId}`);
  const members = useLive(`pods/${m.podId}/members`);
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
      {members.loading ? <PageSkeleton rows={1} /> : (
        <>
          {others > 0 && me && (
            <Notice icon="info">{ahead === 0 ? 'You are ahead of everyone in your pod this week. Nicely done.' : ahead === others ? 'Everyone in your pod has studied more than you this week. A short session today would help you catch up. No pressure.' : `${ahead} of ${others} pod members have studied more than you this week.`}</Notice>
          )}
          {others === 0 && <p className="muted">Share the code <strong>{m.code}</strong> with friends so they can join you.</p>}
          <div className="stack sm">
            {list.map((x, i) => (
              <div key={x.id} className="row between" style={{ gap: 12 }}>
                <span className="break"><span className="muted small" style={{ marginRight: 8 }}>{i + 1}</span><strong>{x.name || 'Student'}</strong>{(x.uid || x.id) === user.uid ? ' (you)' : ''}</span>
                <span className="row" style={{ gap: 8 }}>
                  <Badge tone={x.streak ? 'ok' : ''}>{plural(x.streak || 0, 'day')} streak</Badge>
                  <Badge>{x.weekMinutes || 0} min</Badge>
                  {m.owner && (x.uid || x.id) !== user.uid && <Button size="sm" variant="ghost" onClick={() => remove(x)}>Remove</Button>}
                </span>
              </div>
            ))}
          </div>
          <p className="muted small">Pod members see only your first name and last initial, your minutes this week and your streak. Nothing else from your study space is shared.</p>
        </>
      )}
      <div className="row wrap">{m.owner ? <Button variant="ghost" size="sm" onClick={close}>Close pod</Button> : <Button variant="ghost" size="sm" onClick={leave}>Leave pod</Button>}</div>
    </Card>
  );
}

function Pods() {
  const { user, profile, fail, toast } = useApp();
  const mine = useLive(`users/${user.uid}/podMemberships`);
  const sessions = useLive(`users/${user.uid}/studySessions`);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const list = (mine.data || []).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const create = async () => { setBusy('c'); try { await createPod(user, profile, name); setName(''); toast('Pod created. Share its code.'); } catch (e) { fail(e); } finally { setBusy(''); } };
  const join = async () => { setBusy('j'); try { await joinPod(user, profile, code); setCode(''); toast('You joined the pod'); } catch (e) { fail(e); } finally { setBusy(''); } };
  return (
    <div className="stack lg">
      <p className="muted">A study pod is a small group of friends who keep each other going. You see each other's weekly study minutes and streaks, and nothing else. It works whether or not you are in a class.</p>
      {mine.loading ? <PageSkeleton rows={2} /> : list.length === 0 ? <Empty art="pod" title="You are not in a pod yet" text="Create one and share the code, or join a friend's pod." /> : list.map((m) => <PodView key={m.podId} m={m} sessions={sessions.data} />)}
      <div className="grid cols-2">
        <Card className="stack sm"><strong>Start a pod</strong><TextField label="Pod name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" /><div><Button loading={busy === 'c'} disabled={!name.trim()} onClick={create}>Create pod</Button></div></Card>
        <Card className="stack sm"><strong>Join a pod</strong><TextField label="Pod code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="POD-XXXX" maxLength={12} autoComplete="off" /><div><Button loading={busy === 'j'} disabled={code.trim().length < 5} onClick={join}>Join pod</Button></div></Card>
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

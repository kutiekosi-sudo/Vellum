import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive, useNow } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { href } from '../../lib/router.js';
import { fmtClock, relative, shortName } from '../../lib/util.js';
import { Badge, Button, Card, Empty, Notice, PageSkeleton, SectionTitle, TextArea, useConfirm } from '../../ui/kit.jsx';

// A calm shared space for one class: see who is focusing right now, and chat briefly about studying.
// The teacher can see everything, delete messages, and switch the room off.
export default function Room({ cls, isOwner }) {
  const { user, profile, fail, toast } = useApp();
  const confirm = useConfirm();
  const now = useNow(1000);
  const presence = useLive(`classes/${cls.id}/presence`);
  const msgs = useLive(`classes/${cls.id}/room`, { orderBy: ['createdAt', 'desc'], limit: 60 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const open = cls.roomOpen !== false;
  const here = (presence.data || []).filter((p) => p.endsAt > now).sort((a, b) => a.startedAt - b.startedAt);
  const list = (msgs.data || []).slice().sort((a, b) => b.createdAt - a.createdAt);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await db.add(`classes/${cls.id}/room`, { uid: user.uid, name: isOwner ? (profile.displayName || 'Teacher') : shortName(profile.displayName), text: t.slice(0, 300), createdAt: Date.now() });
      setText('');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const remove = async (m) => { try { await db.del(`classes/${cls.id}/room/${m.id}`); } catch (e) { fail(e); } };
  const toggle = async () => {
    if (open && !(await confirm('Students will not be able to post new messages. Existing messages stay.', { title: 'Close the study room', confirmLabel: 'Close it' }))) return;
    try { await db.update(`classes/${cls.id}`, { roomOpen: !open }); toast(open ? 'Study room closed' : 'Study room open'); } catch (e) { fail(e); }
  };

  return (
    <div className="stack lg">
      <Card className="stack sm">
        <div className="row between"><strong>Studying right now</strong><Badge tone={here.length ? 'ok' : ''}>{here.length}</Badge></div>
        {presence.loading ? <PageSkeleton rows={1} /> : here.length === 0 ? (
          <p className="muted">Nobody is focusing at the moment. {isOwner ? '' : 'Start a focus session in Study, choose "For a class" and tick "Show me in the class study room".'}</p>
        ) : here.map((p) => (
          <div key={p.id} className="row between"><span className="break"><strong>{p.name}</strong>{p.topic ? `, ${p.topic}` : ''}</span><span className="muted small" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtClock(Math.max(0, Math.round((p.endsAt - now) / 1000)))} left</span></div>
        ))}
        {!isOwner && <a className="btn ghost sm" href={href('/study')}>Start a focus session</a>}
      </Card>

      {isOwner && (
        <Card className="row between wrap">
          <span>{open ? 'Students can post in the study room.' : 'The study room is closed to new messages.'}</span>
          <Button variant="ghost" size="sm" onClick={toggle}>{open ? 'Close the room' : 'Open the room'}</Button>
        </Card>
      )}

      <SectionTitle title="Room chat" />
      <Notice icon="info">This room is for studying together. Your teacher can see it. Keep it kind and on topic.</Notice>
      {open || isOwner ? (
        <Card className="stack sm">
          <TextArea label="Message" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} hint="Up to 300 characters." />
          <div><Button loading={busy} disabled={!text.trim()} onClick={send}>Post</Button></div>
        </Card>
      ) : !isOwner && <Notice tone="warn">Your teacher has closed the room for now.</Notice>}
      {msgs.loading ? <PageSkeleton rows={2} /> : list.length === 0 ? <Empty art="pod" title="No messages yet" text="Say hello or share what you are studying." /> : (
        <Card className="list-card">
          {list.map((m) => (
            <div key={m.id} className="item-row" style={{ alignItems: 'flex-start' }}>
              <span className="grow"><strong>{m.name}</strong> <span className="muted small">{relative(m.createdAt)}</span><span className="pre break" style={{ display: 'block' }}>{m.text}</span></span>
              {(isOwner || m.uid === user.uid) && <Button size="sm" variant="ghost" onClick={() => remove(m)}>Delete</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

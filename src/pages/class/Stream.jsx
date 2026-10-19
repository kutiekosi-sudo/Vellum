import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { relative } from '../../lib/util.js';
import { notify, activeStudentIds } from '../../lib/classwork.js';
import { Button, Card, Empty, ErrorBlock, PageSkeleton, TextArea, Avatar, IconButton, useConfirm } from '../../ui/kit.jsx';
import { AttachmentList, AttachmentPicker } from '../../ui/Attachments.jsx';

function Composer({ cls }) {
  const { user, profile, fail, toast } = useApp();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const post = async () => {
    if (!text.trim() && !files.length) return;
    setBusy(true);
    try {
      await db.add(`classes/${cls.id}/announcements`, { text: text.trim(), attachments: files, authorId: user.uid, authorName: profile.displayName || 'Teacher', createdAt: Date.now() });
      setText(''); setFiles([]); toast('Announcement posted');
      activeStudentIds(cls.id).then((ids) => notify(ids, { fromUid: user.uid, classId: cls.id, type: 'announcement', title: `New announcement in ${cls.name}`, body: text.trim(), link: `/class/${cls.id}` })).catch(console.error);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <Card className="stack">
      <TextArea label="Announce something to your class" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Share an update, a reminder or a note" />
      <AttachmentPicker value={files} onChange={setFiles} classId={cls.id} context="announcement" />
      <div><Button loading={busy} disabled={!text.trim() && !files.length} onClick={post}>Post</Button></div>
    </Card>
  );
}

export default function Stream({ cls, isOwner }) {
  const { fail, toast } = useApp();
  const confirm = useConfirm();
  const list = useLive(`classes/${cls.id}/announcements`);
  const items = (list.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const remove = async (a) => {
    if (!(await confirm('Delete this announcement? Students will no longer see it.', { title: 'Delete announcement', confirmLabel: 'Delete', danger: true }))) return;
    try { await db.del(`classes/${cls.id}/announcements/${a.id}`); toast('Deleted'); } catch (e) { fail(e); }
  };
  return (
    <div className="stack">
      {isOwner && <Composer cls={cls} />}
      {list.loading ? <PageSkeleton rows={2} /> : list.error ? <ErrorBlock error={list.error} /> : items.length === 0 ? (
        <Empty art="sent" title="No announcements yet" text={isOwner ? 'Post your first update above.' : 'Updates from your teacher will show up here.'} />
      ) : (
        <Card className="stack" style={{ gap: 0 }}>
          {items.map((a) => (
            <div className="post" key={a.id}>
              <Avatar name={a.authorName} />
              <div className="body">
                <div className="row"><strong className="grow break">{a.authorName}</strong><span className="muted small">{relative(a.createdAt)}</span>
                  {isOwner && <IconButton icon="trash" label="Delete announcement" size="sm" onClick={() => remove(a)} />}</div>
                {a.text && <p className="pre break" style={{ marginTop: 4 }}>{a.text}</p>}
                <AttachmentList items={a.attachments} classId={cls.id} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

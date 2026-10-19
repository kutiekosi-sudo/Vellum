import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { relative } from '../../lib/util.js';
import { notify, activeStudentIds } from '../../lib/classwork.js';
import { Button, Card, Check, Empty, ErrorBlock, Modal, PageSkeleton, SectionTitle, TextArea, TextField, Badge, IconButton, useConfirm } from '../../ui/kit.jsx';
import { AttachmentList, AttachmentPicker } from '../../ui/Attachments.jsx';

function Editor({ cls, onClose }) {
  const { user, fail, toast } = useApp();
  const [f, setF] = useState({ title: '', description: '', topic: '', published: true });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) { setErr('Give the resource a title.'); return; }
    if (!files.length && !f.description.trim()) { setErr('Add a file, a link or a few words of description.'); return; }
    setBusy(true);
    try {
      await db.add(`classes/${cls.id}/resources`, { title: f.title.trim(), description: f.description.trim(), topic: f.topic.trim(), attachments: files, published: f.published, createdAt: Date.now() });
      toast(f.published ? 'Resource shared' : 'Saved as a draft');
      if (f.published) activeStudentIds(cls.id).then((ids) => notify(ids, { fromUid: user.uid, classId: cls.id, type: 'resource', title: `New resource in ${cls.name}`, body: f.title.trim(), link: `/class/${cls.id}/resources` })).catch(console.error);
      onClose();
    } catch (e2) { fail(e2); setBusy(false); }
  };
  return (
    <Modal title="Add a resource" onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <TextField label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={err} maxLength={120} data-autofocus autoComplete="off" />
        <TextField label="Topic (optional)" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} maxLength={80} placeholder="e.g. Acids and bases" autoComplete="off" />
        <TextArea label="Description (optional)" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} />
        <AttachmentPicker value={files} onChange={setFiles} classId={cls.id} context="resource" />
        <Check label="Share with students now" hint="Turn this off to keep it as a draft only you can see." checked={f.published} onChange={(v) => setF({ ...f, published: v })} />
        <Button type="submit" block loading={busy}>Save resource</Button>
      </form>
    </Modal>
  );
}

export default function Resources({ cls, isOwner }) {
  const { fail, toast } = useApp();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  // Students may only list published resources, so the query says so (the security rules require it).
  const list = useLive(`classes/${cls.id}/resources`, isOwner ? undefined : { where: [['published', '==', true]] });
  const items = (list.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const toggle = async (r) => { try { await db.update(`classes/${cls.id}/resources/${r.id}`, { published: !r.published }); } catch (e) { fail(e); } };
  const remove = async (r) => {
    if (!(await confirm(`Delete "${r.title}"?`, { title: 'Delete resource', confirmLabel: 'Delete', danger: true }))) return;
    try { await db.del(`classes/${cls.id}/resources/${r.id}`); toast('Deleted'); } catch (e) { fail(e); }
  };
  return (
    <div className="stack">
      {isOwner && <div><Button icon="plus" onClick={() => setOpen(true)}>Add resource</Button></div>}
      {list.loading ? <PageSkeleton rows={2} /> : list.error ? <ErrorBlock error={list.error} /> : items.length === 0 ? (
        <Empty art="folder" title="No resources yet" text={isOwner ? 'Share notes, past questions or links for your class.' : 'Notes and materials from your teacher will appear here.'} />
      ) : items.map((r) => (
        <Card key={r.id} className="stack sm">
          <div className="row top">
            <div className="grow"><h3 className="break">{r.title}</h3><div className="muted small">{[r.topic, relative(r.createdAt)].filter(Boolean).join(', ')}</div></div>
            {isOwner && !r.published && <Badge tone="warn">Draft</Badge>}
            {isOwner && <><Button size="sm" variant="secondary" onClick={() => toggle(r)}>{r.published ? 'Unshare' : 'Share'}</Button><IconButton icon="trash" label={`Delete ${r.title}`} size="sm" onClick={() => remove(r)} /></>}
          </div>
          {r.description && <p className="pre break">{r.description}</p>}
          <AttachmentList items={r.attachments} classId={cls.id} />
        </Card>
      ))}
      {open && <Editor cls={cls} onClose={() => setOpen(false)} />}
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive, useNow } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { href } from '../../lib/router.js';
import { dueLabel, toLocalInput, fromLocalInput, plural } from '../../lib/util.js';
import { notify, activeStudentIds, submissionState } from '../../lib/classwork.js';
import { Badge, Button, Card, Check, Empty, ErrorBlock, Modal, PageSkeleton, TextArea, TextField } from '../../ui/kit.jsx';
import { AttachmentPicker } from '../../ui/Attachments.jsx';
import { Icon } from '../../ui/icons.jsx';

export function AssignmentEditor({ cls, assignment, onClose }) {
  const { user, fail, toast } = useApp();
  const editing = !!assignment;
  const [f, setF] = useState({
    title: assignment ? assignment.title : '',
    instructions: assignment ? assignment.instructions || '' : '',
    points: assignment ? String(assignment.points) : '100',
    due: assignment ? toLocalInput(assignment.dueAt) : '',
    allowResubmit: assignment ? !!assignment.allowResubmit : false,
    published: assignment ? !!assignment.published : true,
  });
  const [files, setFiles] = useState(assignment ? assignment.attachments || [] : []);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const er = {};
    if (!f.title.trim()) er.title = 'Give the assignment a title.';
    const pts = Number(f.points);
    if (!Number.isFinite(pts) || pts < 1 || pts > 1000) er.points = 'Enter points between 1 and 1000.';
    if (f.due && fromLocalInput(f.due) == null) er.due = 'That date is not valid.';
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const data = {
      title: f.title.trim(), instructions: f.instructions.trim(), points: pts, dueAt: fromLocalInput(f.due),
      allowResubmit: f.allowResubmit, published: f.published, attachments: files,
    };
    try {
      let id;
      if (editing) { id = assignment.id; await db.update(`classes/${cls.id}/assignments/${id}`, data); }
      else id = await db.add(`classes/${cls.id}/assignments`, { ...data, createdAt: Date.now(), teacherId: user.uid });
      toast(f.published ? (editing ? 'Assignment updated' : 'Assignment posted') : 'Saved as a draft');
      if (f.published && !(editing && assignment.published)) {
        activeStudentIds(cls.id).then((ids) => notify(ids, { fromUid: user.uid, classId: cls.id, type: 'assignment', title: `New assignment in ${cls.name}`, body: data.title, link: `/class/${cls.id}/classwork/${id}` })).catch(console.error);
      }
      onClose();
    } catch (e2) { fail(e2); setBusy(false); }
  };
  return (
    <Modal title={editing ? 'Edit assignment' : 'New assignment'} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <TextField label="Title" value={f.title} onChange={set('title')} error={errs.title} maxLength={140} data-autofocus autoComplete="off" />
        <TextArea label="Instructions" rows={5} value={f.instructions} onChange={set('instructions')} maxLength={6000} />
        <div className="grid cols-2">
          <TextField label="Points" type="number" inputMode="numeric" min="1" max="1000" value={f.points} onChange={set('points')} error={errs.points} />
          <TextField label="Due (optional)" type="datetime-local" value={f.due} onChange={set('due')} error={errs.due} />
        </div>
        <div className="field"><label>Materials</label>
          <AttachmentPicker value={files} onChange={setFiles} classId={cls.id} context="assignment" assignmentId={assignment && assignment.id} /></div>
        <Check label="Allow students to resubmit" hint="Otherwise a student can hand in once, unless you return their work." checked={f.allowResubmit} onChange={(v) => setF({ ...f, allowResubmit: v })} />
        <Check label="Share with students now" hint="Turn this off to keep it as a draft only you can see." checked={f.published} onChange={(v) => setF({ ...f, published: v })} />
        <Button type="submit" block loading={busy}>{editing ? 'Save changes' : f.published ? 'Post assignment' : 'Save draft'}</Button>
      </form>
    </Modal>
  );
}

function Row({ cls, a, right, to }) {
  return (
    <a className="item-row" href={to}>
      <span className="ic"><Icon name="clipboard" /></span>
      <span className="grow"><strong className="break">{a.title}</strong><span className="muted small" style={{ display: 'block' }}>{dueLabel(a.dueAt)}, {plural(a.points, 'point')}</span></span>
      {right}
    </a>
  );
}

function TeacherRow({ cls, a, total }) {
  const subs = useLive(`classes/${cls.id}/assignments/${a.id}/submissions`);
  const handed = subs.data ? subs.data.length : null;
  const toGrade = subs.data ? subs.data.filter((s) => ['submitted', 'late', 'resubmitted'].includes(submissionState(s, a).key)).length : 0;
  return (
    <Row cls={cls} a={a} to={href(`/class/${cls.id}/classwork/${a.id}`)} right={<>
      {!a.published && <Badge tone="warn">Draft</Badge>}
      {a.published && handed != null && <Badge tone={toGrade ? 'info' : ''}>{handed} of {total} in{toGrade ? `, ${toGrade} to grade` : ''}</Badge>}
    </>} />
  );
}

function StudentRow({ cls, a, uid }) {
  const mine = useLive(`classes/${cls.id}/assignments/${a.id}/submissions/${uid}`);
  const st = submissionState(mine.data || null, a);
  const label = st.key === 'graded' ? `${mine.data.grade} / ${a.points}` : st.label;
  return <Row cls={cls} a={a} to={href(`/class/${cls.id}/classwork/${a.id}`)} right={mine.loading ? null : <Badge tone={st.tone}>{label}</Badge>} />;
}

export default function Classwork({ cls, isOwner }) {
  const { user } = useApp();
  useNow(60000);
  const [edit, setEdit] = useState(null); // null | 'new' | assignment
  const list = useLive(`classes/${cls.id}/assignments`, isOwner ? undefined : { where: [['published', '==', true]] });
  const members = useLive(isOwner ? `classes/${cls.id}/members` : null);
  const total = (members.data || []).filter((m) => m.status === 'active').length;
  const items = (list.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const open = items.filter((a) => !a.dueAt || a.dueAt >= Date.now());
  const past = items.filter((a) => a.dueAt && a.dueAt < Date.now());
  const render = (a) => (isOwner ? <TeacherRow key={a.id} cls={cls} a={a} total={total} /> : <StudentRow key={a.id} cls={cls} a={a} uid={user.uid} />);
  return (
    <div className="stack">
      {isOwner && <div><Button icon="plus" onClick={() => setEdit('new')}>New assignment</Button></div>}
      {list.loading ? <PageSkeleton rows={2} /> : list.error ? <ErrorBlock error={list.error} /> : items.length === 0 ? (
        <Empty art="homework" title="No assignments yet" text={isOwner ? 'Create an assignment and students can hand their work in straight to you.' : 'Assignments from your teacher will appear here.'} />
      ) : (
        <>
          {open.length > 0 && <Card className="list-card">{open.map(render)}</Card>}
          {past.length > 0 && <><h2 style={{ fontSize: 17 }} className="muted">Past due date</h2><Card className="list-card">{past.map(render)}</Card></>}
        </>
      )}
      {edit && <AssignmentEditor cls={cls} assignment={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive, useNow } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { href } from '../../lib/router.js';
import { dueLabel, fmtDateTime, plural } from '../../lib/util.js';
import { notify, submissionState } from '../../lib/classwork.js';
import { Avatar, Badge, Button, Card, Confetti, Empty, ErrorBlock, Modal, Notice, PageSkeleton, SectionTitle, TextArea, TextField, useConfirm } from '../../ui/kit.jsx';
import { AttachmentList, AttachmentPicker } from '../../ui/Attachments.jsx';
import { AssignmentEditor } from './Classwork.jsx';
import { Icon } from '../../ui/icons.jsx';

function Details({ cls, a }) {
  return (
    <Card className="stack">
      <div className="row wrap">
        <Badge icon="clock">{dueLabel(a.dueAt)}</Badge>
        <Badge>{plural(a.points, 'point')}</Badge>
        {a.allowResubmit && <Badge>Resubmission allowed</Badge>}
        {!a.published && <Badge tone="warn">Draft</Badge>}
      </div>
      {a.instructions ? <p className="pre break">{a.instructions}</p> : <p className="muted">No written instructions.</p>}
      <AttachmentList items={a.attachments} classId={cls.id} />
    </Card>
  );
}

function SubmissionBody({ cls, sub }) {
  return (
    <div className="stack sm">
      {sub.text ? <p className="pre break">{sub.text}</p> : <p className="muted">No written answer.</p>}
      <AttachmentList items={sub.attachments} classId={cls.id} />
    </div>
  );
}

// ---------------- student ----------------
function StudentView({ cls, a }) {
  const { user, profile, fail, toast } = useApp();
  useNow(30000);
  const path = `classes/${cls.id}/assignments/${a.id}/submissions/${user.uid}`;
  const mine = useLive(path);
  const sub = mine.data || null;
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (mine.loading) return <PageSkeleton rows={1} />;
  if (mine.error) return <ErrorBlock error={mine.error} />;

  const st = submissionState(sub, a);
  const canResubmit = !!sub && (a.allowResubmit || sub.status === 'returned') && st.key !== 'graded';
  const showForm = !sub || editing;
  const late = a.dueAt && Date.now() > a.dueAt;

  const startEdit = () => { setText(sub.text || ''); setFiles(sub.attachments || []); setEditing(true); };
  const submit = async () => {
    if (!text.trim() && !files.length) return;
    setBusy(true);
    try {
      if (!sub) {
        await db.set(path, { uid: user.uid, displayName: profile.displayName || user.displayName || 'Student', text: text.trim(), attachments: files, submittedAt: db.serverTs(), attempt: 1, status: 'submitted' });
      } else {
        await db.update(path, { text: text.trim(), attachments: files, submittedAt: db.serverTs(), attempt: (sub.attempt || 1) + 1, status: 'submitted' });
      }
      setEditing(false); setDone(true); setTimeout(() => setDone(false), 2500);
      toast(sub ? 'Resubmitted to your teacher' : 'Handed in to your teacher');
      notify([cls.teacherId], { fromUid: user.uid, classId: cls.id, type: 'submission', title: `${profile.displayName || 'A student'} ${sub ? 'resubmitted' : 'handed in'} ${a.title}`, link: `/class/${cls.id}/classwork/${a.id}` }).catch(console.error);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <div className="stack" style={{ position: 'relative' }}>
      {done && <Confetti />}
      <SectionTitle title="Your work"><Badge tone={st.tone}>{st.key === 'graded' ? `${sub.grade} / ${a.points}` : st.label}</Badge></SectionTitle>
      {sub && !editing && (
        <Card className="stack">
          <div className="muted small">Handed in {fmtDateTime(sub.submittedAt)}{sub.attempt > 1 ? `, attempt ${sub.attempt}` : ''}</div>
          <SubmissionBody cls={cls} sub={sub} />
          {(sub.feedback || st.key === 'graded') && (
            <Notice tone={st.key === 'returned' ? 'warn' : st.key === 'graded' ? 'ok' : undefined} icon="megaphone">
              <strong>{st.key === 'returned' ? 'Your teacher asked for changes' : st.key === 'graded' ? `Graded: ${sub.grade} / ${a.points}` : 'Earlier feedback from your teacher'}</strong>
              {sub.feedback && <p className="pre break" style={{ marginTop: 4 }}>{sub.feedback}</p>}
            </Notice>
          )}
          {canResubmit && <div><Button variant="secondary" onClick={startEdit}>{sub.status === 'returned' ? 'Make changes and hand in again' : 'Resubmit'}</Button></div>}
        </Card>
      )}
      {showForm && (
        <Card className="stack">
          {late && <Notice tone="warn">The due date has passed. You can still hand this in, but it will be marked late.</Notice>}
          <TextArea label="Your answer" rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} hint="Type here, attach files, or both." />
          <AttachmentPicker value={files} onChange={setFiles} classId={cls.id} context="submission" assignmentId={a.id} />
          <div className="row wrap">
            <Button loading={busy} disabled={!text.trim() && !files.length} onClick={submit}>{sub ? 'Hand in again' : 'Hand in to teacher'}</Button>
            {editing && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
          <p className="muted tiny">Only your teacher can see what you hand in.</p>
        </Card>
      )}
    </div>
  );
}

// ---------------- teacher ----------------
function GradeModal({ cls, a, member, sub, onClose }) {
  const { user, fail, toast } = useApp();
  const [grade, setGrade] = useState(sub && sub.grade != null ? String(sub.grade) : '');
  const [feedback, setFeedback] = useState(sub && sub.feedback ? sub.feedback : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const path = `classes/${cls.id}/assignments/${a.id}/submissions/${member.uid || member.id}`;
  const tell = (title, body) => notify([member.uid || member.id], { fromUid: user.uid, classId: cls.id, type: 'grade', title, body, link: `/class/${cls.id}/classwork/${a.id}` }).catch(console.error);

  const save = async () => {
    const g = Number(grade);
    if (grade.trim() === '' || !Number.isFinite(g) || g < 0 || g > a.points) { setErr(`Enter a grade from 0 to ${a.points}.`); return; }
    setErr(''); setBusy('save');
    try {
      await db.update(path, { grade: g, feedback: feedback.trim(), gradedAt: Date.now(), gradedBy: user.uid, status: 'graded' });
      toast('Grade saved'); tell(`Your work was graded: ${a.title}`, `${g} / ${a.points}`); onClose();
    } catch (e) { fail(e); setBusy(''); }
  };
  const giveBack = async () => {
    if (!feedback.trim()) { setErr('Tell the student what to change before returning their work.'); return; }
    setErr(''); setBusy('return');
    try {
      await db.update(path, { feedback: feedback.trim(), status: 'returned' });
      toast('Returned to the student'); tell(`Changes requested: ${a.title}`, feedback.trim()); onClose();
    } catch (e) { fail(e); setBusy(''); }
  };
  return (
    <Modal title={member.displayName} onClose={onClose} wide>
      {!sub ? <Notice>This student has not handed anything in yet.</Notice> : (
        <>
          <div className="row wrap"><Badge icon="clock">{fmtDateTime(sub.submittedAt)}</Badge>{submissionState(sub, a).key === 'late' && <Badge tone="warn">Late</Badge>}{sub.attempt > 1 && <Badge>Attempt {sub.attempt}</Badge>}</div>
          <Card soft className="stack"><SubmissionBody cls={cls} sub={sub} /></Card>
          <TextField label={`Grade (out of ${a.points})`} type="number" inputMode="decimal" min="0" max={a.points} value={grade} onChange={(e) => setGrade(e.target.value)} error={err && err.startsWith('Enter a grade') ? err : ''} data-autofocus />
          <TextArea label="Feedback for the student" rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={4000} error={err && !err.startsWith('Enter a grade') ? err : ''} />
          <div className="row wrap">
            <Button loading={busy === 'save'} disabled={!!busy} onClick={save}>Save grade</Button>
            <Button variant="secondary" loading={busy === 'return'} disabled={!!busy} onClick={giveBack}>Return for changes</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function TeacherView({ cls, a, onEdit }) {
  const [open, setOpen] = useState(null);
  const members = useLive(`classes/${cls.id}/members`);
  const subs = useLive(`classes/${cls.id}/assignments/${a.id}/submissions`);
  if (members.loading || subs.loading) return <PageSkeleton rows={2} />;
  if (members.error || subs.error) return <ErrorBlock error={members.error || subs.error} />;
  const active = (members.data || []).filter((m) => m.status === 'active').sort((x, y) => String(x.displayName).localeCompare(String(y.displayName)));
  const byUid = Object.fromEntries((subs.data || []).map((s) => [s.uid || s.id, s]));
  const handed = active.filter((m) => byUid[m.uid || m.id]);
  const missing = active.filter((m) => !byUid[m.uid || m.id]);
  const graded = handed.filter((m) => submissionState(byUid[m.uid || m.id], a).key === 'graded').length;
  const line = (m) => {
    const s = byUid[m.uid || m.id]; const st = submissionState(s || null, a);
    return (
      <button key={m.id} type="button" className="item-row" style={{ width: '100%', border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen(m)}>
        <Avatar name={m.displayName} src={m.photoURL} />
        <span className="grow"><strong className="break">{m.displayName}</strong></span>
        <Badge tone={st.tone}>{st.key === 'graded' ? `${s.grade} / ${a.points}` : st.label}</Badge>
      </button>
    );
  };
  return (
    <div className="stack">
      <SectionTitle title="Submissions"><span className="muted small">{handed.length} of {active.length} handed in, {graded} graded</span></SectionTitle>
      {active.length === 0 ? <Empty art="people" title="No students in this class yet" text={`Share the class code ${cls.code}.`} /> : (
        <>
          {handed.length > 0 && <Card className="list-card">{handed.map(line)}</Card>}
          {missing.length > 0 && <><h3 className="muted" style={{ fontSize: 15 }}>Not handed in ({missing.length})</h3><Card className="list-card">{missing.map(line)}</Card></>}
        </>
      )}
      {open && <GradeModal cls={cls} a={a} member={open} sub={byUid[open.uid || open.id] || null} onClose={() => setOpen(null)} />}
    </div>
  );
}

export default function Assignment({ cls, aid, isOwner }) {
  const { fail, toast } = useApp();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const doc = useLive(`classes/${cls.id}/assignments/${aid}`);
  const back = <a className="btn ghost sm" href={href(`/class/${cls.id}/classwork`)}><Icon name="left" />Classwork</a>;
  if (doc.loading) return <PageSkeleton rows={2} />;
  if (doc.error || !doc.data) return <Empty art="search" title="This assignment isn't available" text="It may have been removed, or your teacher hasn't shared it yet.">{back}</Empty>;
  const a = { ...doc.data, id: aid };
  const toggle = async () => { try { await db.update(`classes/${cls.id}/assignments/${aid}`, { published: !a.published }); toast(a.published ? 'Hidden from students' : 'Shared with students'); } catch (e) { fail(e); } };
  return (
    <div className="stack">
      <div>{back}</div>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div className="grow"><h1 className="break" style={{ fontSize: 26 }}>{a.title}</h1></div>
        {isOwner && <div className="row wrap"><Button size="sm" variant="secondary" onClick={toggle}>{a.published ? 'Unshare' : 'Share'}</Button><Button size="sm" variant="secondary" icon="edit" onClick={() => setEdit(true)}>Edit</Button></div>}
      </div>
      <Details cls={cls} a={a} />
      {isOwner ? <TeacherView cls={cls} a={a} /> : <StudentView cls={cls} a={a} />}
      {edit && <AssignmentEditor cls={cls} assignment={a} onClose={() => setEdit(false)} />}
    </div>
  );
}

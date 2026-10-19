import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { href, navigate } from '../lib/router.js';
import { createClass, lookupCode, joinClass, leaveClass } from '../lib/classes.js';
import { CLASS_COLORS, randomClassColor, normalizeCode } from '../lib/util.js';
import { Button, Card, Empty, ErrorBlock, Modal, PageHead, PageSkeleton, TextField, TextArea, SelectField, Swatches, Notice, Badge, useConfirm } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';

function ClassCard({ c, children, to }) {
  const Tag = to ? 'a' : 'div';
  return (
    <Tag className={'card card-link class-card' + (to ? '' : ' static')} href={to} style={{ '--accent': c.color, '--accent-soft': `color-mix(in srgb, ${c.color} 14%, #fff)` }}>
      <div className="class-card-bar" />
      <div className="stack sm">
        <h3 className="break clamp-2">{c.name || c.className}</h3>
        <div className="muted small break">{[c.subject, c.section].filter(Boolean).join(', ') || 'Class'}</div>
        {children}
      </div>
    </Tag>
  );
}

// ---------------- teacher ----------------
function CreateClass({ onClose }) {
  const { user, profile, fail, toast } = useApp();
  const [f, setF] = useState({ name: '', subject: '', section: '', description: '', color: randomClassColor(), joinMode: 'open' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) { setErr('Give the class a name.'); return; }
    setBusy(true);
    try {
      const c = await createClass(user, profile, f);
      toast('Class created');
      onClose();
      navigate('/class/' + c.id);
    } catch (e2) { fail(e2); setBusy(false); }
  };
  return (
    <Modal title="Create a class" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <TextField label="Class name" value={f.name} onChange={set('name')} placeholder="e.g. SS2 Chemistry" maxLength={80} error={err} data-autofocus autoComplete="off" />
        <div className="grid cols-2">
          <TextField label="Subject" value={f.subject} onChange={set('subject')} placeholder="Chemistry" maxLength={60} autoComplete="off" />
          <TextField label="Section (optional)" value={f.section} onChange={set('section')} placeholder="Period 3" maxLength={40} autoComplete="off" />
        </div>
        <TextArea label="Description (optional)" rows={2} value={f.description} onChange={set('description')} maxLength={300} />
        <SelectField label="How students join" value={f.joinMode} onChange={set('joinMode')} hint="With approval, students wait until you let them in.">
          <option value="open">Anyone with the code joins straight away</option>
          <option value="approval">I approve each student</option>
        </SelectField>
        <div className="field"><label>Colour</label><Swatches colors={CLASS_COLORS} value={f.color} onChange={(color) => setF({ ...f, color })} /></div>
        <Button type="submit" block loading={busy}>Create class</Button>
      </form>
    </Modal>
  );
}

function TeacherClasses() {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const list = useLive('classes', { where: [['teacherId', '==', user.uid]] });
  const classes = (list.data || []).filter((c) => !c.archived).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return (
    <>
      <PageHead title="Classes" sub="Your classrooms."><Button icon="plus" onClick={() => setOpen(true)}>Create class</Button></PageHead>
      {list.loading ? <PageSkeleton /> : list.error ? <ErrorBlock error={list.error} /> : classes.length === 0 ? (
        <Empty art="classroom" title="No classes yet" text="Create your first class and share its code with your students.">
          <Button icon="plus" onClick={() => setOpen(true)}>Create class</Button>
        </Empty>
      ) : (
        <div className="grid cols-3">
          {classes.map((c) => (
            <ClassCard key={c.id} c={c} to={href('/class/' + c.id)}>
              <div className="row between"><Badge>{c.code}</Badge>{c.joinMode === 'approval' && <Badge>Approval</Badge>}</div>
            </ClassCard>
          ))}
        </div>
      )}
      {open && <CreateClass onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------------- student ----------------
function JoinClass({ onClose }) {
  const { user, profile, fail, toast } = useApp();
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const find = async (e) => {
    e.preventDefault(); setErr(''); setFound(null);
    if (!normalizeCode(code)) { setErr('Type the class code your teacher gave you.'); return; }
    setBusy(true);
    try {
      const s = await lookupCode(code);
      if (!s) setErr("That code doesn't match a class. Check it with your teacher.");
      else setFound(s);
    } catch (e2) { fail(e2); } finally { setBusy(false); }
  };
  const join = async () => {
    setBusy(true);
    try {
      const r = await joinClass(user, profile, found);
      toast(r.already ? 'You are already in this class' : r.status === 'pending' ? 'Request sent. Your teacher will let you in.' : 'You joined the class');
      onClose();
      if (r.status === 'active') navigate('/class/' + found.classId);
    } catch (e2) { fail(e2); setBusy(false); }
  };
  return (
    <Modal title="Join a class" onClose={onClose}>
      {!found ? (
        <form className="stack" onSubmit={find}>
          <TextField label="Class code" value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} placeholder="CHEM-X7K4" error={err} data-autofocus autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          <Button type="submit" block loading={busy}>Find class</Button>
        </form>
      ) : (
        <div className="stack">
          <ClassCard c={{ name: found.className, subject: found.subject, color: found.color }}>
            <div className="muted small">Taught by {found.teacherName}</div>
          </ClassCard>
          {found.joinMode === 'approval' && <Notice>Your teacher approves each student. You will see the class once you are let in.</Notice>}
          <Button block loading={busy} onClick={join}>{found.joinMode === 'approval' ? 'Ask to join' : 'Join class'}</Button>
          <Button variant="ghost" block onClick={() => setFound(null)}>Use a different code</Button>
        </div>
      )}
    </Modal>
  );
}

function MembershipCard({ m }) {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const mine = useLive(`classes/${m.classId}/members/${user.uid}`);
  if (mine.loading) return <Card className="skeleton" style={{ height: 110 }} />;
  const status = mine.data ? mine.data.status : 'removed';
  const c = { name: m.className, subject: m.subject, color: m.color };
  const leave = async () => {
    if (!(await confirm(`Leave ${m.className}? You can join again with the class code.`, { title: 'Leave class', confirmLabel: 'Leave', danger: true }))) return;
    try { await leaveClass(user, m.classId); toast('You left the class'); } catch (e) { fail(e); }
  };
  if (status === 'active') {
    return <ClassCard c={c} to={href('/class/' + m.classId)}><div className="muted small">Teacher: {m.teacherName}</div></ClassCard>;
  }
  return (
    <ClassCard c={c}>
      <div className="muted small">Teacher: {m.teacherName}</div>
      {status === 'pending'
        ? <Badge icon="clock">Waiting for your teacher</Badge>
        : <Badge tone="warn" icon="alert">{status === 'blocked' ? 'You cannot access this class' : 'You were removed from this class'}</Badge>}
      <div><Button size="sm" variant="secondary" onClick={leave}>{status === 'pending' ? 'Cancel request' : 'Remove from list'}</Button></div>
    </ClassCard>
  );
}

function StudentClasses() {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const list = useLive(`users/${user.uid}/memberships`);
  const items = (list.data || []).sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
  return (
    <>
      <PageHead title="Classes" sub="Everything you are enrolled in."><Button icon="plus" onClick={() => setOpen(true)}>Join a class</Button></PageHead>
      {list.loading ? <PageSkeleton /> : list.error ? <ErrorBlock error={list.error} /> : items.length === 0 ? (
        <Empty art="classroom" title="You haven't joined a class yet" text="Ask your teacher for the class code, then join with it here.">
          <Button icon="plus" onClick={() => setOpen(true)}>Join a class</Button>
        </Empty>
      ) : (
        <div className="grid cols-3">{items.map((m) => <MembershipCard key={m.id || m.classId} m={m} />)}</div>
      )}
      {open && <JoinClass onClose={() => setOpen(false)} />}
    </>
  );
}

export default function Classes() {
  const { role } = useApp();
  return role === 'teacher' ? <TeacherClasses /> : <StudentClasses />;
}

import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { relative } from '../../lib/util.js';
import { notify } from '../../lib/classwork.js';
import { Avatar, Badge, Button, Card, Empty, ErrorBlock, PageSkeleton, SectionTitle, useConfirm } from '../../ui/kit.jsx';

export default function People({ cls }) {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const list = useLive(`classes/${cls.id}/members`);
  const all = list.data || [];
  const byName = (a, b) => String(a.displayName).localeCompare(String(b.displayName));
  const pending = all.filter((m) => m.status === 'pending').sort(byName);
  const active = all.filter((m) => m.status === 'active').sort(byName);
  const other = all.filter((m) => !['pending', 'active'].includes(m.status)).sort(byName);
  const set = async (m, status, msg) => {
    try {
      await db.update(`classes/${cls.id}/members/${m.id}`, { status });
      toast(msg);
      if (status === 'active') notify([m.id], { fromUid: user.uid, classId: cls.id, type: 'approved', title: `You were let into ${cls.name}`, link: `/class/${cls.id}` }).catch(console.error);
    } catch (e) { fail(e); }
  };
  const remove = async (m) => {
    if (!(await confirm(`Remove ${m.displayName} from this class? They will lose access until you let them back in.`, { title: 'Remove student', confirmLabel: 'Remove', danger: true }))) return;
    set(m, 'removed', 'Student removed');
  };
  const Row = ({ m, children }) => (
    <div className="item-row"><Avatar name={m.displayName} src={m.photoURL} /><div className="grow"><strong className="break">{m.displayName}</strong><div className="muted small">Joined {relative(m.joinedAt)}</div></div>{children}</div>
  );
  if (list.loading) return <PageSkeleton rows={2} />;
  if (list.error) return <ErrorBlock error={list.error} />;
  return (
    <div className="stack">
      {pending.length > 0 && (
        <>
          <SectionTitle title={`Waiting to join (${pending.length})`} />
          <Card className="list-card">{pending.map((m) => (
            <Row key={m.id} m={m}>
              <Button size="sm" onClick={() => set(m, 'active', `${m.displayName} was let in`)}>Let in</Button>
              <Button size="sm" variant="secondary" onClick={() => set(m, 'blocked', 'Request declined')}>Decline</Button>
            </Row>
          ))}</Card>
        </>
      )}
      <SectionTitle title={`Students (${active.length})`} />
      {active.length === 0 ? <Empty art="people" title="No students yet" text={`Share the class code ${cls.code} so students can join.`} /> : (
        <Card className="list-card">{active.map((m) => <Row key={m.id} m={m}><Button size="sm" variant="ghost" onClick={() => remove(m)}>Remove</Button></Row>)}</Card>
      )}
      {other.length > 0 && (
        <>
          <SectionTitle title="Removed or declined" />
          <Card className="list-card">{other.map((m) => (
            <Row key={m.id} m={m}><Badge>{m.status === 'blocked' ? 'Declined' : 'Removed'}</Badge><Button size="sm" variant="secondary" onClick={() => set(m, 'active', `${m.displayName} was let back in`)}>Let back in</Button></Row>
          ))}</Card>
        </>
      )}
    </div>
  );
}

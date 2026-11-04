import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { navigate } from '../lib/router.js';
import { relative } from '../lib/util.js';
import { Button, Card, Empty, ErrorBlock, PageHead, PageSkeleton } from '../ui/kit.jsx';

export default function Notifications() {
  const { user, fail } = useApp();
  const live = useLive(`users/${user.uid}/notifications`, { orderBy: ['createdAt', 'desc'], limit: 60 });
  const items = [...(live.data || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const unread = items.filter((n) => !n.read);
  const open = async (n) => {
    try { if (!n.read) await db.update(`users/${user.uid}/notifications/${n.id}`, { read: true }); } catch (e) { fail(e); }
    if (n.link) navigate(n.link);
  };
  const readAll = async () => { try { await Promise.all(unread.map((n) => db.update(`users/${user.uid}/notifications/${n.id}`, { read: true }))); } catch (e) { fail(e); } };
  return (
    <div className="stack lg">
      <PageHead title="Notifications" sub="Announcements, new work and grades from your classes.">{unread.length > 0 && <Button variant="secondary" onClick={readAll}>Mark all as read</Button>}</PageHead>
      {live.loading ? <PageSkeleton rows={3} /> : live.error ? <ErrorBlock error={live.error} /> : items.length === 0 ? (
        <Empty art="bell" title="Nothing new" text="When a teacher posts something or grades your work, you will see it here." />
      ) : (
        <Card className="list-card">
          {items.map((n) => (
            <button key={n.id} type="button" className="item-row" data-unread={!n.read ? 'true' : undefined} onClick={() => open(n)} style={{ width: '100%', textAlign: 'left', background: n.read ? 'none' : 'color-mix(in srgb, var(--accent) 7%, transparent)', border: 0, cursor: 'pointer', color: 'inherit' }}>
              <span className="grow" style={{ minWidth: 0 }}>
                <strong className="break" style={{ fontWeight: n.read ? 600 : 800 }}>{n.title}</strong>
                {n.body && <span className="muted small break" style={{ display: 'block' }}>{n.body}</span>}
                <span className="muted small" style={{ display: 'block' }}>{relative(n.createdAt)}</span>
              </span>
              {!n.read && <span aria-label="Unread" style={{ width: 10, height: 10, borderRadius: 99, background: 'var(--accent)', flex: 'none' }} />}
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

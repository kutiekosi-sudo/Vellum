import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { href, navigate } from '../../lib/router.js';
import { plural } from '../../lib/util.js';
import { Badge, Button, Card, Empty, ErrorBlock, IconButton, PageSkeleton, useConfirm } from '../../ui/kit.jsx';
import { Icon } from '../../ui/icons.jsx';

export const CBT_DEFAULTS = {
  title: 'Untitled CBT', description: '', topic: '', published: false, timeLimitMin: 30, maxAttempts: 1,
  shuffleQuestions: true, shuffleOptions: true, resultsVisibility: 'immediate', showReview: true, showExplanations: true,
  opensAt: null, closesAt: null, questionCount: 0, theoryCount: 0, totalPoints: 0,
};

export default function Cbts({ cls }) {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const list = useLive(`classes/${cls.id}/cbts`);
  const items = (list.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const create = async () => {
    setBusy(true);
    try {
      const id = await db.add(`classes/${cls.id}/cbts`, { ...CBT_DEFAULTS, teacherId: user.uid, createdAt: Date.now() });
      navigate(`/class/${cls.id}/cbts/${id}`);
    } catch (e) { fail(e); setBusy(false); }
  };
  const remove = async (c) => {
    if (!(await confirm(`Delete "${c.title}"? Its questions and any results will no longer be reachable.`, { title: 'Delete CBT', confirmLabel: 'Delete', danger: true }))) return;
    try { await db.del(`classes/${cls.id}/cbts/${c.id}`); toast('Deleted'); } catch (e) { fail(e); }
  };
  return (
    <div className="stack">
      <div><Button icon="plus" loading={busy} onClick={create}>New CBT</Button></div>
      {list.loading ? <PageSkeleton rows={2} /> : list.error ? <ErrorBlock error={list.error} /> : items.length === 0 ? (
        <Empty art="test" title="No CBTs yet" text="Build one from scratch, paste a question paper you already have, or let the AI draft one from your notes.">
          <Button icon="plus" loading={busy} onClick={create}>New CBT</Button>
        </Empty>
      ) : (
        <Card className="list-card">
          {items.map((c) => (
            <div className="item-row" key={c.id}>
              <a className="row grow" style={{ textDecoration: 'none', color: 'inherit', minWidth: 0 }} href={href(`/class/${cls.id}/cbts/${c.id}`)}>
                <span className="ic"><Icon name="clipboard" /></span>
                <span className="grow">
                  <strong className="break">{c.title}</strong>
                  <span className="muted small" style={{ display: 'block' }}>
                    {[plural(c.questionCount || 0, 'question'), c.theoryCount ? `${c.theoryCount} theory` : '', `${c.totalPoints || 0} marks`, c.timeLimitMin ? `${c.timeLimitMin} min` : 'untimed'].filter(Boolean).join(', ')}
                  </span>
                </span>
                <Badge tone={c.published ? 'ok' : 'warn'}>{c.published ? 'Published' : 'Draft'}</Badge>
              </a>
              <IconButton icon="trash" label={`Delete ${c.title}`} size="sm" onClick={() => remove(c)} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

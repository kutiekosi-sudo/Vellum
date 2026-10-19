import { useApp } from '../lib/store.jsx';
import { useLive, useTitle } from '../lib/hooks.js';
import { href } from '../lib/router.js';
import { Card, CopyButton, Empty, ErrorBlock, PageSkeleton, Badge } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';
import Stream from './class/Stream.jsx';
import Resources from './class/Resources.jsx';
import People from './class/People.jsx';

export default function ClassPage({ route }) {
  const { user, role } = useApp();
  const id = route.parts[1];
  const cls = useLive('classes/' + id);
  useTitle(cls.data ? cls.data.name + ' · Learnr' : 'Class · Learnr');
  const back = <a className="btn ghost sm" href={href('/classes')}><Icon name="left" />Classes</a>;
  if (cls.loading) return <PageSkeleton />;
  if (cls.error && cls.error.code === 'permission-denied') {
    return <Empty art="search" title="You can't open this class" text="It may not exist, or you may not be in it anymore.">{back}</Empty>;
  }
  if (cls.error) return <ErrorBlock error={cls.error} />;
  if (!cls.data) return <Empty art="search" title="Class not found" text="It may have been removed.">{back}</Empty>;
  const c = cls.data;
  const isOwner = role === 'teacher' && c.teacherId === user.uid;
  const tabs = [{ key: 'stream', label: 'Stream' }, { key: 'resources', label: 'Resources' }, ...(isOwner ? [{ key: 'people', label: 'People' }] : [])];
  const tab = tabs.some((t) => t.key === route.parts[2]) ? route.parts[2] : 'stream';
  const cls0 = { ...c, id };
  return (
    <div className="stack lg" style={{ '--accent': c.color, '--accent-soft': `color-mix(in srgb, ${c.color} 14%, #fff)`, '--accent-line': `color-mix(in srgb, ${c.color} 40%, #fff)` }}>
      <div>{back}</div>
      <div className="class-banner">
        <div className="grow">
          <h1 className="break">{c.name}</h1>
          <p className="break">{[c.subject, c.level, c.section, c.teacherName].filter(Boolean).join(', ')}</p>
        </div>
      </div>
      {c.description && <p className="muted pre">{c.description}</p>}
      {isOwner && (
        <Card accent className="stack sm">
          <div className="muted small">Class code. Share it with your students.</div>
          <div className="row wrap"><span className="codebox" aria-label={`Class code ${c.code}`}>{c.code}</span><CopyButton text={c.code} /></div>
          <div className="row"><Badge>{c.joinMode === 'approval' ? 'You approve each student' : 'Anyone with the code can join'}</Badge></div>
        </Card>
      )}
      <nav className="tabs" aria-label="Class sections">
        {tabs.map((t) => <a key={t.key} href={href(`/class/${id}${t.key === 'stream' ? '' : '/' + t.key}`)} aria-current={tab === t.key ? 'page' : undefined}>{t.label}</a>)}
      </nav>
      {tab === 'stream' && <Stream cls={cls0} isOwner={isOwner} />}
      {tab === 'resources' && <Resources cls={cls0} isOwner={isOwner} />}
      {tab === 'people' && isOwner && <People cls={cls0} />}
    </div>
  );
}

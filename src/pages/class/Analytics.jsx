import { useAsync } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { cbt } from '../../lib/api.js';
import { BANDS, analyseClass, writeSummary } from '../../lib/analytics.js';
import { Badge, Card, Empty, ErrorBlock, PageSkeleton, SectionTitle } from '../../ui/kit.jsx';

function Donut({ bands }) {
  const total = bands.reduce((n, b) => n + b.count, 0);
  const R = 52; const C = 2 * Math.PI * R; let acc = 0;
  return (
    <svg viewBox="0 0 140 140" width="180" height="180" role="img" aria-label={`Students by performance: ${bands.map((b) => `${b.label} ${b.count}`).join(', ')}`}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="#EEEDE6" strokeWidth="24" />
      {total > 0 && bands.filter((b) => b.count).map((b) => {
        const len = (b.count / total) * C; const el = <circle key={b.id} cx="70" cy="70" r={R} fill="none" stroke={b.color} strokeWidth="24" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />;
        acc += len; return el;
      })}
      <text x="70" y="66" textAnchor="middle" fontSize="26" fontWeight="700" fill="#1F2328">{total}</text>
      <text x="70" y="84" textAnchor="middle" fontSize="12" fill="#5F646E">students</text>
    </svg>
  );
}

function BarRow({ label, sub, pct, color }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row between" style={{ gap: 8 }}><strong className="break">{label}</strong><span className="muted small" style={{ whiteSpace: 'nowrap' }}>{pct == null ? '-' : `${pct}%`}</span></div>
      <div role="img" aria-label={`${label}: ${pct == null ? 'no data' : pct + ' percent'}`} style={{ height: 12, borderRadius: 6, background: 'var(--surface-2, #EEEDE6)' }}><div style={{ width: `${Math.max(2, pct || 0)}%`, height: '100%', borderRadius: 6, background: color || 'var(--accent, #1F5C4D)' }} /></div>
      {sub && <span className="muted small">{sub}</span>}
    </div>
  );
}

export default function Analytics({ cls }) {
  const data = useAsync(async () => {
    const members = (await db.list(`classes/${cls.id}/members`).catch(() => [])).filter((m) => m.status === 'active');
    const students = members.map((m) => ({ uid: m.uid || m.id, name: m.displayName || m.name || 'Student' }));
    const cbts = (await db.list(`classes/${cls.id}/cbts`, { where: [['published', '==', true]] }).catch(() => [])).sort((a, b) => (a.publishedAt || a.createdAt || 0) - (b.publishedAt || b.createdAt || 0));
    const tests = await Promise.all(cbts.map(async (t) => ({ id: t.id, title: t.title || 'Test', r: await cbt('classResults', { classId: cls.id, cbtId: t.id }).catch(() => null) })));
    const asgs = (await db.list(`classes/${cls.id}/assignments`).catch(() => [])).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const assignments = await Promise.all(asgs.map(async (a) => ({ id: a.id, title: a.title || 'Assignment', points: Number(a.points) || 0, subs: (await db.list(`classes/${cls.id}/assignments/${a.id}/submissions`).catch(() => [])).map((s) => ({ uid: s.uid || s.id, grade: s.grade })) })));
    return analyseClass({ students, tests, assignments });
  }, [cls.id]);

  if (data.loading) return <PageSkeleton rows={3} />;
  if (data.error) return <ErrorBlock error={data.error} onRetry={data.reload} />;
  const a = data.data;
  if (!a.students) return <Empty art="people" title="No students yet" text="Share your class code. Analytics appear once students join and have results." />;
  const attention = a.rows.filter((r) => r.band === 'risk').sort((x, y) => x.avg - y.avg).slice(0, 8);
  return (
    <div className="stack lg">
      <Card className="stack sm"><h2 className="h-sm">Summary</h2><p className="pre">{writeSummary(cls.name, a)}</p></Card>
      <div className="grid cols-2">
        <Card className="stack sm"><div className="muted small">Class average</div><strong style={{ fontSize: 28 }}>{a.classAvg == null ? '-' : `${a.classAvg}%`}</strong></Card>
        <Card className="stack sm"><div className="muted small">Students with results</div><strong style={{ fontSize: 28 }}>{a.withData} of {a.students}</strong></Card>
      </div>
      <Card className="stack">
        <h2 className="h-sm">How the class is doing</h2>
        <div className="row wrap" style={{ gap: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Donut bands={a.bands} />
          <div className="stack sm">
            {a.bands.map((b) => <div key={b.id} className="row" style={{ gap: 8 }}><i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: b.color, display: 'inline-block' }} /><span><strong>{b.count}</strong> {b.label}{b.range ? <span className="muted small"> ({b.range})</span> : null}</span></div>)}
          </div>
        </div>
      </Card>
      <Card className="stack">
        <h2 className="h-sm">Average score for each test and assignment</h2>
        {a.items.length === 0 ? <p className="muted">No results yet.</p> : a.items.map((i) => <BarRow key={i.kind + i.id} label={i.title} pct={i.avg} sub={`${i.kind}, ${i.taken} of ${i.of} students`} color={i.avg != null && i.avg < 50 ? '#C0392B' : i.avg < 70 ? '#C98A1B' : '#2F7D5B'} />)}
      </Card>
      {a.topics.length > 0 && (
        <Card className="stack">
          <h2 className="h-sm">Topic strength</h2>
          <p className="muted small">The share of test answers that were correct, by topic. The weakest are first.</p>
          {a.topics.map((t) => <BarRow key={t.topic} label={t.topic} pct={t.pct} sub={`${Math.round(t.total)} answers`} color={t.pct < 50 ? '#C0392B' : t.pct < 70 ? '#C98A1B' : '#2F7D5B'} />)}
        </Card>
      )}
      {attention.length > 0 && (
        <Card className="stack sm"><h2 className="h-sm">Students who may need support</h2>
          {attention.map((s) => <div key={s.uid} className="row between"><span className="break">{s.name}</span><Badge tone="warn">{s.avg}%</Badge></div>)}
        </Card>
      )}
    </div>
  );
}

import { useApp } from '../lib/store.jsx';
import { useLive, useAsync } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { href } from '../lib/router.js';
import { summarize } from '../lib/study.js';
import { cbt } from '../lib/api.js';
import { dueLabel, firstName, plural } from '../lib/util.js';
import { TeachingToday } from './Calendar.jsx';
import { Badge, Button, Card, Empty, PageHead, Progress, SectionTitle, Skeleton, TeacherQuote } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

// Work from teachers across all of a student's classes (empty if they have no class).
async function loadStudentWork(uid, memberships) {
  const out = { due: [], cbts: [] };
  await Promise.all(memberships.slice(0, 10).map(async (m) => {
    const classId = m.classId || m.id;
    const [as, cs] = await Promise.all([
      db.list(`classes/${classId}/assignments`, { where: [['published', '==', true]] }).catch(() => []),
      db.list(`classes/${classId}/cbts`, { where: [['published', '==', true]] }).catch(() => []),
    ]);
    await Promise.all(as.slice(0, 30).map(async (a) => {
      const sub = await db.get(`classes/${classId}/assignments/${a.id}/submissions/${uid}`).catch(() => null);
      if (!sub || !sub.submittedAt) out.due.push({ ...a, classId, className: m.className });
    }));
    for (const c of cs) {
      const now = Date.now();
      if ((!c.opensAt || now >= c.opensAt) && (!c.closesAt || now <= c.closesAt)) out.cbts.push({ ...c, classId, className: m.className });
    }
  }));
  out.due.sort((a, b) => (a.dueAt || 9e15) - (b.dueAt || 9e15));
  return out;
}

function StudentHome() {
  const { user, profile } = useApp();
  const sessions = useLive(`users/${user.uid}/studySessions`);
  const goalDoc = useLive(`users/${user.uid}/goals/daily`);
  const memberships = useLive(`users/${user.uid}/memberships`);
  const ready = !memberships.loading;
  const key = (memberships.data || []).map((m) => m.classId || m.id).sort().join(',');
  const work = useAsync(() => (ready && key ? loadStudentWork(user.uid, memberships.data || []) : Promise.resolve({ due: [], cbts: [] })), [ready, key]);
  const goal = (goalDoc.data && goalDoc.data.minutes) || 60;
  const sum = summarize(sessions.data || []);
  const classes = memberships.data || [];

  return (
    <div className="stack lg">
      <PageHead title={`${greeting()}${firstName(profile.displayName) ? ', ' + firstName(profile.displayName) : ''}`} sub="Learn. Practice. Improve." />
      <Card accent className="stack sm">
        <div className="row between"><strong>Today</strong><span className="muted small">{plural(sum.streak, 'day')} streak</span></div>
        <div className="row wrap" style={{ alignItems: 'baseline', gap: 8 }}><span style={{ fontSize: 32, fontWeight: 700 }}>{sum.today}</span><span className="muted">of {goal} minutes</span></div>
        <Progress value={(sum.today / goal) * 100} label="Daily study goal" />
        <div className="row wrap">
          <a className="btn" href={href('/study')}><Icon name="play" />Start focusing</a>
          <a className="btn ghost" href={href('/study/practice')}>Practice</a>
          <a className="btn ghost" href={href('/study/cards')}>Flashcards</a>
        </div>
      </Card>

      {classes.length > 0 && (
        <>
          <SectionTitle title="To do for your classes" />
          {work.loading ? <Skeleton h={64} /> : (work.data.due.length === 0 && work.data.cbts.length === 0) ? (
            <Card className="muted">Nothing waiting. Nice work.</Card>
          ) : (
            <Card className="list-card">
              {work.data.cbts.slice(0, 5).map((c) => (
                <a key={c.id} className="item-row" style={{ textDecoration: 'none', color: 'inherit' }} href={href(`/class/${c.classId}/cbts/${c.id}`)}>
                  <span className="ic"><Icon name="clipboard" /></span>
                  <span className="grow"><strong className="break">{c.title}</strong><span className="muted small" style={{ display: 'block' }}>{c.className}, CBT{c.timeLimitMin ? `, ${c.timeLimitMin} min` : ''}</span></span>
                  <Badge tone="info">Open</Badge>
                </a>
              ))}
              {work.data.due.slice(0, 6).map((a) => (
                <a key={a.id} className="item-row" style={{ textDecoration: 'none', color: 'inherit' }} href={href(`/class/${a.classId}/classwork/${a.id}`)}>
                  <span className="ic"><Icon name="file" /></span>
                  <span className="grow"><strong className="break">{a.title}</strong><span className="muted small" style={{ display: 'block' }}>{a.className}</span></span>
                  <Badge tone={a.dueAt && a.dueAt < Date.now() ? 'warn' : ''}>{dueLabel(a.dueAt)}</Badge>
                </a>
              ))}
            </Card>
          )}
        </>
      )}
      {memberships.loading ? null : classes.length === 0 && (
        <Card className="stack sm">
          <strong>Studying on your own?</strong>
          <p className="muted">Everything in Study works without a class. If your teacher gave you a class code, you can join any time.</p>
          <div><a className="btn ghost" href={href('/classes')}>Join a class</a></div>
        </Card>
      )}
    </div>
  );
}

function TeacherHome() {
  const { user, profile } = useApp();
  const list = useLive('classes', { where: [['teacherId', '==', user.uid]] });
  const classes = (list.data || []).filter((c) => !c.archived).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const key = classes.map((c) => c.id).join(',');
  const stats = useAsync(async () => {
    const out = [];
    await Promise.all(classes.slice(0, 10).map(async (c) => {
      const [members, assigns] = await Promise.all([
        db.list(`classes/${c.id}/members`).catch(() => []),
        db.list(`classes/${c.id}/assignments`).catch(() => []),
      ]);
      let toGrade = 0;
      await Promise.all(assigns.slice(0, 30).map(async (a) => {
        const subs = await db.list(`classes/${c.id}/assignments/${a.id}/submissions`).catch(() => []);
        toGrade += subs.filter((s) => s.submittedAt && (s.grade == null || s.grade === '' || s.submittedAt > (s.gradedAt || 0)) && s.status !== 'returned').length;
      }));
      out.push({ id: c.id, students: members.filter((m) => m.status === 'active').length, pending: members.filter((m) => m.status === 'pending').length, toGrade });
    }));
    return Object.fromEntries(out.map((x) => [x.id, x]));
  }, [key]);
  const totalToGrade = Object.values(stats.data || {}).reduce((n, x) => n + x.toGrade, 0);
  // Concept alerts: topics where many students in a class got CBT questions wrong. Uses class test results only.
  const alerts = useAsync(async () => {
    const out = [];
    await Promise.all(classes.slice(0, 8).map(async (c) => {
      const tests = (await db.list(`classes/${c.id}/cbts`, { where: [['published', '==', true]] }).catch(() => [])).sort((a, b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0)).slice(0, 4);
      const agg = {};
      await Promise.all(tests.map(async (t) => {
        const r = await cbt('classResults', { classId: c.id, cbtId: t.id }).catch(() => null);
        for (const ts of (r && r.topicStats) || []) { const a = agg[ts.topic] || (agg[ts.topic] = { correct: 0, total: 0 }); a.total += ts.total; a.correct += Math.round(((ts.correctPct || 0) / 100) * ts.total); }
      }));
      for (const [topic, a] of Object.entries(agg)) {
        if (a.total >= 6 && a.correct / a.total < 0.5) out.push({ classId: c.id, className: c.name, topic, wrongPct: Math.round((1 - a.correct / a.total) * 100), answers: a.total });
      }
    }));
    return out.sort((a, b) => b.wrongPct - a.wrongPct).slice(0, 6);
  }, [key]);

  return (
    <div className="stack lg">
      <PageHead title={`${greeting()}${firstName(profile.displayName) ? ', ' + firstName(profile.displayName) : ''}`} sub="Here is where your classes stand." />
      <TeachingToday compact />
      <TeacherQuote />
      {list.loading ? <Skeleton h={90} /> : classes.length === 0 ? (
        <Empty art="classroom" title="No classes yet" text="Create your first class and share its code with your students."><a className="btn" href={href('/classes')}>Go to classes</a></Empty>
      ) : (
        <>
          {alerts.data && alerts.data.length > 0 && (
            <Card className="stack sm">
              <strong>Concept alerts</strong>
              <span className="muted small">Topics where more than half of the answers in recent CBTs were wrong. Worth re-teaching or revisiting.</span>
              {alerts.data.map((a) => (
                <a key={a.classId + a.topic} className="row between" style={{ textDecoration: 'none', color: 'inherit' }} href={href(`/class/${a.classId}/cbts`)}>
                  <span className="break"><strong>{a.topic}</strong>, {a.className}</span><Badge tone="warn">{a.wrongPct}% wrong</Badge>
                </a>
              ))}
            </Card>
          )}
          {totalToGrade > 0 && <Card accent><strong>{plural(totalToGrade, 'piece')} of work waiting to be graded.</strong></Card>}
          <div className="grid cols-3">
            {classes.map((c) => {
              const x = (stats.data || {})[c.id];
              return (
                <a key={c.id} className="card stack sm" style={{ textDecoration: 'none', color: 'inherit', borderTop: `4px solid ${c.color}` }} href={href('/class/' + c.id)}>
                  <strong className="break">{c.name}</strong>
                  <span className="muted small">{[c.subject, c.level].filter(Boolean).join(', ')}</span>
                  <div className="row wrap">
                    <Badge>{x ? plural(x.students, 'student') : '...'}</Badge>
                    {x && x.toGrade > 0 && <Badge tone="warn">{x.toGrade} to grade</Badge>}
                    {x && x.pending > 0 && <Badge tone="info">{x.pending} waiting to join</Badge>}
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function Home() {
  const { role } = useApp();
  return role === 'teacher' ? <TeacherHome /> : <StudentHome />;
}

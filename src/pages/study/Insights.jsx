import { useEffect, useRef, useState } from 'react';
import { recentSessions } from '../../lib/study.js';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { ai } from '../../lib/api.js';
import { computeRetention, computeReadiness, recommendedAction, whatIf, optimizer, recurringMistakes, weakPrerequisites, retentionTone } from '../../lib/knowledge.js';
import { fmtDate, plural } from '../../lib/util.js';
import { Badge, Button, Card, Empty, Notice, PageSkeleton, Progress, SectionTitle, TextField } from '../../ui/kit.jsx';
import { href } from '../../lib/router.js';
import { logDecision } from '../../lib/ledger.js';

export default function Insights() {
  const { user, fail } = useApp();
  const topicsQ = useLive(`users/${user.uid}/topics`);
  const sessionsQ = useLive(`users/${user.uid}/studySessions`, recentSessions());
  const readyDoc = useLive(`users/${user.uid}/goals/readiness`);
  const mapDoc = useLive(`users/${user.uid}/goals/depmap`);
  const [minutes, setMinutes] = useState('60');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const snapped = useRef(false);

  const topics = topicsQ.data || [];
  const sessions = sessionsQ.data || [];
  const depMap = (mapDoc.data && mapDoc.data.map) || null;
  const ready = computeReadiness(topics, sessions);
  const history = (readyDoc.data && readyDoc.data.history) || [];

  // Remember one readiness score per day so "what changed" has something to compare.
  useEffect(() => {
    if (snapped.current || topicsQ.loading || sessionsQ.loading || readyDoc.loading || !topics.length) return;
    snapped.current = true;
    const today = new Date().toDateString();
    const rest = history.filter((h) => new Date(h.at).toDateString() !== today);
    db.set(`users/${user.uid}/goals/readiness`, { history: [...rest, { at: Date.now(), score: ready.score }].slice(-60) }).catch(() => {});
    const rec = recommendedAction(topics, depMap);
    if (rec) db.get(`users/${user.uid}/goals/ledger`).then((l) => { if (!l || l.lastNext !== rec.topic.name) logDecision(user.uid, { type: 'next', title: `Next step: ${rec.topic.name}`, reasoning: rec.reason, next: rec.topic.name }); }).catch(() => {});
  });

  if (topicsQ.loading || sessionsQ.loading) return <PageSkeleton rows={3} />;
  if (!topics.length) return <Empty art="chart" title="Nothing to analyse yet" text="Add topics in the Prove it tab and study them. Your readiness, forecast and plan appear here."><a className="btn" href={href('/study/learn')}>Add a topic</a></Empty>;

  const earlier = history.filter((h) => new Date(h.at).toDateString() !== new Date().toDateString())[0];
  const diff = earlier ? ready.score - earlier.score : 0;
  const next = recommendedAction(topics, depMap);
  const mistakes = recurringMistakes(topics);
  const rows = topics.map((t) => ({ t, r: computeRetention(t) })).sort((a, b) => (a.r ? a.r.retention : -1) - (b.r ? b.r.retention : -1));

  const buildMap = async () => {
    setBusy(true);
    try {
      const res = await ai('dependency_map', { topics: topics.map((t) => t.name), subject: topics[0].subject || '' });
      const names = new Set(topics.map((t) => t.name));
      const map = (Array.isArray(res.data) ? res.data : []).filter((d) => names.has(d.topic)).map((d) => ({ topic: d.topic, dependsOn: (d.dependsOn || []).filter((x) => names.has(x) && x !== d.topic).slice(0, 3) }));
      await db.set(`users/${user.uid}/goals/depmap`, { map, at: Date.now() });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const minN = Number(minutes);

  return (
    <div className="stack lg">
      <Card className="stack">
        <div className="muted small">Exam readiness</div>
        <div className="row wrap" style={{ alignItems: 'baseline', gap: 12 }}><span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{ready.score}%</span><Badge tone={ready.score >= 75 ? 'ok' : ready.score >= 45 ? 'warn' : 'bad'}>{ready.label}</Badge></div>
        <Progress value={ready.score} label="Exam readiness" />
        <p className="muted small">Remembered {ready.avgRetention}%, topics covered {ready.coverage}%, studied on {ready.consistency}% of the last 7 days{ready.ghostCount ? `, ${plural(ready.ghostCount, 'ghost knowledge flag')}` : ''}.</p>
        {earlier && diff !== 0 && <p>Your readiness {diff > 0 ? 'improved' : 'dropped'} {Math.abs(diff)} points since {fmtDate(earlier.at)}.</p>}
      </Card>

      {next && (
        <Card accent className="stack sm">
          <div className="muted small">Do this next</div>
          <strong className="break" style={{ fontSize: 20 }}>{next.topic.name}</strong>
          <p>{next.reason}</p>
          <p className="muted small">{next.steps.join(', then ')}.</p>
          <div><a className="btn" href={href('/study/learn')}>Open Prove it</a></div>
        </Card>
      )}

      <SectionTitle title="Retention forecast" />
      <Card className="stack sm">
        {rows.map(({ t, r }) => {
          const weak = weakPrerequisites(t, depMap, topics);
          return (
            <div key={t.id} className="stack sm">
              <div className="row between"><strong className="break">{t.name}</strong>{r ? <Badge tone={retentionTone(r.retention)}>{r.retention}%</Badge> : <Badge>Not studied</Badge>}</div>
              <Progress value={r ? r.retention : 0} label={`${t.name} retention`} />
              {weak.length > 0 && <span className="muted small">Held back by a shaky prerequisite: {weak.join(', ')}.</span>}
            </div>
          );
        })}
        <p className="muted small">An estimate that fades with time and rises with every review, quiz and teach-back.</p>
      </Card>

      {mistakes.length > 0 && (
        <Card className="stack sm"><strong>Mistakes that keep coming back</strong>{mistakes.map((m) => <span key={m.text}>{m.text} <span className="muted">({m.count} times)</span></span>)}</Card>
      )}

      <SectionTitle title="What if I study...?" />
      <Card className="stack sm">
        <p className="muted small">A projection over the next 7 days using the same forgetting model. It is a guide, not a guarantee.</p>
        {[['none', 'Not at all'], ['15', '15 minutes a day'], ['30', '30 minutes a day'], ['60', '1 hour a day'], ['120', '2 hours a day']].map(([k, label]) => {
          const v = whatIf(topics, sessions, k);
          return (<div key={k} className="stack sm"><div className="row between"><span>{label}</span><strong>{v}%</strong></div><Progress value={v} label={`Readiness if ${label}`} /></div>);
        })}
      </Card>

      <SectionTitle title="Short on time?" />
      <Card className="stack sm">
        <TextField label="Minutes you have tonight (10 to 240)" type="number" inputMode="numeric" min="10" max="240" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        <div><Button disabled={!(minN >= 10 && minN <= 240)} onClick={() => { const pl = optimizer(topics, depMap, minN); setPlan(pl); logDecision(user.uid, { type: 'time', title: `${pl.minutes} minutes: ${pl.blocks.map((b) => `${b.topic} ${b.minutes}`).join(', ')}`, reasoning: pl.explanation }); }}>Plan my time</Button></div>
        {plan && (
          <div className="stack sm">
            {plan.blocks.map((b) => <div key={b.topic} className="row between"><span className="break">{b.topic}</span><Badge>{b.minutes} min</Badge></div>)}
            <p className="muted">{plan.explanation}</p>
          </div>
        )}
      </Card>

      <SectionTitle title="How your topics connect" />
      <Card className="stack sm">
        {topics.length < 2 ? <p className="muted">Add at least two topics to map how they build on each other.</p> : (
          <>
            {depMap ? depMap.map((d) => (
              <div key={d.topic} className="stack sm"><strong className="break">{d.topic}</strong><span className="muted small">{d.dependsOn.length ? `Builds on ${d.dependsOn.join(', ')}` : 'No prerequisites'}</span></div>
            )) : <p className="muted">Learnr can work out which topics are prerequisites for others, so it can spot when a shaky basic topic is dragging another one down.</p>}
            <div><Button variant={depMap ? 'ghost' : undefined} loading={busy} onClick={buildMap}>{depMap ? 'Rebuild the map' : 'Map my topics'}</Button></div>
          </>
        )}
      </Card>
    </div>
  );
}

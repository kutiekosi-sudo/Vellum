import { useEffect, useRef, useState } from 'react';
import { recentSessions } from '../lib/study.js';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { db } from '../backend/index.js';
import { ai } from '../lib/api.js';
import { shrinkImage, plural, fmtDate } from '../lib/util.js';
import { studentContext, computeRetention } from '../lib/knowledge.js';
import { logDecision } from '../lib/ledger.js';
import { Button, Card, Empty, Notice, PageHead, PageSkeleton, Seg, TextArea, TextField, useConfirm } from '../ui/kit.jsx';
import { Icon } from '../ui/icons.jsx';

const WELCOME = 'Hello. I am your Learnr study coach. Ask me to explain an idea, check your understanding, or help you plan your revision. You can also send a photo of a page or a question.';

// Every message is its own record, so the history can grow as long as the student likes.
// Only the most recent exchange is sent to the AI as context, so long chats never get slower or costlier.
const PAGE = 60;

function Chat({ context }) {
  const { user, fail } = useApp();
  const confirm = useConfirm();
  const [shown, setShown] = useState(PAGE);
  const doc = useLive(`users/${user.uid}/aiChats`, { orderBy: ['at', 'desc'], limit: shown });
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const end = useRef(null);
  const newest = useRef(0);
  const messages = (doc.data || []).filter((m) => m.role && m.content).slice().sort((a, b) => a.at - b.at);
  const mayHaveMore = (doc.data || []).length >= shown;
  useEffect(() => {
    if (messages.length && messages[messages.length - 1].at !== newest.current && end.current && end.current.scrollIntoView) end.current.scrollIntoView({ block: 'end' });
    if (messages.length) newest.current = messages[messages.length - 1].at;
  }, [messages.length, busy]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    const at = Date.now();
    const mine = { role: 'user', content: photo ? `${q}\n[photo attached]` : q, at };
    const history = [...messages, mine].slice(-14).map((m) => ({ role: m.role, content: m.content }));
    setText(''); setBusy(true);
    const file = photo; setPhoto(null);
    try {
      await db.add(`users/${user.uid}/aiChats`, mine);
      const image = file ? await shrinkImage(file) : undefined; // sent once with this message, never stored
      const res = await ai('student_coach', { messages: history, context, ...(image ? { image } : {}) });
      await db.add(`users/${user.uid}/aiChats`, { role: 'assistant', content: String(res.text || '').slice(0, 6000), at: Math.max(Date.now(), at + 1) });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const clear = async () => {
    if (!(await confirm('Delete this whole conversation? This cannot be undone.', { title: 'Clear chat', confirmLabel: 'Delete all', danger: true }))) return;
    try {
      const all = await db.list(`users/${user.uid}/aiChats`);
      await db.batch(all.map((m) => ({ op: 'delete', path: `users/${user.uid}/aiChats/${m.id}` })));
      setShown(PAGE);
    } catch (e) { fail(e); }
  };
  if (doc.loading) return <PageSkeleton rows={2} />;
  return (
    <div className="stack">
      <Card className="stack" style={{ minHeight: 260 }} aria-live="polite">
        {mayHaveMore && <div><Button variant="ghost" size="sm" onClick={() => setShown(shown + PAGE)}>Show earlier messages</Button></div>}
        {!mayHaveMore && <div className="coach-msg"><span className="muted small">Learnr</span><p className="pre">{WELCOME}</p></div>}
        {messages.map((m) => (
          <div key={m.id} className="coach-msg" style={m.role === 'user' ? { background: 'var(--accent-soft, #e8f1ee)', borderRadius: 12, padding: '10px 12px' } : undefined}>
            <span className="muted small">{m.role === 'user' ? 'You' : 'Learnr'}, {fmtDate(m.at)}</span>
            <p className="pre break">{m.content}</p>
          </div>
        ))}
        {busy && <p className="muted" role="status">Thinking...</p>}
        <div ref={end} />
      </Card>
      <Card className="stack sm">
        <TextArea label="Ask a question" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
        <div className="row wrap">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden onChange={(e) => setPhoto(e.target.files[0] || null)} />
          <Button loading={busy} disabled={!text.trim()} onClick={send} icon="send">Send</Button>
          <Button variant="ghost" icon="camera" onClick={() => input.current && input.current.click()}>{photo ? 'Change photo' : 'Add a photo'}</Button>
          {messages.length > 0 && <Button variant="ghost" onClick={clear} disabled={busy}>Clear chat</Button>}
        </div>
        {photo && <span className="muted small break">Photo ready: {photo.name}</span>}
        <p className="muted small">Your whole conversation is saved to your account, and only you can see it. The coach explains and guides; it will not just do your homework for you.</p>
      </Card>
    </div>
  );
}

function Plan({ context, topics }) {
  const { user, fail } = useApp();
  const doc = useLive(`users/${user.uid}/goals/plan`);
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const plan = doc.data && doc.data.plan;
  const make = async () => {
    setBusy(true);
    try {
      const res = await ai('study_plan', { days: Number(days), context });
      const d = res.data || {};
      const clean = {
        summary: String(d.summary || '').slice(0, 400),
        days: (Array.isArray(d.days) ? d.days : []).slice(0, 14).map((x) => ({
          day: String(x.day || '').slice(0, 20), focus: String(x.focus || '').slice(0, 120), minutes: Math.max(0, Math.min(240, Number(x.minutes) || 0)),
          tasks: (Array.isArray(x.tasks) ? x.tasks : []).slice(0, 5).map((t) => String(t).slice(0, 160)),
        })),
      };
      if (!clean.days.length) throw new Error('The AI did not return a plan. Please try again.');
      await db.set(`users/${user.uid}/goals/plan`, { plan: clean, madeAt: Date.now() });
      logDecision(user.uid, { type: 'plan', title: `${clean.days.length}-day study plan`, reasoning: clean.summary });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  if (doc.loading) return <PageSkeleton rows={2} />;
  return (
    <div className="stack">
      <Card className="stack sm">
        <p className="muted">A realistic plan built from your own topics, forecast and study time. {topics.length ? '' : 'Add topics in Study to make it more useful.'}</p>
        <TextField label="How many days (1 to 14)" type="number" inputMode="numeric" min="1" max="14" value={days} onChange={(e) => setDays(e.target.value)} />
        <div><Button loading={busy} onClick={make}>{plan ? 'Make a new plan' : 'Make my plan'}</Button></div>
      </Card>
      {plan ? (
        <>
          <Notice icon="info">{plan.summary}{doc.data.madeAt ? ` (made ${fmtDate(doc.data.madeAt)})` : ''}</Notice>
          {plan.days.map((d, i) => (
            <Card key={i} className="stack sm">
              <div className="row between"><strong>{d.day}: {d.focus}</strong><span className="muted small">{d.minutes ? plural(d.minutes, 'minute') : 'Rest'}</span></div>
              {d.tasks.length > 0 && <ul style={{ margin: 0, paddingLeft: 20 }}>{d.tasks.map((t, j) => <li key={j}>{t}</li>)}</ul>}
            </Card>
          ))}
        </>
      ) : <Empty art="calendar" title="No plan yet" text="Make one and it appears here." />}
    </div>
  );
}

export default function Coach() {
  const { user } = useApp();
  const [tab, setTab] = useState('chat');
  const topicsQ = useLive(`users/${user.uid}/topics`);
  const sessionsQ = useLive(`users/${user.uid}/studySessions`, recentSessions());
  const topics = topicsQ.data || [];
  const context = studentContext(topics, sessionsQ.data || []);
  return (
    <div className="stack lg">
      <PageHead title="Coach" sub="Ask questions, or get a plan for the days ahead." />
      <Seg label="Coach sections" value={tab} onChange={setTab} options={[{ value: 'chat', label: 'Ask Learnr' }, { value: 'plan', label: 'Study plan' }]} />
      {tab === 'chat' ? <Chat context={context} /> : <Plan context={context} topics={topics} />}
    </div>
  );
}

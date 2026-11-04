import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useLive } from '../lib/hooks.js';
import { href } from '../lib/router.js';
import { Card, Empty, PageHead, TextField } from '../ui/kit.jsx';

// Search across what the person owns. Everything is already on their device, so it works offline too.
const norm = (s) => String(s || '').toLowerCase();
const has = (q, ...f) => f.some((x) => norm(x).includes(q));

export default function Search() {
  const { user, role } = useApp();
  const [q, setQ] = useState('');
  const student = role !== 'teacher';
  const classes = useLive(student ? `users/${user.uid}/memberships` : 'classes', student ? undefined : { where: [['teacherId', '==', user.uid]] });
  const decks = useLive(student ? `users/${user.uid}/flashcards` : '');
  const sets = useLive(student ? `users/${user.uid}/practice` : '');
  const topics = useLive(student ? `users/${user.uid}/topics` : '');
  const concepts = useLive(!student ? `users/${user.uid}/concepts` : '');
  const events = useLive(!student ? `users/${user.uid}/calendar` : '');
  const term = norm(q).trim();
  const groups = [];
  if (term.length >= 2) {
    const cls = (classes.data || []).filter((c) => has(term, c.name, c.className, c.subject)).map((c) => ({ id: c.classId || c.id, label: c.className || c.name, sub: c.subject, to: `/class/${c.classId || c.id}` }));
    groups.push({ title: 'Classes', items: cls });
    if (student) {
      groups.push({ title: 'Flashcards', items: (decks.data || []).filter((d) => has(term, d.title) || (d.cards || []).some((c) => has(term, c.front, c.back))).map((d) => ({ id: d.id, label: d.title, sub: `${(d.cards || []).length} cards`, to: '/study/cards' })) });
      groups.push({ title: 'Practice quizzes', items: (sets.data || []).filter((s) => has(term, s.title, s.subject)).map((s) => ({ id: s.id, label: s.title, sub: s.subject, to: '/study/practice' })) });
      groups.push({ title: 'Topics', items: (topics.data || []).filter((t) => has(term, t.name, t.subject)).map((t) => ({ id: t.id, label: t.name, sub: t.subject, to: '/study/learn' })) });
    } else {
      groups.push({ title: 'Concept cards', items: (concepts.data || []).filter((c) => has(term, c.title, c.subject) || (c.points || []).some((p) => has(term, p))).map((c) => ({ id: c.id, label: c.title, sub: c.subject, to: '/calendar' })) });
      groups.push({ title: 'Calendar', items: (events.data || []).filter((e) => has(term, e.title, e.className, e.notes)).map((e) => ({ id: e.id, label: e.title, sub: e.className, to: '/calendar' })) });
    }
  }
  const shown = groups.filter((g) => g.items.length);
  return (
    <div className="stack lg">
      <PageHead title="Search" sub={student ? 'Find your classes, flashcards, practice quizzes and topics.' : 'Find your classes, concept cards and calendar entries.'} />
      <TextField label="Search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 2 letters" autoComplete="off" data-autofocus />
      {term.length < 2 ? null : shown.length === 0 ? <Empty art="search" title="Nothing found" text="Try a shorter or different word." /> : shown.map((g) => (
        <Card key={g.title} className="list-card" aria-label={g.title}>
          <div style={{ padding: '12px 16px 4px' }}><strong>{g.title}</strong></div>
          {g.items.slice(0, 8).map((i) => (
            <a key={i.id} className="item-row" href={href(i.to)}><span className="grow" style={{ minWidth: 0 }}><strong className="break">{i.label}</strong>{i.sub && <span className="muted small" style={{ display: 'block' }}>{i.sub}</span>}</span></a>
          ))}
        </Card>
      ))}
    </div>
  );
}

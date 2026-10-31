import { useRef, useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { ai } from '../../lib/api.js';
import { fmtDate, plural, shrinkImage } from '../../lib/util.js';
import { runBatches, coverageCount } from '../../lib/batch.js';
import { Badge, Button, Card, Empty, ErrorBlock, Notice, PageSkeleton, Progress, Seg, TextArea, TextField, useConfirm } from '../../ui/kit.jsx';

const cleanCards = (raw) => (Array.isArray(raw) ? raw : []).map((c) => ({ front: String(c.front || '').trim().slice(0, 300), back: String(c.back || '').trim().slice(0, 600) })).filter((c) => c.front && c.back).slice(0, 120);

function Create({ onDone, onCancel }) {
  const { user, fail } = useApp();
  const [src, setSrc] = useState('text');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState('15');
  const [all, setAll] = useState(true);
  const [progress, setProgress] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef(null);
  const make = async () => {
    setErr('');
    if (src === 'text' && notes.trim().length < 40) { setErr('Paste a few sentences of notes first.'); return; }
    if (src === 'photo' && !file) { setErr('Choose or take a photo of your notes first.'); return; }
    setBusy(true);
    try {
      let res;
      let cards;
      if (src === 'text') {
        const total = all ? coverageCount(notes, 100) : Math.max(1, Math.min(100, Math.round(Number(count) || 15)));
        const raw = await runBatches({
          notes, total, perCall: 20,
          onProgress: (i, n) => setProgress(n > 1 ? `Making cards, part ${i} of ${n}...` : ''),
          call: async (slice, c) => (await ai('flashcards', { topic: title.trim() || 'My notes', notes: slice, count: c })).data,
        });
        const seen = new Set();
        cards = cleanCards(raw).filter((c) => { const k = c.front.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      } else {
        const img = await shrinkImage(file);
        res = await ai('photo_flashcards', { title: title.trim(), image: img });
        cards = cleanCards(res.data);
      }
      if (!cards.length) { setErr('No cards could be made from that. Try clearer notes or a sharper photo.'); setBusy(false); return; }
      const id = await db.add(`users/${user.uid}/flashcards`, { title: title.trim() || 'My notes', cards, source: src, createdAt: Date.now() });
      onDone(id);
    } catch (e) { fail(e); setBusy(false); }
  };
  return (
    <Card className="stack">
      <h3>New flashcards</h3>
      <Seg label="Source" value={src} onChange={setSrc} options={[{ value: 'text', label: 'Paste notes' }, { value: 'photo', label: 'Photo of notes' }]} />
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="For example: Cell structure" autoComplete="off" />
      {src === 'text' ? (
        <>
          <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Cover everything in my notes ({notes.trim().length >= 40 ? `about ${coverageCount(notes, 100)} cards` : 'paste notes first'})</label>
          {!all && <TextField label="How many cards (1 to 100)" type="number" inputMode="numeric" min="1" max="100" value={count} onChange={(e) => setCount(e.target.value)} />}
          <TextArea label="Your notes" rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={25000} hint="Up to about 25,000 characters. Longer notes make more cards." />
        </>
      ) : (
        <div className="stack sm">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
          <div className="row wrap"><Button variant="ghost" icon="camera" onClick={() => input.current && input.current.click()}>{file ? 'Choose another photo' : 'Take or choose a photo'}</Button>{file && <span className="muted small break">{file.name}</span>}</div>
        </div>
      )}
      {err && <Notice tone="warn">{err}</Notice>}
      <div className="row wrap"><Button loading={busy} onClick={make}>Make flashcards</Button><Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button></div>
      {busy && progress && <p className="muted small" role="status">{progress}</p>}
    </Card>
  );
}

function Study({ deck, onExit }) {
  const [queue, setQueue] = useState(() => deck.cards.map((_, i) => i).sort(() => Math.random() - 0.5));
  const [flip, setFlip] = useState(false);
  const [known, setKnown] = useState(0);
  const total = deck.cards.length;
  if (!queue.length) {
    return (
      <Card className="stack"><h3>All done</h3><p>You went through all {plural(total, 'card')}.</p><div><Button onClick={onExit}>Back to decks</Button></div></Card>
    );
  }
  const card = deck.cards[queue[0]];
  const answer = (gotIt) => {
    setFlip(false);
    if (gotIt) { setKnown((k) => k + 1); setQueue(queue.slice(1)); } else setQueue([...queue.slice(1), queue[0]]); // missed cards come round again
  };
  return (
    <Card className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted small">{known} of {total} known, {queue.length} to go</span><Button size="sm" variant="ghost" onClick={onExit}>Exit</Button></div>
      <Progress value={(known / total) * 100} label="Cards known" />
      <button type="button" onClick={() => setFlip(!flip)} aria-label={flip ? 'Showing the answer. Tap to see the question.' : 'Showing the question. Tap to see the answer.'}
        style={{ minHeight: 200, padding: 24, borderRadius: 16, border: '2px solid var(--line, #ddd)', background: flip ? 'var(--accent-soft, #e8f1ee)' : 'var(--surface, #fff)', fontSize: 20, cursor: 'pointer', textAlign: 'center' }}>
        <span className="muted small" style={{ display: 'block', marginBottom: 8 }}>{flip ? 'Answer' : 'Question'}</span>{flip ? card.back : card.front}
      </button>
      {flip ? <div className="row wrap" style={{ justifyContent: 'center' }}><Button variant="ghost" onClick={() => answer(false)}>Still learning</Button><Button onClick={() => answer(true)}>I knew it</Button></div> : <div className="row" style={{ justifyContent: 'center' }}><Button onClick={() => setFlip(true)}>Show answer</Button></div>}
    </Card>
  );
}

export default function Cards() {
  const { user, fail, toast } = useApp();
  const confirm = useConfirm();
  const list = useLive(`users/${user.uid}/flashcards`);
  const [view, setView] = useState({ name: 'list' });
  const decks = (list.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (view.name === 'new') return <Create onCancel={() => setView({ name: 'list' })} onDone={(id) => setView({ name: 'study', id })} />;
  if (view.name === 'study') {
    const deck = decks.find((d) => d.id === view.id);
    if (!deck) return list.loading ? <PageSkeleton rows={2} /> : <Empty art="search" title="Deck not found" text="It may have been deleted."><Button onClick={() => setView({ name: 'list' })}>Back</Button></Empty>;
    return <Study key={deck.id} deck={deck} onExit={() => setView({ name: 'list' })} />;
  }
  const remove = async (d) => {
    if (!(await confirm(`Delete "${d.title}"?`, { title: 'Delete deck', confirmLabel: 'Delete', danger: true }))) return;
    try { await db.del(`users/${user.uid}/flashcards/${d.id}`); toast('Deleted'); } catch (e) { fail(e); }
  };
  return (
    <div className="stack">
      <div><Button icon="plus" onClick={() => setView({ name: 'new' })}>New flashcards</Button></div>
      {list.loading ? <PageSkeleton rows={2} /> : list.error ? <ErrorBlock error={list.error} /> : decks.length === 0 ? (
        <Empty art="folder" title="No flashcards yet" text="Paste your notes or photograph a page, and get cards to flip through. Only you can see them." />
      ) : (
        <Card className="list-card">
          {decks.map((d) => (
            <div className="item-row" key={d.id}>
              <button type="button" className="row grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, cursor: 'pointer', color: 'inherit', minWidth: 0 }} onClick={() => setView({ name: 'study', id: d.id })}>
                <span className="grow"><strong className="break">{d.title}</strong><span className="muted small" style={{ display: 'block' }}>{plural(d.cards.length, 'card')}, {fmtDate(d.createdAt)}</span></span>
                <Badge>{d.source === 'photo' ? 'From photo' : 'From notes'}</Badge>
              </button>
              <Button size="sm" variant="ghost" onClick={() => remove(d)}>Delete</Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

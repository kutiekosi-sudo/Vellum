import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { addShared, findShare, shareItem, showCode, stopSharing } from '../../lib/share.js';
import { plural } from '../../lib/util.js';
import { Button, Card, CopyButton, Modal, Notice, TextField } from '../../ui/kit.jsx';

const NOUN = { flashcards: 'deck', practice: 'practice set' };

// "Share" button for one deck or set. Opens a small window with the code to give a friend.
export function ShareButton({ kind, item }) {
  const { user, profile, fail } = useApp();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(item.shareCode || '');
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { setCode(await shareItem(user, profile, kind, item)); } catch (e) { fail(e); } setBusy(false); };
  const stop = async () => { setBusy(true); try { await stopSharing(user, kind, { ...item, shareCode: code }); setCode(''); } catch (e) { fail(e); } setBusy(false); };
  const msg = `Study ${NOUN[kind]} "${item.title}" on Learnr. Go to Study, then ${kind === 'flashcards' ? 'Flashcards' : 'Practice'}, choose "Add with a code" and type: ${code ? showCode(code) : ''}`;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setCode(item.shareCode || ''); setOpen(true); }}>Share</Button>
      {open && (
        <Modal title={`Share "${item.title}"`} onClose={() => setOpen(false)}>
          <div className="stack">
            {!code ? (
              <>
                <p>Anyone you give the code to can add their own copy of this {NOUN[kind]}. They see the questions and answers and your first name. Nothing else of yours is shared.</p>
                <Button loading={busy} onClick={go}>Make a share code</Button>
              </>
            ) : (
              <>
                <p>Give this code to your friends. They add it from the {kind === 'flashcards' ? 'Flashcards' : 'Practice'} page.</p>
                <strong aria-label="Share code" style={{ fontSize: 28, letterSpacing: 2, fontFamily: 'ui-monospace, monospace' }}>{showCode(code)}</strong>
                <div className="row wrap"><CopyButton text={showCode(code)} label="Copy code" /><CopyButton text={msg} label="Copy message" /></div>
                <p className="muted small">If you change your {NOUN[kind]} later, press "Update shared copy" so friends who add it next get the new version. Friends who already added it keep their own copy.</p>
                <div className="row wrap"><Button variant="secondary" loading={busy} onClick={go}>Update shared copy</Button><Button variant="ghost" loading={busy} onClick={stop}>Stop sharing</Button></div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

// "Add with a code" box: look the set up, show what it is, then add it.
export function AddWithCode({ kind, onAdded }) {
  const { user, fail, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [found, setFound] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setOpen(false); setRaw(''); setFound(null); setErr(''); };
  const look = async () => { setErr(''); setBusy(true); try { setFound(await findShare(kind, raw)); } catch (e) { if (e.code === 'share_not_found') setErr(e.message); else fail(e); } setBusy(false); };
  const add = async () => { setBusy(true); try { const id = await addShared(user, kind, found); toast('Added to your list'); close(); onAdded && onAdded(id); } catch (e) { fail(e); setBusy(false); } };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Add with a code</Button>
      {open && (
        <Modal title="Add with a code" onClose={close}>
          <div className="stack">
            {!found ? (
              <>
                <TextField label="Share code" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="ABCDE-FGHJK" autoComplete="off" data-autofocus />
                {err && <Notice tone="warn">{err}</Notice>}
                <Button loading={busy} onClick={look} disabled={raw.trim().length < 6}>Find it</Button>
              </>
            ) : (
              <Card className="stack sm" data-found>
                <strong className="break">{found.title}</strong>
                <span className="muted">{plural(found.count, kind === 'flashcards' ? 'card' : 'question')}{found.ownerName ? `, shared by ${found.ownerName}` : ''}</span>
                <div className="row wrap"><Button loading={busy} onClick={add}>Add to my list</Button><Button variant="ghost" onClick={() => setFound(null)}>Back</Button></div>
              </Card>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

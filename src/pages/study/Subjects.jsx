import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useLive } from '../../lib/hooks.js';
import { SUBJECTS_PATH, cleanName, saveSubjects } from '../../lib/subjects.js';
import { Button, TextField } from '../../ui/kit.jsx';

export const useSubjects = () => {
  const { user } = useApp();
  const doc = useLive(SUBJECTS_PATH(user.uid));
  return { list: (doc.data && doc.data.list) || [], loading: doc.loading };
};

// Add, rename and remove the subjects I study. Class names can be added with one tap.
export default function Subjects({ classes = [] }) {
  const { user, fail } = useApp();
  const { list } = useSubjects();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(-1);
  const [draft, setDraft] = useState('');
  const save = async (next) => { try { await saveSubjects(user.uid, next); } catch (e) { fail(e); } };
  const add = async () => { const n = cleanName(name); if (!n) return; await save([...list, n]); setName(''); };
  const rename = async (i) => { const n = cleanName(draft); setEditing(-1); if (n && n !== list[i]) await save(list.map((x, j) => (j === i ? n : x))); };
  const fromClasses = classes.map((c) => c.className).filter((n) => n && !list.some((s) => s.toLowerCase() === n.toLowerCase()));
  return (
    <div className="stack sm">
      {list.length === 0 && <p className="muted">Add the subjects you study. Pick one when you start the timer and your statistics split by subject.</p>}
      {list.map((s, i) => (
        <div key={s + i} className="row between" style={{ gap: 8 }}>
          {editing === i ? (
            <><input className="input" aria-label="Subject name" value={draft} maxLength={40} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename(i)} /><Button size="sm" onClick={() => rename(i)}>Save</Button></>
          ) : (
            <><span className="break grow"><strong>{s}</strong></span><span className="row"><Button size="sm" variant="ghost" onClick={() => { setEditing(i); setDraft(s); }}>Rename</Button><Button size="sm" variant="ghost" onClick={() => save(list.filter((_, j) => j !== i))}>Remove</Button></span></>
          )}
        </div>
      ))}
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div className="grow"><TextField label="New subject" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" placeholder="For example: Chemistry" onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
        <Button disabled={!cleanName(name)} onClick={add}>Add</Button>
      </div>
      {fromClasses.length > 0 && <div className="row wrap"><span className="muted small">From your classes:</span>{fromClasses.map((n) => <Button key={n} size="sm" variant="ghost" onClick={() => save([...list, n])}>{n}</Button>)}</div>}
    </div>
  );
}

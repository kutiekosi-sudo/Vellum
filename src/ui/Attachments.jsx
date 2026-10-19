// Attach files (uploaded to private storage) and links to a post, and show them again.
import { useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { uploadFile, deleteFile, openFile } from '../lib/api.js';
import { safeUrl, hostOf, fileSize } from '../lib/util.js';
import { Icon } from './icons.jsx';
import { Button, TextField } from './kit.jsx';

export function AttachmentList({ items, classId, onRemove }) {
  const { fail } = useApp();
  if (!items || !items.length) return null;
  return (
    <ul className="attachments" aria-label="Attachments">
      {items.map((a, i) => (
        <li key={(a.id || a.url) + i} className="attachment">
          <Icon name={a.kind === 'link' ? 'link' : 'file'} />
          {a.kind === 'link'
            ? <a className="grow break" href={safeUrl(a.url)} target="_blank" rel="noopener noreferrer">{a.name || hostOf(a.url)}</a>
            : <button type="button" className="linklike grow break" onClick={() => openFile(classId, a).catch((e) => fail(e))}>{a.name}{a.size ? <span className="muted small"> ({fileSize(a.size)})</span> : null}</button>}
          {onRemove && <button type="button" className="btn icon sm ghost" aria-label={`Remove ${a.name || 'link'}`} onClick={() => onRemove(i)}><Icon name="x" /></button>}
        </li>
      ))}
    </ul>
  );
}

// value: [{kind:'file',id,name,size} | {kind:'link',url,name}]
export function AttachmentPicker({ value, onChange, classId, context, assignmentId, allowLinks = true, label = 'Attach' }) {
  const { fail } = useApp();
  const inp = useRef(null);
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState('');

  const pick = async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    let next = [...value];
    for (const f of files) {
      try { const r = await uploadFile({ classId, context, file: f, assignmentId }); next = [...next, { kind: 'file', id: r.id, name: r.name, size: r.size }]; onChange(next); }
      catch (err) { fail(err, `Couldn't upload ${f.name}.`); }
    }
    setBusy(false);
  };
  const addLink = () => {
    const u = safeUrl(link.trim().match(/^https?:\/\//i) ? link.trim() : 'https://' + link.trim());
    if (!link.trim() || !u || u === '#') { setLinkErr('Enter a web address such as https://example.com'); return; }
    onChange([...value, { kind: 'link', url: u, name: hostOf(u) }]); setLink(''); setLinkErr(''); setLinkOpen(false);
  };
  const remove = (i) => {
    const a = value[i];
    onChange(value.filter((_, j) => j !== i));
    if (a.kind === 'file') deleteFile(classId, a.id).catch(() => {});
  };
  return (
    <div className="stack sm">
      <AttachmentList items={value} classId={classId} onRemove={remove} />
      <div className="row wrap">
        <input ref={inp} type="file" multiple hidden onChange={pick} />
        <Button size="sm" variant="secondary" icon="upload" loading={busy} onClick={() => inp.current.click()}>{label} file</Button>
        {allowLinks && <Button size="sm" variant="secondary" icon="link" onClick={() => setLinkOpen(!linkOpen)}>Add link</Button>}
        <span className="muted tiny">Files up to 4 MB</span>
      </div>
      {linkOpen && (
        <div className="row top">
          <TextField className="grow" label="Link" value={link} onChange={(e) => setLink(e.target.value)} error={linkErr} placeholder="https://" inputMode="url" autoCapitalize="none" />
          <Button size="sm" style={{ marginTop: 28 }} onClick={addLink}>Add</Button>
        </div>
      )}
    </div>
  );
}

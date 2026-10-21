// Shared building blocks. Everything here is accessible by default: real buttons and labels, visible focus,
// dialogs that trap focus and close on Escape, status never shown by colour alone.
import { useEffect, useId, useRef, useState, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.jsx';
import { Art } from './art.jsx';
import { cn, initials } from '../lib/util.js';
import { quoteFor } from '../lib/quotes.js';
import { useApp } from '../lib/store.jsx';

export function Spinner({ className }) { return <span className={cn('spinner', className)} role="status" aria-label="Loading" />; }

export function Button({ variant, size, loading, icon, block, className, children, disabled, type = 'button', ...rest }) {
  return (
    <button type={type} className={cn('btn', variant, size, block && 'block', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}
export function IconButton({ icon, label, size, variant = 'ghost', className, ...rest }) {
  return (
    <button type="button" className={cn('btn icon', variant, size, className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Field({ label, hint, error, children, className, id }) {
  const auto = useId();
  const fid = id || auto;
  const describedBy = [hint && `${fid}-hint`, error && `${fid}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('field', className)}>
      {label && <label htmlFor={fid}>{label}</label>}
      {typeof children === 'function' ? children({ id: fid, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }) : children}
      {hint && !error && <div className="hint" id={`${fid}-hint`}>{hint}</div>}
      {error && <div className="err" id={`${fid}-err`} role="alert">{error}</div>}
    </div>
  );
}
export function TextField({ label, hint, error, className, inputClass, ...rest }) {
  return <Field label={label} hint={hint} error={error} className={className}>{(p) => <input className={cn('input', inputClass)} {...p} {...rest} />}</Field>;
}
export function TextArea({ label, hint, error, className, rows = 4, ...rest }) {
  return <Field label={label} hint={hint} error={error} className={className}>{(p) => <textarea className="textarea" rows={rows} {...p} {...rest} />}</Field>;
}
export function SelectField({ label, hint, error, className, children, ...rest }) {
  return <Field label={label} hint={hint} error={error} className={className}>{(p) => <select className="select" {...p} {...rest}>{children}</select>}</Field>;
}
export function Check({ label, checked, onChange, hint, ...rest }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
      <span>{label}{hint && <span className="muted small" style={{ display: 'block' }}>{hint}</span>}</span>
    </label>
  );
}

export function Card({ as: As = 'div', className, tight, soft, flat, accent, children, ...rest }) {
  return <As className={cn('card', tight && 'tight', soft && 'soft', flat && 'flat', accent && 'accent', className)} {...rest}>{children}</As>;
}

export function Badge({ tone, icon, children, className }) {
  return <span className={cn('badge', tone, className)}>{icon && <Icon name={icon} />}{children}</span>;
}

export function Avatar({ name, src, size, className }) {
  return <span className={cn('avatar', size, className)} aria-hidden="true">{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : initials(name)}</span>;
}

export function Progress({ value, label, className }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return <div className={cn('progress', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}><i style={{ width: `${v}%` }} /></div>;
}

export function Skeleton({ h = 16, w = '100%', className, style }) { return <div className={cn('skeleton', className)} style={{ height: h, width: w, ...style }} aria-hidden="true" />; }
export function PageSkeleton({ rows = 3 }) {
  return <div className="stack" role="status" aria-label="Loading"><Skeleton h={34} w="55%" />{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={86} />)}</div>;
}

export function Empty({ art, title, text, action, children }) {
  return (
    <div className="empty">
      {art && <Art name={art} className="art" />}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
      {children}
    </div>
  );
}

export function Notice({ tone, icon, children, className, ...rest }) {
  const ic = icon || (tone === 'bad' ? 'alert' : tone === 'warn' ? 'alert' : tone === 'ok' ? 'check' : 'info');
  return <div className={cn('notice', tone, className)} role={tone === 'bad' ? 'alert' : undefined} {...rest}><Icon name={ic} /><div className="grow">{children}</div></div>;
}

export function ErrorBlock({ error, onRetry, title = "That didn't load" }) {
  const msg = (error && (error.code === 'permission-denied'
    ? "You don't have access to this. It may have been removed, or your access changed."
    : error.message)) || 'Something went wrong.';
  return (
    <Card className="stack" role="alert">
      <div className="row"><Icon name="alert" /><h3>{title}</h3></div>
      <p className="muted break">{msg}</p>
      {onRetry && <div><Button variant="secondary" icon="refresh" onClick={onRetry}>Try again</Button></div>}
    </Card>
  );
}

export function PageHead({ title, sub, children, back }) {
  return (
    <div className="page-head">
      <div className="grow">
        {back}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row wrap">{children}</div>}
    </div>
  );
}

export function SectionTitle({ title, children }) {
  return <div className="section-title"><h2 style={{ fontSize: 19 }}>{title}</h2>{children}</div>;
}

export function Seg({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Chips({ value, onChange, options, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}{o.count != null && <span className="muted"> {o.count}</span>}</button>)}
    </div>
  );
}

export function Swatches({ value, onChange, colors, label = 'Colour' }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button key={c.hex} type="button" role="radio" aria-checked={value === c.hex} aria-label={c.name} title={c.name} className="swatch" style={{ background: c.hex }} onClick={() => onChange(c.hex)} />
      ))}
    </div>
  );
}

// ---------- modal ----------
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, wide, footer, dismissible = true }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const first = el && (el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE));
    if (first) first.focus(); else if (el) el.focus();
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); onClose && onClose(); }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const a = items[0]; const z = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = ''; if (prev && prev.focus) prev.focus(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible && onClose) onClose(); }}>
      <div className={cn('sheet', wide && 'wide')} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <h2 id={titleId} style={{ fontSize: 21 }}>{title}</h2>
          {dismissible && onClose && <IconButton icon="x" label="Close" size="sm" onClick={onClose} />}
        </div>
        <div className="stack">{children}</div>
        {footer && <div className="row wrap" style={{ justifyContent: 'flex-end', marginTop: 18 }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// confirm('Delete this?', { confirmLabel: 'Delete', danger: true }) -> Promise<boolean>
const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const confirm = useCallback((message, opts = {}) => new Promise((resolve) => setReq({ message, opts, resolve })), []);
  const close = (v) => { req.resolve(v); setReq(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req && (
        <Modal title={req.opts.title || 'Are you sure?'} onClose={() => close(false)} footer={<>
          <Button variant="secondary" onClick={() => close(false)}>{req.opts.cancelLabel || 'Cancel'}</Button>
          <Button variant={req.opts.danger ? 'danger' : undefined} onClick={() => close(true)} data-autofocus>{req.opts.confirmLabel || 'Confirm'}</Button>
        </>}>
          <p className="pre">{req.message}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ---------- toasts ----------
export function Toaster() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={cn('toast', t.kind === 'error' && 'error')} role={t.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={t.kind === 'error' ? 'alert' : 'check'} />
          <span className="grow break">{t.message}</span>
          <button type="button" className="btn icon sm ghost" style={{ color: '#fff' }} aria-label="Dismiss" onClick={() => dismissToast(t.id)}><Icon name="x" /></button>
        </div>
      ))}
    </div>
  );
}

// A short celebration for submitting work or finishing a CBT.
export function Confetti({ colors = ['var(--accent)', 'var(--mark)', 'var(--ok)', 'var(--info)'] }) {
  const bits = Array.from({ length: 22 }, (_, i) => ({ left: 5 + (i * 4.3) % 90, delay: (i % 7) * 0.08, color: colors[i % colors.length], rot: (i * 37) % 90 }));
  return (
    <div className="confetti" aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {bits.map((b, i) => <i key={i} style={{ left: `${b.left}%`, top: 0, background: b.color, animationDelay: `${b.delay}s`, transform: `rotate(${b.rot}deg)` }} />)}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', size = 'sm', variant = 'secondary' }) {
  const { toast } = useApp();
  return (
    <Button size={size} variant={variant} icon="copy" onClick={async () => {
      try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy did not work. Select the text and copy it by hand.', 'error'); }
    }}>{label}</Button>
  );
}

// A gentle daily line of encouragement for teachers.
export function TeacherQuote() {
  const [offset, setOffset] = useState(0);
  const q = quoteFor(new Date(), offset);
  return (
    <figure className="quote" aria-label="Encouragement for today">
      <blockquote>{q.text}</blockquote>
      <figcaption className="row between">
        <span>{q.by ? q.by : 'Learnr'}</span>
        <button type="button" className="btn ghost sm" onClick={() => setOffset((o) => o + 1)}>Another one</button>
      </figcaption>
    </figure>
  );
}

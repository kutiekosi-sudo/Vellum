// Small, dependency-free helpers used across Learnr.

export const cn = (...a) => a.filter(Boolean).join(' ');
export const sum = (a, f = (x) => x) => a.reduce((n, x) => n + (Number(f(x)) || 0), 0);
export const avg = (a) => (a.length ? sum(a) / a.length : null);
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const uniq = (a) => [...new Set(a)];
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
export const initials = (name) => (String(name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?');
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// ---------- time ----------
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Weeks start on Monday.
export const startOfWeek = (t = Date.now()) => { const d = new Date(startOfDay(t)); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); };
export const startOfMonth = (t = Date.now()) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

const fmt = (opts) => new Intl.DateTimeFormat(undefined, opts);
const F_DATE = fmt({ day: 'numeric', month: 'short' });
const F_DATE_Y = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const F_TIME = fmt({ hour: 'numeric', minute: '2-digit' });
const F_WD = fmt({ weekday: 'short' });

export function fmtDate(t) { if (!t) return ''; const d = new Date(t); return (d.getFullYear() === new Date().getFullYear() ? F_DATE : F_DATE_Y).format(d); }
export function fmtTime(t) { return t ? F_TIME.format(new Date(t)) : ''; }
export function fmtDateTime(t) { return t ? `${fmtDate(t)}, ${fmtTime(t)}` : ''; }
export function fmtWeekday(t) { return F_WD.format(new Date(t)); }

export function relative(t, now = Date.now()) {
  if (!t) return '';
  const diff = t - now;
  const abs = Math.abs(diff);
  const future = diff > 0;
  if (abs < MIN) return 'just now';
  const u = abs < HOUR ? [Math.round(abs / MIN), 'min'] : abs < DAY ? [Math.round(abs / HOUR), 'h'] : [Math.round(abs / DAY), 'd'];
  return future ? `in ${u[0]} ${u[1]}` : `${u[0]} ${u[1]} ago`;
}

// "Due tomorrow, 9:00 am", "Due today", "Overdue by 2 days"
export function dueLabel(dueAt, now = Date.now()) {
  if (!dueAt) return 'No due date';
  const today = startOfDay(now);
  const dueDay = startOfDay(dueAt);
  const days = Math.round((dueDay - today) / DAY);
  if (dueAt < now) {
    const d = Math.round((now - dueAt) / DAY);
    return d < 1 ? 'Overdue today' : `Overdue by ${plural(d, 'day')}`;
  }
  if (days === 0) return `Due today, ${fmtTime(dueAt)}`;
  if (days === 1) return `Due tomorrow, ${fmtTime(dueAt)}`;
  if (days < 7) return `Due ${fmtWeekday(dueAt)}, ${fmtTime(dueAt)}`;
  return `Due ${fmtDate(dueAt)}`;
}

export function fmtDuration(sec, short = false) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (short) return h ? `${h}h ${m}m` : `${m}m`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${sec} sec`;
}
export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// <input type="datetime-local"> helpers (local time, no timezone suffix)
export function toLocalInput(t) {
  if (!t) return '';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

export function fileSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------- ids / codes ----------
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

function randomChars(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export function makeClassCode(subject) {
  const letters = String(subject || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  return `${letters.padEnd(4, 'X').slice(0, 4) || 'CLAS'}-${randomChars(4)}`;
}
export function makePodCode() { return `POD-${randomChars(4)}`; }
export function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20); }
export function looksLikeCode(s) { return /^[A-Z0-9]{2,6}-[A-Z0-9]{4}$/.test(s); }

// ---------- class colours (muted, harmonious) ----------
export const CLASS_COLORS = [
  { id: 'sage', hex: '#4F8A68', name: 'Sage' },
  { id: 'ocean', hex: '#3D77A8', name: 'Ocean' },
  { id: 'plum', hex: '#85598C', name: 'Plum' },
  { id: 'ochre', hex: '#B98322', name: 'Ochre' },
  { id: 'slate', hex: '#566A93', name: 'Slate' },
  { id: 'rose', hex: '#B05A6B', name: 'Rose' },
  { id: 'teal', hex: '#2B8A87', name: 'Teal' },
  { id: 'clay', hex: '#AD6B49', name: 'Clay' },
];
export const randomClassColor = () => CLASS_COLORS[Math.floor(Math.random() * CLASS_COLORS.length)].hex;

export function subjectKind(subject) {
  const s = String(subject || '').toLowerCase();
  if (/chem/.test(s)) return 'chemistry';
  if (/phys/.test(s)) return 'physics';
  if (/math|algebra|geometry|calculus|statistic|further/.test(s)) return 'maths';
  if (/engl|liter|language|writing|reading|yoruba|igbo|hausa|french/.test(s)) return 'english';
  if (/bio|agric|health|nature/.test(s)) return 'biology';
  if (/geo|econom|government|civic|social/.test(s)) return 'geography';
  if (/hist/.test(s)) return 'history';
  if (/comput|ict|code|program|tech/.test(s)) return 'computing';
  if (/art|music|drama|design/.test(s)) return 'art';
  return 'general';
}

// ---------- misc ----------
export function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function toCsv(rows) { return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n'); }

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

// Shrink big photos before sending them to the AI (phones take 5-10 MB pictures).
export async function shrinkImage(file, maxSide = 1800, quality = 0.82) {
  if (!/^image\//.test(file.type)) return { mimeType: file.type, data: await fileToBase64(file) };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image could not be opened.')); i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', quality).split(',')[1];
    return { mimeType: 'image/jpeg', data };
  } finally { URL.revokeObjectURL(url); }
}

export function safeUrl(u) {
  try {
    const x = new URL(String(u).trim().match(/^https?:\/\//i) ? String(u).trim() : 'https://' + String(u).trim());
    return /^https?:$/.test(x.protocol) ? x.href : null;
  } catch { return null; }
}
export function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }
export function youtubeId(u) {
  try {
    const x = new URL(u);
    if (x.hostname.includes('youtu.be')) return x.pathname.slice(1);
    if (x.hostname.includes('youtube.com')) return x.searchParams.get('v') || (x.pathname.startsWith('/embed/') ? x.pathname.split('/')[2] : null);
  } catch { /* not a URL */ }
  return null;
}

// Friendly text for any error thrown by Firebase or our own functions.
export function friendlyError(e, fallback = 'Something went wrong. Please try again.') {
  if (!e) return fallback;
  const code = e.code || '';
  if (code === 'permission-denied') return "You don't have permission to do that. If this seems wrong, sign out and back in.";
  if (code === 'unavailable' || /offline/i.test(e.message || '')) return "You're offline or the connection dropped. Check your internet and try again.";
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'The sign-in window closed before it finished. If you did not close it, your browser may be blocking it. Try the full-page option below.';
  if (code === 'auth/unauthorized-domain') return 'This web address is not allowed to sign in yet. Add it under Authentication, Settings, Authorized domains in the Firebase console.';
  if (code === 'auth/network-request-failed') return 'The network dropped during sign-in. Check your connection and try again.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is switched off. Turn it on under Authentication, Sign-in method in the Firebase console.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'not-found') return 'That could not be found. It may have been removed.';
  if (e.message && !/^Firebase|^FirebaseError/.test(e.message)) return e.message;
  return fallback;
}

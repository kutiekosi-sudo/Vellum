// The real backend: Firebase Auth + Firestore (loaded from Google's CDN) and our Netlify functions.
// Everything the UI needs goes through the small surface exported at the bottom, so the offline test build
// can swap this whole file for fake.js.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut as fbSignOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where, onSnapshot, serverTimestamp, writeBatch, Timestamp, deleteField,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { AppError } from '../lib/errors.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDAkK5jNX4ffRZlMlhpULsat2qdWgmIx84',
  authDomain: 'learnr-e939d.firebaseapp.com',
  projectId: 'learnr-e939d',
  storageBucket: 'learnr-e939d.firebasestorage.app',
  messagingSenderId: '631447154027',
  appId: '1:631447154027:web:39906f5cf3aa6bc0eb302e',
};

// The Firestore database in the Firebase console is named "default" (no parentheses).
const FIRESTORE_DATABASE_ID = 'default';

const app = initializeApp(firebaseConfig);
const fbAuth = getAuth(app);
// If a redirect sign-in comes back with an error, keep it so the sign-in screen can say what went wrong.
const redirectDone = getRedirectResult(fbAuth).then(() => null, (e) => { console.error('Redirect sign-in failed', e); return e; });

let fdb;
try {
  // Long polling is slower than WebSockets but works on school networks and behind proxies that break streaming.
  // The local cache lets people reopen the app and see their last data when the connection drops.
  fdb = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalForceLongPolling: true,
  }, FIRESTORE_DATABASE_ID);
} catch (e) {
  console.warn('Offline cache unavailable, using memory only.', e);
  fdb = initializeFirestore(app, { experimentalForceLongPolling: true }, FIRESTORE_DATABASE_ID);
}

// ---------- helpers ----------
function norm(v) {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = norm(v[k]);
    return o;
  }
  return v;
}
const snapDoc = (s) => (s.exists() ? { id: s.id, ...norm(s.data()) } : null);
const isDocPath = (p) => p.split('/').length % 2 === 0;

function buildQuery(path, opts) {
  const c = collection(fdb, path);
  const w = (opts && opts.where) || [];
  return w.length ? query(c, ...w.map(([f, o, v]) => where(f, o, v))) : c;
}

// ---------- auth ----------
const cleanUser = (u) => (u ? { uid: u.uid, displayName: u.displayName || '', email: u.email || '', photoURL: u.photoURL || '' } : null);

export const auth = {
  onChange(cb) { return onAuthStateChanged(fbAuth, (u) => cb(cleanUser(u))); },
  // method: 'popup' (a small window) or 'redirect' (the whole page goes to Google and comes back).
  // Tablets and phones often cannot hand a pop-up's result back to the page, so they default to redirect.
  async signIn(method, step = () => {}) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const how = method || (touch ? 'redirect' : 'popup');
    step(`Method: ${how === 'redirect' ? 'full page' : 'pop-up'} (touch screen: ${touch ? 'yes' : 'no'})`);
    const viaRedirect = async () => {
      try { sessionStorage.setItem('learnr-redirecting', String(Date.now())); } catch { /* storage may be blocked */ }
      step('Sending you to Google now. If the page does not change, your browser is blocking the redirect.');
      await signInWithRedirect(fbAuth, provider);
      step('The redirect call returned without leaving this page.');
    };
    if (how === 'redirect') return viaRedirect();
    try {
      step('Opening the Google pop-up window.');
      await signInWithPopup(fbAuth, provider);
      step('Google confirmed the sign-in.');
    } catch (e) {
      step(`Pop-up ended with: ${e.code || e.message}`);
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return viaRedirect();
      throw e;
    }
    return undefined;
  },
  // True if we sent the person to Google and they have come back (used to explain a silent failure).
  cameBackFromRedirect() {
    try { const t = sessionStorage.getItem('learnr-redirecting'); sessionStorage.removeItem('learnr-redirecting'); return !!t && Date.now() - Number(t) < 10 * 60 * 1000; } catch { return false; }
  },
  signOut: () => fbSignOut(fbAuth),
  redirectError: () => redirectDone,
  // Google only lets approved web addresses sign in. Ask Firebase for its list so we can say so plainly.
  async checkDomain() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return { ok: true, known: true, host };
    try {
      const r = await fetch(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${firebaseConfig.apiKey}`);
      if (!r.ok) return { ok: true, known: false, host };
      const list = (await r.json()).authorizedDomains || [];
      return { ok: list.includes(host), known: list.length > 0, host };
    } catch { return { ok: true, known: false, host }; }
  },
  async token() { return fbAuth.currentUser ? fbAuth.currentUser.getIdToken() : null; },
};

// ---------- database ----------
export const db = {
  async get(path) { return snapDoc(await getDoc(doc(fdb, path))); },
  set(path, data, opts) { return setDoc(doc(fdb, path), data, opts || {}); },
  update(path, data) { return updateDoc(doc(fdb, path), data); },
  del(path) { return deleteDoc(doc(fdb, path)); },
  async add(collPath, data) { return (await addDoc(collection(fdb, collPath), data)).id; },
  async list(collPath, opts) { return (await getDocs(buildQuery(collPath, opts))).docs.map(snapDoc); },
  listen(path, cb, err, opts) {
    const onErr = (e) => { if (err) err(e); else console.error(e); };
    if (isDocPath(path)) return onSnapshot(doc(fdb, path), (s) => cb(snapDoc(s)), onErr);
    return onSnapshot(buildQuery(path, opts), (s) => cb(s.docs.map(snapDoc)), onErr);
  },
  async batch(ops) {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(fdb);
      for (const op of ops.slice(i, i + 400)) {
        const ref = doc(fdb, op.path);
        if (op.op === 'set') b.set(ref, op.data, op.merge ? { merge: true } : {});
        else if (op.op === 'update') b.update(ref, op.data);
        else if (op.op === 'delete') b.delete(ref);
      }
      await b.commit();
    }
  },
  serverTs: () => serverTimestamp(),
  removeField: () => deleteField(),
  newId: () => doc(collection(fdb, '_ids')).id,
};

// ---------- Netlify functions (always sent with the signed-in user's token) ----------
async function authedFetch(url, init) {
  const token = await auth.token();
  if (!token) throw new AppError('Please sign in again.', 'unauthenticated', 401);
  let res;
  try {
    res = await fetch(url, { ...init, headers: { ...(init && init.headers), Authorization: `Bearer ${token}` } });
  } catch {
    throw new AppError("Couldn't reach Learnr. Check your internet connection and try again.", 'network', 0);
  }
  return res;
}

async function readError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  const msg = (body && body.error) || (res.status === 404
    ? 'That service is not available yet. If you just updated Learnr, wait a minute for the deploy to finish.'
    : 'Something went wrong on the server. Please try again.');
  return new AppError(msg, body && body.code, res.status);
}

export async function callFunction(name, payload) {
  const res = await authedFetch(`/.netlify/functions/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw await readError(res);
  return res.json();
}

export async function downloadFile(classId, id) {
  const res = await authedFetch(`/.netlify/functions/files?classId=${encodeURIComponent(classId)}&id=${encodeURIComponent(id)}&inline=1`);
  if (!res.ok) throw await readError(res);
  return res.blob();
}

export const isFake = false;

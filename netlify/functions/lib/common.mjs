// Shared helpers for Learnr's Netlify functions.
//
// Security model (the only secret you need is GEMINI_API_KEY):
//  1. Every request carries the caller's Firebase ID token. We verify its signature against Google's
//     public keys (no firebase-admin needed), so `uid` can be trusted.
//  2. To decide what that user may touch, we read Firestore *as that user* (REST + their token). Your
//     Firestore security rules therefore stay the single source of truth for "is this person the teacher
//     of / an active member of this class?". If the rules deny the read, the function denies the request.
//  3. Sensitive content (CBT answer keys, CBT attempts, uploaded files, AI usage counters) lives in Netlify
//     Blobs and can only be reached through these functions.

import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { HttpError, newId, safeId } from './shared.mjs';

export { HttpError, newId, safeId };

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'learnr-e939d';
export const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'default';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(e) {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
  console.error('Unexpected error:', e);
  return json({ error: 'Something went wrong on the server. Please try again.', code: 'server_error' }, 500);
}

// Wrap a handler so thrown HttpErrors become clean JSON responses.
export function handle(fn) {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req, maxBytes = 6 * 1024 * 1024) {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That request is too large.', 'too_large');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Invalid request.', 'bad_json');
  }
}

// ---------- Firebase ID token verification ----------
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { keys: null, fetchedAt: 0 };

async function getJwks(force = false) {
  const now = Date.now();
  if (!force && jwksCache.keys && now - jwksCache.fetchedAt < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new HttpError(503, 'Could not verify your sign-in right now. Please try again.', 'auth_unavailable');
  const body = await res.json();
  jwksCache = { keys: body.keys || [], fetchedAt: now };
  return jwksCache.keys;
}

const b64urlToBuf = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export async function verifyIdToken(req) {
  const header = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) throw new HttpError(401, 'Please sign in again.', 'unauthenticated');
  const token = m[1].trim();
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Please sign in again.', 'unauthenticated');

  let head, payload;
  try {
    head = JSON.parse(b64urlToBuf(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlToBuf(parts[1]).toString('utf8'));
  } catch {
    throw new HttpError(401, 'Please sign in again.', 'unauthenticated');
  }
  if (head.alg !== 'RS256' || !head.kid) throw new HttpError(401, 'Please sign in again.', 'unauthenticated');

  let keys = await getJwks();
  let jwk = keys.find((k) => k.kid === head.kid);
  if (!jwk) {
    keys = await getJwks(true);
    jwk = keys.find((k) => k.kid === head.kid);
  }
  if (!jwk) throw new HttpError(401, 'Please sign in again.', 'unauthenticated');

  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }),
    b64urlToBuf(parts[2]),
  );
  if (!ok) throw new HttpError(401, 'Please sign in again.', 'unauthenticated');

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    payload.aud !== PROJECT_ID ||
    payload.iss !== `https://securetoken.google.com/${PROJECT_ID}` ||
    typeof payload.sub !== 'string' || !payload.sub ||
    payload.exp < nowSec - 5 ||
    payload.iat > nowSec + 300
  ) {
    throw new HttpError(401, 'Your session expired. Please sign in again.', 'token_expired');
  }
  return { uid: payload.sub, name: payload.name || '', email: payload.email || '', token };
}

// ---------- Firestore REST, acting as the signed-in user ----------
function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

// Returns the document's data (plus id) or null if it does not exist.
// Throws HttpError(403) when the security rules refuse the read, which is how we know the user has no access.
export async function fsGet(path, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new HttpError(403, "You don't have access to that.", 'forbidden');
  if (!res.ok) throw new HttpError(502, 'The database is not reachable right now. Please try again.', 'db_unavailable');
  const body = await res.json();
  return { id: path.split('/').pop(), ...decodeFields(body.fields || {}) };
}

// ---------- access checks ----------
// Resolves the caller's relationship to a class using Firestore (and therefore your security rules).
export async function classAccess(classId, user) {
  if (typeof classId !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(classId)) throw new HttpError(400, 'Invalid class.', 'bad_class');
  const cls = await fsGet(`classes/${classId}`, user.token); // rules: only the teacher or an active member can read this
  if (!cls) throw new HttpError(404, 'Class not found.', 'not_found');
  const isTeacher = cls.teacherId === user.uid;
  let isMember = false;
  if (!isTeacher) {
    const mem = await fsGet(`classes/${classId}/members/${user.uid}`, user.token);
    isMember = !!mem && mem.status === 'active';
    if (!isMember) throw new HttpError(403, "You don't have access to that class.", 'forbidden');
  }
  return { cls, isTeacher, isMember };
}

export async function requireTeacher(classId, user) {
  const a = await classAccess(classId, user);
  if (!a.isTeacher) throw new HttpError(403, 'Only the class teacher can do that.', 'forbidden');
  return a;
}

export async function userRole(user) {
  const u = await fsGet(`users/${user.uid}`, user.token);
  return u ? u.role : null;
}

// ---------- blobs ----------
export function store(name) {
  return getStore({ name, consistency: 'strong' });
}

// Fixed-window counters (best effort, not atomic, which is fine for abuse limiting).
export async function rateLimit(user, bucket, limits) {
  const s = store('learnr-limits');
  const now = new Date();
  for (const [windowName, max, windowKey] of limits(now)) {
    const key = `${bucket}/${user.uid}/${windowName}/${windowKey}`;
    const cur = Number((await s.get(key)) || 0);
    if (cur >= max) throw new HttpError(429, 'You have reached the usage limit for now. Please try again a little later.', 'rate_limited');
    await s.set(key, String(cur + 1));
  }
}

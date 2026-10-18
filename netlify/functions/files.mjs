// Private file storage for assignments, resources, announcements and theory material (Netlify Blobs).
//
// POST /.netlify/functions/files  { action: 'upload' | 'delete', classId, ... }   (JSON, base64 file data)
// GET  /.netlify/functions/files?classId=...&id=...                                 (download)
// Every call needs a Firebase ID token, and access is decided by the caller's relationship to the class.

import {
  handle, json, readJson, verifyIdToken, classAccess, fsGet, store,
  HttpError, safeId, newId, rateLimit,
} from './lib/common.mjs';

const MAX_BYTES = 4 * 1024 * 1024; // keeps the base64 request body under Netlify's ~6 MB limit

// The server decides the content type from the extension. HTML/SVG/JS are not allowed (they could run scripts).
const TYPES = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', md: 'text/plain; charset=utf-8',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', zip: 'application/zip',
  mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm',
};
const INLINE_OK = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const CONTEXTS = ['resource', 'announcement', 'assignment', 'theory', 'submission'];

const fStore = () => store('learnr-files');
const metaKey = (classId, id) => `m/${classId}/${id}`;
const dataKey = (classId, id) => `d/${classId}/${id}`;

function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}
const cleanName = (name) => String(name || 'file').replace(/[\\/\u0000-\u001f"<>|?*]/g, '_').slice(0, 120) || 'file';

async function upload(user, body) {
  const context = body.context;
  if (!CONTEXTS.includes(context)) throw new HttpError(400, 'Unknown upload type.', 'bad_context');
  const { isTeacher } = await classAccess(body.classId, user);

  let assignmentId = null;
  if (context === 'submission') {
    if (isTeacher) throw new HttpError(403, 'Only students submit work.', 'forbidden');
    assignmentId = safeId(body.assignmentId);
    const a = await fsGet(`classes/${body.classId}/assignments/${assignmentId}`, user.token);
    if (!a || !a.published) throw new HttpError(404, 'That assignment was not found.', 'not_found');
  } else if (!isTeacher) {
    throw new HttpError(403, 'Only the class teacher can upload that.', 'forbidden');
  }

  await rateLimit(user, 'upload', (now) => [['hour', 60, now.toISOString().slice(0, 13)]]);

  const name = cleanName(body.name);
  const ext = extOf(name);
  const type = TYPES[ext];
  if (!type) throw new HttpError(415, 'That file type is not supported. Use PDF, images, Office documents, text, audio or short video.', 'bad_type');

  if (typeof body.data !== 'string' || !body.data.length) throw new HttpError(400, 'No file data received.', 'no_data');
  const bytes = Buffer.from(body.data, 'base64');
  if (bytes.length === 0) throw new HttpError(400, 'The file is empty.', 'empty');
  if (bytes.length > MAX_BYTES) throw new HttpError(413, 'That file is larger than 4 MB. Try a smaller file or share a link instead.', 'too_large');

  const id = newId(12);
  const meta = {
    id, classId: body.classId, context, assignmentId, name, type, ext, size: bytes.length,
    ownerUid: user.uid, uploadedAt: Date.now(),
  };
  const s = fStore();
  await s.set(dataKey(body.classId, id), bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  await s.setJSON(metaKey(body.classId, id), meta);
  return { id, name, type, size: bytes.length, context };
}

async function remove(user, body) {
  const id = safeId(body.id);
  const { isTeacher } = await classAccess(body.classId, user);
  const s = fStore();
  const meta = await s.get(metaKey(body.classId, id), { type: 'json' });
  if (!meta) return { ok: true };
  if (!isTeacher && meta.ownerUid !== user.uid) throw new HttpError(403, "You can't remove that file.", 'forbidden');
  await s.delete(dataKey(body.classId, id));
  await s.delete(metaKey(body.classId, id));
  return { ok: true };
}

async function download(user, url) {
  const classId = url.searchParams.get('classId');
  const id = safeId(url.searchParams.get('id') || '');
  const { isTeacher } = await classAccess(classId, user);
  const s = fStore();
  const meta = await s.get(metaKey(classId, id), { type: 'json' });
  if (!meta) throw new HttpError(404, 'That file was not found.', 'not_found');
  // Students may read teacher-shared material, but only their own submissions.
  if (!isTeacher && meta.context === 'submission' && meta.ownerUid !== user.uid) {
    throw new HttpError(403, "You don't have access to that file.", 'forbidden');
  }
  const data = await s.get(dataKey(classId, id), { type: 'arrayBuffer' });
  if (!data) throw new HttpError(404, 'That file was not found.', 'not_found');
  const inline = INLINE_OK.has(meta.type) && url.searchParams.get('inline') === '1';
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': meta.type,
      'Content-Length': String(meta.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
      'X-File-Name': encodeURIComponent(meta.name),
    },
  });
}

export default handle(async (req) => {
  const user = await verifyIdToken(req);
  if (req.method === 'GET') return download(user, new URL(req.url));
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed', 'method');
  const body = await readJson(req, 6 * 1024 * 1024);
  if (body.action === 'upload') return json(await upload(user, body));
  if (body.action === 'delete') return json(await remove(user, body));
  throw new HttpError(400, 'Unknown action.', 'bad_action');
});

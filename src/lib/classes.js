// Creating, finding and joining classes. Writes happen one after another (not in a batch) because the
// security rules look at documents that must already exist (the class before its code, the code before a member).
import { db } from '../backend/index.js';
import { makeClassCode, normalizeCode } from './util.js';
import { AppError } from './errors.js';

export async function createClass(user, profile, { name, subject, section, level, description, color, joinMode }) {
  const id = db.newId();
  let code = '';
  for (let i = 0; i < 6; i++) {
    const c = makeClassCode(subject || name);
    if (!(await db.get('classCodes/' + c))) { code = c; break; }
  }
  if (!code) throw new AppError('We could not make a free class code. Please try again.', 'code_taken');
  const teacherName = profile.displayName || user.displayName || 'Teacher';
  const cls = {
    teacherId: user.uid, teacherName, name: name.trim(), subject: (subject || '').trim(), section: (section || '').trim(), level: (level || '').trim(),
    description: (description || '').trim(), color, joinMode: joinMode || 'open', code, archived: false, createdAt: Date.now(),
  };
  await db.set('classes/' + id, cls);
  await db.set('classCodes/' + code, {
    classId: id, teacherId: user.uid, active: true, expiresAt: null,
    className: cls.name, subject: cls.subject, teacherName, color, joinMode: cls.joinMode,
  });
  return { id, ...cls };
}

// Returns the public summary for a code, or null. Never reveals anything about the class beyond the summary.
export async function lookupCode(raw) {
  const code = normalizeCode(raw);
  if (!code) return null;
  const hit = await db.get('classCodes/' + code);
  if (!hit || hit.active !== true) return null;
  if (hit.expiresAt && Date.now() > hit.expiresAt) return null;
  return { code, ...hit };
}

export async function joinClass(user, profile, summary) {
  const classId = summary.classId;
  const mine = await db.get(`classes/${classId}/members/${user.uid}`);
  if (mine) return { already: true, status: mine.status };
  const status = summary.joinMode === 'approval' ? 'pending' : 'active';
  const displayName = profile.displayName || user.displayName || 'Student';
  await db.set(`classes/${classId}/members/${user.uid}`, {
    uid: user.uid, code: summary.code, status, displayName, photoURL: profile.photoURL || user.photoURL || '', joinedAt: Date.now(),
  });
  await db.set(`users/${user.uid}/memberships/${classId}`, {
    classId, className: summary.className, subject: summary.subject || '', teacherName: summary.teacherName || '',
    color: summary.color, joinedAt: Date.now(),
  });
  return { already: false, status };
}

export async function leaveClass(user, classId) {
  await db.del(`classes/${classId}/members/${user.uid}`).catch(() => {});
  await db.del(`users/${user.uid}/memberships/${classId}`);
}

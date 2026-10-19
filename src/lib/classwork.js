// Shared helpers for announcements, assignments, resources and notifications.
import { db } from '../backend/index.js';
import { uniq } from './util.js';

// Tell people something happened. Failures are logged, never shown: a missed notification must not block the real action.
export async function notify(uids, { fromUid, classId, type, title, body = '', link = '' }) {
  const list = uniq(uids).filter((u) => u && u !== fromUid);
  const doc = { fromUid, classId, type, title, body: String(body).slice(0, 200), link, read: false, createdAt: Date.now() };
  for (let i = 0; i < list.length; i += 10) {
    await Promise.allSettled(list.slice(i, i + 10).map((u) => db.add(`users/${u}/notifications`, doc)));
  }
}

export async function activeStudentIds(classId) {
  const members = await db.list(`classes/${classId}/members`);
  return members.filter((m) => m.status === 'active').map((m) => m.uid || m.id);
}

export const isLate = (sub, assignment) => !!(assignment && assignment.dueAt && sub && sub.submittedAt && sub.submittedAt > assignment.dueAt);

// One label for where a student's work stands.
export function submissionState(sub, assignment) {
  if (!sub) return { key: 'todo', label: assignment && assignment.dueAt && Date.now() > assignment.dueAt ? 'Missing' : 'Not submitted', tone: assignment && assignment.dueAt && Date.now() > assignment.dueAt ? 'warn' : '' };
  if (sub.status === 'returned') return { key: 'returned', label: 'Returned for changes', tone: 'warn' };
  if (sub.gradedAt && sub.submittedAt > sub.gradedAt) return { key: 'resubmitted', label: 'Resubmitted, needs regrading', tone: 'info' };
  if (sub.grade != null && sub.grade !== '') return { key: 'graded', label: 'Graded', tone: 'ok' };
  return isLate(sub, assignment) ? { key: 'late', label: 'Submitted late', tone: 'warn' } : { key: 'submitted', label: 'Submitted', tone: 'info' };
}

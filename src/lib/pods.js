// Study pods: a few friends keeping each other going. Members share only a first name + initial,
// minutes studied this week and their streak, and only after choosing to join.
import { db } from '../backend/index.js';
import { makePodCode, normalizeCode, shortName } from './util.js';
import { summarize } from './study.js';
import { AppError } from './errors.js';

export async function createPod(user, profile, name) {
  const id = db.newId();
  let code = '';
  for (let i = 0; i < 6; i++) { const c = makePodCode(); if (!(await db.get('podCodes/' + c))) { code = c; break; } }
  if (!code) throw new AppError('We could not make a free pod code. Please try again.', 'code_taken');
  const nm = name.trim().slice(0, 60);
  await db.set('pods/' + id, { ownerUid: user.uid, name: nm, code, createdAt: Date.now() });
  await db.set('podCodes/' + code, { podId: id, ownerUid: user.uid, active: true, podName: nm });
  await db.set(`pods/${id}/members/${user.uid}`, { uid: user.uid, code, name: shortName(profile.displayName), weekMinutes: 0, streak: 0, joinedAt: Date.now(), updatedAt: Date.now() });
  await db.set(`users/${user.uid}/podMemberships/${id}`, { podId: id, name: nm, code, owner: true, joinedAt: Date.now() });
  return { id, code };
}

export async function joinPod(user, profile, raw) {
  const code = normalizeCode(raw);
  const c = code && (await db.get('podCodes/' + code));
  if (!c || c.active !== true) throw new AppError('That pod code was not found. Check it and try again.', 'pod_not_found');
  const existing = await db.get(`users/${user.uid}/podMemberships/${c.podId}`);
  if (existing) throw new AppError('You are already in that pod.', 'already');
  await db.set(`pods/${c.podId}/members/${user.uid}`, { uid: user.uid, code, name: shortName(profile.displayName), weekMinutes: 0, streak: 0, joinedAt: Date.now(), updatedAt: Date.now() });
  await db.set(`users/${user.uid}/podMemberships/${c.podId}`, { podId: c.podId, name: c.podName || 'Study pod', code, owner: false, joinedAt: Date.now() });
  return c.podId;
}

export async function leavePod(user, podId) {
  await db.del(`pods/${podId}/members/${user.uid}`).catch(() => {});
  await db.del(`users/${user.uid}/podMemberships/${podId}`);
}

export async function closePod(user, pod) {
  const members = await db.list(`pods/${pod.id}/members`).catch(() => []);
  for (const m of members) await db.del(`pods/${pod.id}/members/${m.id}`).catch(() => {});
  await db.update('podCodes/' + pod.code, { active: false }).catch(() => {});
  await db.del('pods/' + pod.id);
  await db.del(`users/${user.uid}/podMemberships/${pod.id}`);
}

// Keep my own numbers in the pod fresh. Only these three figures are shared.
export async function syncMyStats(user, profile, podId, sessions) {
  const sum = summarize(sessions);
  await db.update(`pods/${podId}/members/${user.uid}`, { name: shortName(profile.displayName), weekMinutes: sum.weekTotal, streak: sum.streak, updatedAt: Date.now() });
}

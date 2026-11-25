// The teacher calendar: lessons, tasks, deadlines, exams and meetings. Private to the teacher.
import { DAY, startOfDay } from './util.js';

export const EVENT_TYPES = [
  { id: 'lesson', label: 'Lesson', color: '#2F7D5B' },
  { id: 'task', label: 'Task', color: '#C98A1B' },
  { id: 'deadline', label: 'Deadline', color: '#C0392B' },
  { id: 'exam', label: 'Exam', color: '#6B3FB5' },
  { id: 'meeting', label: 'Meeting', color: '#2F63C4' },
];
export const typeOf = (id) => EVENT_TYPES.find((t) => t.id === id) || EVENT_TYPES[1];

// Each month has its own colour; the days of the month are gentle shades of it, so nothing clashes.
const MONTH_HUES = [215, 340, 150, 275, 35, 185, 12, 245, 95, 320, 200, 130];
export const monthHue = (t) => MONTH_HUES[new Date(t).getMonth()];
export function dayShade(t, hueOverride) {
  const d = new Date(t); const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const l = 94 - ((d.getDate() - 1) / Math.max(1, days - 1)) * 12; // 94% down to 82%
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  return `hsl(${hueOverride ?? monthHue(t)} ${weekend ? 38 : 45}% ${weekend ? l - 4 : l}%)`;
}

export const dateInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const fromDateInput = (v) => { const [y, m, d] = String(v).split('-').map(Number); return y ? new Date(y, m - 1, d).getTime() : NaN; };

// What should have happened today, and what is overdue. A lesson counts as done when it is marked taught.
export function teachingStatus(events, now = Date.now()) {
  const today = startOfDay(now);
  const lessons = events.filter((e) => e.type === 'lesson');
  return {
    today: events.filter((e) => e.date === today).sort((a, b) => (a.type === 'lesson' ? -1 : 1) - (b.type === 'lesson' ? -1 : 1)),
    behind: lessons.filter((e) => e.date < today && !e.done).sort((a, b) => a.date - b.date),
    overdueTasks: events.filter((e) => (e.type === 'task' || e.type === 'deadline') && e.date < today && !e.done).sort((a, b) => a.date - b.date),
    upcoming: events.filter((e) => e.date > today && e.date <= today + 7 * DAY && !e.done).sort((a, b) => a.date - b.date),
  };
}

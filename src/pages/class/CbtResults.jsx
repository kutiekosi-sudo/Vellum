import { useState } from 'react';
import { useApp } from '../../lib/store.jsx';
import { useAsync } from '../../lib/hooks.js';
import { db } from '../../backend/index.js';
import { cbt } from '../../lib/api.js';
import { notify } from '../../lib/classwork.js';
import { fmtDateTime, plural } from '../../lib/util.js';
import { Badge, Button, Card, Empty, ErrorBlock, Modal, Notice, PageSkeleton, TextArea, TextField, useConfirm } from '../../ui/kit.jsx';

function MarkModal({ cls, tid, theory, item, onClose, onSaved }) {
  const { fail, toast, user } = useApp();
  const [marks, setMarks] = useState(() => Object.fromEntries(theory.map((t) => [t.id, item.graded ? String(item.marks[t.id] ?? 0) : ''])));
  const [fb, setFb] = useState(() => ({ ...item.feedback }));
  const [busy, setBusy] = useState(false);
  const bad = theory.some((t) => marks[t.id] !== '' && (Number(marks[t.id]) < 0 || Number(marks[t.id]) > t.marks || !Number.isFinite(Number(marks[t.id]))));
  const save = async () => {
    setBusy(true);
    try {
      await cbt('gradeTheory', { classId: cls.id, cbtId: tid, attemptId: item.attemptId, uid: item.uid, marks, feedback: fb });
      notify([item.uid], { fromUid: user.uid, classId: cls.id, type: 'grade', title: 'Your written answers were marked', body: cls.name, link: `/class/${cls.id}/cbts/${tid}` }).catch(console.error);
      toast('Marks saved'); onSaved();
    } catch (e) { fail(e); setBusy(false); }
  };
  return (
    <Modal title={`Mark ${item.name || 'student'}`} onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={bad} onClick={save}>Save marks</Button></>}>
      <div className="stack">
        {item.autoSubmitted && <Notice tone="warn">This was handed in automatically when time ran out.</Notice>}
        {theory.map((t, i) => (
          <div key={t.id} className="stack sm" style={{ borderTop: i ? '1px solid var(--line)' : 0, paddingTop: i ? 12 : 0 }}>
            <strong className="break pre">{i + 1}. {t.text}</strong>
            {t.guide && <p className="muted small pre">Marking guide: {t.guide}</p>}
            <div className="card" style={{ padding: 12, background: 'var(--bg)' }}><p className="pre break">{(item.answers || {})[t.id] || <span className="muted">No answer written.</span>}</p></div>
            <TextField label={`Marks out of ${t.marks}`} type="number" inputMode="decimal" min="0" max={t.marks} step="0.5" value={marks[t.id]} onChange={(e) => setMarks({ ...marks, [t.id]: e.target.value })} />
            <TextArea label="Comment for the student (optional)" rows={2} value={fb[t.id] || ''} onChange={(e) => setFb({ ...fb, [t.id]: e.target.value })} maxLength={2000} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default function CbtResults({ cls, tid, meta }) {
  const { fail, toast } = useApp();
  const confirm = useConfirm();
  const res = useAsync(() => cbt('classResults', { classId: cls.id, cbtId: tid }), [cls.id, tid]);
  const th = useAsync(() => cbt('theorySubmissions', { classId: cls.id, cbtId: tid }), [cls.id, tid]);
  const [marking, setMarking] = useState(null);
  const reload = () => { res.reload(); th.reload(); };

  if (res.loading || th.loading) return <PageSkeleton rows={3} />;
  if (res.error || th.error) return <ErrorBlock error={res.error || th.error} onRetry={reload} />;
  const r = res.data; const t = th.data;
  const byUid = Object.fromEntries((t.items || []).map((x) => [x.uid, x]));
  const hasTheory = (t.theory || []).length > 0;

  const reset = async (s) => {
    if (!(await confirm(`Let ${s.name || 'this student'} start again? Their current attempt and result will be deleted.`, { title: 'Reset attempt', confirmLabel: 'Reset', danger: true }))) return;
    try { await cbt('resetAttempts', { classId: cls.id, cbtId: tid, uid: s.uid }); toast('Reset'); reload(); } catch (e) { fail(e); }
  };
  const release = async () => {
    try { await db.update(`classes/${cls.id}/cbts/${tid}`, { resultsReleased: true }); toast('Results released to students'); } catch (e) { fail(e); }
  };

  if (!r.count && !(r.inProgress || []).length) return <Empty art="chart" title="No results yet" text="Results appear here as students hand in." />;
  return (
    <div className="stack lg">
      {meta.resultsVisibility === 'released_by_teacher' && (
        <Notice icon="info">
          {meta.resultsReleased ? 'Scores are released to students.' : 'Students cannot see scores yet. '}
          {!meta.resultsReleased && <Button size="sm" onClick={release}>Release results</Button>}
        </Notice>
      )}
      <div className="grid cols-2">
        <Card className="stack sm"><div className="muted small">Handed in</div><strong style={{ fontSize: 28 }}>{r.count}</strong>{r.inProgress.length > 0 && <span className="muted small">{r.inProgress.length} still writing</span>}</Card>
        <Card className="stack sm"><div className="muted small">Class average (multiple choice)</div><strong style={{ fontSize: 28 }}>{r.average ?? '-'}%</strong><span className="muted small">Highest {r.highest ?? '-'}%, lowest {r.lowest ?? '-'}%</span></Card>
      </div>
      <Card className="list-card">
        {r.students.map((s) => {
          const x = byUid[s.uid];
          const flags = (s.latest.focusLost || 0) + (s.latest.pastes || 0);
          return (
            <div className="item-row" key={s.uid} style={{ flexWrap: 'wrap', gap: 8 }}>
              <div className="grow" style={{ minWidth: 180 }}>
                <strong className="break">{s.name || 'Student'}</strong>
                <span className="muted small" style={{ display: 'block' }}>{fmtDateTime(s.latest.submittedAt)}{s.attempts.length > 1 ? `, ${plural(s.attempts.length, 'attempt')}` : ''}</span>
                <div className="row wrap" style={{ marginTop: 4 }}>
                  {s.latest.autoSubmitted && <Badge tone="warn">Time ran out</Badge>}
                  {flags > 0 && <Badge tone="warn">{s.latest.focusLost ? `Left the test ${s.latest.focusLost}x` : ''}{s.latest.focusLost && s.latest.pastes ? ', ' : ''}{s.latest.pastes ? `Tried to paste ${s.latest.pastes}x` : ''}</Badge>}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>{s.latest.pct}%</strong><span className="muted small" style={{ display: 'block' }}>{s.latest.score}/{s.latest.total} MCQ</span>
                {hasTheory && x && <span className="small" style={{ display: 'block' }}>{x.graded ? `Written ${x.score}/${x.total}` : 'Written: to mark'}</span>}
              </div>
              <div className="row">
                {hasTheory && x && <Button size="sm" variant={x.graded ? 'ghost' : undefined} onClick={() => setMarking(x)}>{x.graded ? 'Edit marks' : 'Mark'}</Button>}
                <Button size="sm" variant="ghost" onClick={() => reset(s)}>Reset</Button>
              </div>
            </div>
          );
        })}
      </Card>
      <p className="muted small">Leaving the test or trying to paste is only a signal to review. A phone call or a dropped connection can cause it too, so use it as a reason to talk, not as proof.</p>
      {r.questions.length > 0 && (
        <Card className="stack sm">
          <h3>Hardest questions</h3>
          {r.questions.filter((q) => q.correctPct != null).sort((a, b) => a.correctPct - b.correctPct).slice(0, 5).map((q) => (
            <div key={q.id} className="row" style={{ justifyContent: 'space-between', gap: 12 }}><span className="break">{q.text}</span><Badge tone={q.correctPct < 40 ? 'warn' : ''}>{q.correctPct}% right</Badge></div>
          ))}
        </Card>
      )}
      {marking && <MarkModal cls={cls} tid={tid} theory={t.theory} item={marking} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); reload(); }} />}
    </div>
  );
}

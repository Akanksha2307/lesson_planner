import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Printer,
  Send,
  Trash2,
  UserCheck,
} from 'lucide-react';
import Card from '@/components/common/Card';
import Modal from '@/components/common/Modal';
import ProgressBar from '@/components/common/ProgressBar';
import { PlanStatusBadge, StatusBadge, StatusLegend } from '@/components/common/StatusBadge';
import { ErrorState, Loader } from '@/components/common/EmptyState';
import PlannerGrid from '@/components/lesson-planner/PlannerGrid';
import ReviewPanel from '@/components/lesson-planner/ReviewPanel';
import { useLessonModals } from '@/components/lesson-planner/useLessonModals';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { useDialog } from '@/context/DialogContext';
import { useAction, useApi } from '@/hooks/useApi';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import { addDays, fmt, startOfWeek, weekDates } from '@/utils/date';
import { exportToPdf } from '@/utils/exportFile';
import { periodKind } from '@/utils/freePeriods';

export default function PlanDetailPage() {
  const { id } = useParams();
  const { user, role, masters, loadNotifications } = useApp();
  const toast = useToast();
  const dialog = useDialog();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => lessonPlannerApi.getPlan(id), [id]);
  const { busy, run } = useAction(toast);
  const [weekOffset, setWeekOffset] = useState(0);
  const [extendTo, setExtendTo] = useState(null); // null = dialog closed
  const lm = useLessonModals(reload);

  const weeks = useMemo(() => {
    if (!data) return [];
    const list = [];
    for (let w = startOfWeek(data.plan.startDate); w <= data.plan.endDate; w = addDays(w, 7)) list.push(w);
    return list;
  }, [data]);

  if (loading && !data) return <Loader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { plan, items, otherSlots, holidays, exams } = data;
  const isOwner = plan.teacherId === user.id;
  // The admin may rearrange / edit a plan while it is a draft or sent back – the teacher submits it
  const adminCanArrange = role === 'admin' && ['draft', 'returned'].includes(plan.status);
  const editable = (isOwner && ['draft', 'returned', 'approved'].includes(plan.status)) || adminCanArrange;
  const canSubmit = isOwner && ['draft', 'returned'].includes(plan.status);
  // HOD reviews plans; the principal can also review as a backup when the HOD is busy
  const canReview = ['hod', 'principal'].includes(role) && plan.status === 'submitted';
  const week = weeks[Math.min(weekOffset, weeks.length - 1)];
  const slotKeys = new Set(
    masters.timetable
      .filter((t) => t.sectionId === plan.sectionId && t.subjectId === plan.subjectId)
      .map((t) => `${t.weekday}|${t.periodId}`),
  );
  const needDetails = items.filter(
    (i) => i.status === 'planned' && (!i.details?.objectives?.length || !i.details?.method),
  );

  const submit = () => run(() => lessonPlannerApi.submitPlan(plan.id)).then((r) => r && reload());
  const review = (action, comment) =>
    run(() => lessonPlannerApi.reviewPlan(plan.id, { action, comment, reviewerId: user.id })).then((r) => {
      if (r) {
        reload();
        loadNotifications();
      }
    });
  const remove = async () => {
    const ok = await dialog.confirm({
      title: 'Delete this plan?',
      message: 'All lessons in this plan will be removed.',
      confirmLabel: 'Delete plan',
      danger: true,
    });
    if (!ok) return;
    const r = await run(() => lessonPlannerApi.deletePlan(plan.id));
    if (r) navigate('/lesson-planner/plans');
  };
  const swap = (a, b) => run(() => lessonPlannerApi.swapItems(a, b), { success: 'Lessons swapped' }).then(reload);
  const move = (itemId, slot) => run(() => lessonPlannerApi.moveItem(itemId, slot)).then(reload);
  const dropKind = (it, date, periodId) => periodKind(masters.timetable, it, date, periodId);
  const continueLesson = (itemId, slot) =>
    run(() => lessonPlannerApi.continueLesson(itemId, slot)).then((r) => {
      if (r) {
        reload();
        loadNotifications();
      }
    });
  const canExtend = (isOwner || role === 'admin') && plan.status !== 'submitted';
  const openExtend = () => setExtendTo(addDays(plan.endDate, 7));
  const extend = () =>
    run(() => lessonPlannerApi.extendPlan(plan.id, { endDate: extendTo })).then((r) => {
      if (!r) return;
      setExtendTo(null);
      if (r.planStatusChanged) toast('New lessons need HOD approval – submit the plan again.', 'info');
      reload();
    });
  const select = (it) => (editable && it.status === 'planned' ? lm.openEdit(it) : lm.openDetail(it));

  return (
    <>
      <Card>
        <div className="row-between">
          <div className="stack" style={{ gap: 6 }}>
            <div className="row">
              <h2>
                {plan.classLabel} · {plan.subjectName}
              </h2>
              <PlanStatusBadge status={plan.status} />
            </div>
            <span className="muted small">
              {fmt(plan.startDate)} – {fmt(plan.endDate, { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
              {plan.teacherName} · {plan.total} lessons
              {plan.assignedByAdmin && (
                <>
                  {' '}
                  ·{' '}
                  <span className="assigned-chip">
                    <UserCheck size={12} /> Assigned by {plan.createdByName || 'Admin'}
                  </span>
                </>
              )}
            </span>
            <div style={{ width: 280 }}>
              <ProgressBar value={plan.total ? (plan.completed / plan.total) * 100 : 0} />
            </div>
          </div>
          <div className="row no-print">
            <button className="btn" onClick={exportToPdf}>
              <Printer size={16} /> Print / PDF
            </button>
            {canExtend && (
              <button className="btn" onClick={openExtend} disabled={busy}>
                <CalendarPlus size={16} /> Extend plan
              </button>
            )}
            {(isOwner || role === 'admin') && plan.status === 'draft' && (
              <button className="btn danger" onClick={remove} disabled={busy}>
                <Trash2 size={16} /> Delete
              </button>
            )}
            {canSubmit && (
              <button className="btn primary" onClick={submit} disabled={busy}>
                <Send size={16} /> {masters.settings.approvalRequired ? 'Submit to HOD' : 'Finalise plan'}
              </button>
            )}
            {adminCanArrange && (
              <button className="btn" disabled title={`Only ${plan.teacherName} can submit this plan`}>
                <Send size={16} /> Submit (teacher only)
              </button>
            )}
          </div>
        </div>
        {plan.note && (
          <div className="admin-note" style={{ marginTop: 14 }}>
            <span className="strong">Note from {plan.createdByName || 'the admin'}:</span> {plan.note}
          </div>
        )}
        {canSubmit && needDetails.length > 0 && (
          <div className="row small" style={{ marginTop: 14, color: 'var(--st-partial)', gap: 6 }}>
            <AlertCircle size={16} /> {needDetails.length} lesson{needDetails.length > 1 ? 's need' : ' needs'}{' '}
            objectives and a teaching method before you can submit. Click a lesson to fill it.
          </div>
        )}
        {plan.status === 'submitted' && isOwner && (
          <p className="small muted" style={{ marginTop: 12 }}>
            Waiting for HOD approval (the Principal can also approve). You'll get a notification when it's reviewed.
          </p>
        )}
      </Card>

      <Card className="flush">
        <div className="row-between" style={{ padding: '14px 20px' }}>
          <div className="row">
            {weeks.length > 1 && (
              <>
                <button
                  className="icon-btn"
                  disabled={weekOffset === 0}
                  onClick={() => setWeekOffset((w) => w - 1)}
                  aria-label="Previous week"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="strong small">Week of {fmt(week)}</span>
                <button
                  className="icon-btn"
                  disabled={weekOffset >= weeks.length - 1}
                  onClick={() => setWeekOffset((w) => w + 1)}
                  aria-label="Next week"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
            {adminCanArrange && (
              <span className="faint">
                Drag a lesson onto a free period to move it, or onto another lesson to swap. Locked once the teacher
                submits.
              </span>
            )}
            {editable && !adminCanArrange && (
              <span className="faint">
                Click a lesson to edit it. Drag any lesson – places it can go light up (green = free period, orange =
                this class’s period).
              </span>
            )}
          </div>
          <StatusLegend />
        </div>
        <PlannerGrid
          dates={weekDates(week)}
          items={items}
          otherSlots={otherSlots}
          holidays={holidays}
          exams={exams}
          slotKeys={slotKeys}
          onSelect={select}
          onSwap={swap}
          onMove={move}
          onContinue={isOwner ? continueLesson : undefined}
          dropKind={dropKind}
          draggable={editable}
        />
      </Card>

      <div className="grid-3">
        <Card title="Lessons in this plan" className="span-2 flush" style={{ paddingTop: 16 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Period</th>
                  <th>Topic</th>
                  <th>Details</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((i) => i.status !== 'rescheduled')
                  .map((i) => {
                    const filled = i.details?.objectives?.length && i.details?.method;
                    return (
                      <tr key={i.id} className="clickable" onClick={() => select(i)}>
                        <td>{fmt(i.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                        <td>{i.periodLabel}</td>
                        <td>
                          <span className="strong">{i.topicTitle}</span>
                          <br />
                          <span className="faint">{i.chapterTitle}</span>
                        </td>
                        <td>
                          {filled ? (
                            <CheckCircle2 size={18} color="var(--st-completed)" aria-label="Filled" />
                          ) : (
                            <span className="faint">Missing</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={i.status} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
        <ReviewPanel reviews={plan.reviews} canReview={canReview} onReview={review} busy={busy} reviewerRole={role} />
      </div>
      {lm.modals}

      <Modal
        open={extendTo !== null}
        onClose={() => setExtendTo(null)}
        title="Extend plan"
        subtitle={`${plan.classLabel} · ${plan.subjectName} · now ends ${fmt(plan.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}`}
        width={460}
        footer={
          <>
            <button className="btn ghost" onClick={() => setExtendTo(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={extend} disabled={busy || !extendTo}>
              {busy ? 'Adding…' : 'Extend'}
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 12 }}>
          <label className="field">
            <span className="field-label">New end date</span>
            <input
              className="input"
              type="date"
              min={addDays(plan.endDate, 1)}
              value={extendTo || ''}
              onChange={(e) => setExtendTo(e.target.value)}
            />
          </label>
          <p className="small muted">
            The next syllabus topics are added to this class’s periods up to this date. Holidays and exam days are
            skipped.
          </p>
        </div>
      </Modal>
    </>
  );
}
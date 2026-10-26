import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CalendarPlus, ClipboardList, UserCheck } from 'lucide-react';
import Card from '@/components/common/Card';
import ProgressBar from '@/components/common/ProgressBar';
import { PlanStatusBadge } from '@/components/common/StatusBadge';
import { Tabs } from '@/components/common/Tabs';
import EmptyState, { Loader } from '@/components/common/EmptyState';
import { useApp } from '@/context/AppContext';
import { useApi } from '@/hooks/useApi';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import { fmt } from '@/utils/date';

const TABS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'submitted', label: 'Waiting for HOD' },
  { value: 'returned', label: 'Sent back' },
  { value: 'approved', label: 'Approved' },
];

// Teacher's banner: plans the admin assigned that still need the teacher's details + submit
export function AssignedPlansBanner({ plans, onOpen }) {
  const waiting = (plans || []).filter((p) => p.assignedByAdmin && ['draft', 'returned'].includes(p.status));
  if (!waiting.length) return null;
  const first = waiting[0];
  return (
    <div className="assigned-banner" role="status">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="small" style={{ opacity: 0.85 }}>
          Assigned by {first.createdByName || 'the admin'} · shown until you submit
        </div>
        <div className="strong">
          {waiting.length === 1
            ? `1 new plan assigned · ${first.classLabel} ${first.subjectName} · ${fmt(first.startDate)} – ${fmt(first.endDate)}`
            : `${waiting.length} new plans assigned to you`}
        </div>
        <div className="small" style={{ opacity: 0.85 }}>
          Fill the objectives and teaching method for each lesson, adjust the order if needed, then submit to your HOD.
        </div>
      </div>
      <button className="btn" onClick={() => onOpen(first.id)}>
        Fill details &amp; submit
      </button>
    </div>
  );
}

export default function PlansPage() {
  const { user, role, masters } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const { data, loading } = useApi(
    () => lessonPlannerApi.getPlans({ userId: user.id, role, status, teacherId: teacherId || undefined }),
    [user.id, role, status, teacherId],
  );
  const teachers = masters.staff.filter((s) => s.role === 'teacher');
  const canCreate = role === 'teacher' || role === 'admin';
  const newPlan = () => navigate('/lesson-planner/plans/new');

  return (
    <>
      <div className="row-between">
        <p className="muted">
          {role === 'teacher' ? 'Your weekly plans for each class and subject.' : 'Plans from all teachers.'}
        </p>
        <div className="row">
          {role !== 'teacher' && (
            <select
              className="select"
              style={{ width: 200 }}
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              aria-label="Filter by teacher"
            >
              <option value="">All teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {canCreate && (
            <button className="btn primary" onClick={newPlan}>
              <CalendarPlus size={16} /> {role === 'admin' ? 'New plan for a teacher' : 'Create plan'}
            </button>
          )}
        </div>
      </div>
      {role === 'teacher' && (
        <AssignedPlansBanner plans={data} onOpen={(id) => navigate(`/lesson-planner/plans/${id}`)} />
      )}
      <Tabs tabs={TABS} value={status} onChange={setStatus} />
      {loading && !data ? (
        <Loader />
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No plans here"
            text={
              role === 'teacher'
                ? 'Create a plan and the system fills your timetable periods with syllabus topics.'
                : 'Plans appear here once teachers create them.'
            }
            action={
              canCreate && (
                <button className="btn primary" onClick={newPlan}>
                  {role === 'admin' ? 'New plan for a teacher' : 'Create plan'}
                </button>
              )
            }
          />
        </Card>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {data.map((p) => (
            <Card
              key={p.id}
              className="plan-card"
              onClick={() => navigate(`/lesson-planner/plans/${p.id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/lesson-planner/plans/${p.id}`)}
            >
              <div className="icon">
                <ClipboardList size={22} />
              </div>
              <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                <div className="row">
                  <span className="strong">
                    {p.classLabel} · {p.subjectName}
                  </span>
                  <span className="faint">
                    {fmt(p.startDate)} – {fmt(p.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {role !== 'teacher' && <span className="faint">{p.teacherName}</span>}
                  {p.assignedByAdmin && (
                    <span className="assigned-chip">
                      <UserCheck size={12} /> Assigned by {role === 'teacher' ? 'Admin' : p.createdByName || 'Admin'}
                    </span>
                  )}
                </div>
                <div style={{ maxWidth: 360 }}>
                  <ProgressBar value={p.total ? (p.completed / p.total) * 100 : 0} />
                </div>
                {p.missingDetails > 0 && ['draft', 'returned'].includes(p.status) && (
                  <span className="small row" style={{ gap: 6, color: 'var(--st-partial)' }}>
                    <AlertCircle size={14} /> {p.missingDetails} lesson{p.missingDetails > 1 ? 's need' : ' needs'}{' '}
                    details
                  </span>
                )}
              </div>
              <PlanStatusBadge status={p.status} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, CalendarRange, PartyPopper } from 'lucide-react';
import Card from '@/components/common/Card';
import ProgressBar from '@/components/common/ProgressBar';
import { StatusBadge } from '@/components/common/StatusBadge';
import EmptyState, { ErrorState, Loader } from '@/components/common/EmptyState';
import { useLessonModals } from '@/components/lesson-planner/useLessonModals';
import DaySummary from '@/components/lesson-planner/DaySummary';
import { useApp } from '@/context/AppContext';
import './TodayPage.css';
import { useApi } from '@/hooks/useApi';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import { STATUS_META } from '@/utils/constants';
import { fmt, fmtLong, fmtTime, greeting, nowHHMM } from '@/utils/date';
import { AssignedPlansBanner } from './PlansPage';

export default function TodayPage() {
  const { user, loadNotifications, masters } = useApp();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => lessonPlannerApi.getToday({ userId: user.id }), [user.id]);
  // Plans the admin assigned that still wait for this teacher's details + submit
  const { data: myPlans } = useApi(
    () => lessonPlannerApi.getPlans({ userId: user.id, role: 'teacher', status: '' }),
    [user.id],
  );
  const lm = useLessonModals(() => {
    reload();
    loadNotifications();
  });

  if (loading && !data) return <Loader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const { stats, lessons, unplanned, pendingMarking, coverage, holiday } = data;
  const now = nowHHMM();
  const schedule = [
    ...lessons.map((l) => ({ kind: 'lesson', ...l })),
    ...unplanned.map((u) => ({ kind: 'unplanned', ...u })),
  ].sort((a, b) => (a.start < b.start ? -1 : 1));
  const todayPct = stats.today ? Math.round((stats.completed / stats.today) * 100) : 0;

  return (
    <>
      <AssignedPlansBanner plans={myPlans} onOpen={(id) => navigate(`/lesson-planner/plans/${id}`)} />
      <div className="row-between">
        <div className="stack" style={{ gap: 2 }}>
          <h2 style={{ color: 'var(--text)' }}>
            {greeting()}, {user.name.split(' ')[0]}
          </h2>
          <span className="muted">{fmtLong(data.date)}</span>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigate('/lesson-planner/calendar')}>
            <CalendarRange size={16} /> Timetable
          </button>
          <button className="btn primary" onClick={() => navigate('/lesson-planner/plans/new')}>
            <CalendarPlus size={16} /> Create plan
          </button>
        </div>
      </div>
      <DaySummary
        date={data.date}
        items={lessons}
        holidays={masters.holidays}
        exams={masters.exams}
        onPlan={() => navigate('/lesson-planner/plans/new')}
        title="Today"
      />

      <div className="dashboard-stats">
        <Card className="stat">
          <div className="stat-label">Today's Lessons</div>
          <div className="stat-value">{stats.today}</div>
          <ProgressBar value={todayPct} />
        </Card>
        <Card className="stat">
          <div className="stat-label">Completed Lessons</div>
          <div className="stat-value">{stats.completed}</div>
          <span className="faint">today</span>
        </Card>
        <Card className="stat">
          <div className="stat-label">Pending Lessons</div>
          <div className="stat-value">{stats.pending}</div>
          <span className="faint">today</span>
        </Card>
        <Card className="stat">
          <div className="stat-label">This Week</div>
          <div className="stat-value">
            {stats.weekCompleted}/{stats.week}
            <small>done</small>
          </div>
          <ProgressBar value={stats.week ? (stats.weekCompleted / stats.week) * 100 : 0} />
        </Card>
        <Card className="stat">
          <div className="stat-label">Syllabus Covered</div>
          <div className="stat-value">{stats.syllabus}%</div>
          <span className="faint">average across your classes</span>
        </Card>
        <Card className="stat">
          <div className="stat-label">Not Marked Yet</div>
          <div className="stat-value" style={{ color: pendingMarking.length ? 'var(--danger)' : undefined }}>
            {pendingMarking.length}
          </div>
          <span className="faint">from earlier days</span>
        </Card>
      </div>

      <div className="grid-3">
        <Card title="Today's schedule" className="span-2">
          {holiday ? (
            <EmptyState
              icon={PartyPopper}
              title={holiday.title}
              text="School holiday – enjoy the day. Lessons were moved automatically."
            />
          ) : schedule.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="No classes today"
              text="You have no periods in the timetable today."
            />
          ) : (
            <div className="timeline">
              {schedule.map((s) => {
                const isNow = s.start <= now && now < s.end;
                const started = s.start <= now;
                if (s.kind === 'unplanned') {
                  return (
                    <div
                      key={`${s.sectionId}-${s.periodId}`}
                      className={`tl-item ${isNow ? 'now' : ''}`}
                      style={{ '--c': STATUS_META.empty.color }}
                    >
                      <div className="tl-time">
                        {fmtTime(s.start)}
                        <small>{s.label}</small>
                      </div>
                      <span className="tl-dot" />
                      <div className="tl-body">
                        <h4 style={{ color: 'var(--text-2)' }}>Not planned yet</h4>
                        <div className="small muted">
                          {s.classLabel} · {s.subjectName}
                        </div>
                      </div>
                      <button
                        className="btn sm"
                        onClick={() =>
                          navigate(
                            `/lesson-planner/plans/new?classId=${s.classId}&sectionId=${s.sectionId}&subjectId=${s.subjectId}`,
                          )
                        }
                      >
                        Plan it
                      </button>
                    </div>
                  );
                }
                return (
                  <div
                    key={s.id}
                    className={`tl-item ${isNow ? 'now' : ''}`}
                    style={{ '--c': STATUS_META[s.status].color }}
                  >
                    <div className="tl-time">
                      {fmtTime(s.start)}
                      <small>
                        {s.periodLabel}
                        {isNow ? ' · now' : ''}
                      </small>
                    </div>
                    <span className="tl-dot" />
                    <div className="tl-body" style={{ cursor: 'pointer' }} onClick={() => lm.openDetail(s)}>
                      <h4>{s.topicTitle}</h4>
                      <div className="small muted">
                        {s.classLabel} · {s.subjectName} · {s.chapterTitle}
                      </div>
                    </div>
                    {s.status === 'planned' && started ? (
                      <button className="btn primary sm" onClick={() => lm.openComplete(s)}>
                        Mark lesson
                      </button>
                    ) : (
                      <StatusBadge status={s.status} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="stack" style={{ gap: 20 }}>
          <Card title="Syllabus progress">
            <div className="stack" style={{ gap: 14 }}>
              {coverage.map((c) => (
                <div key={`${c.sectionId}-${c.subjectId}`} className="stack" style={{ gap: 4 }}>
                  <span className="small strong">
                    {c.classLabel} · {c.subjectName}
                  </span>
                  <ProgressBar value={c.overall} />
                </div>
              ))}
            </div>
            <button
              className="btn ghost sm"
              style={{ marginTop: 12 }}
              onClick={() => navigate('/lesson-planner/reports')}
            >
              See chapter-wise progress
            </button>
          </Card>

          <Card title="Upcoming exams">
            <div className="stack" style={{ gap: 10 }}>
              {(masters?.exams || [])
                .filter((e) => e.date >= data.date)
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, 4)
                .map((e, idx) => (
                  <div key={e.id || `${e.date}-${idx}`} className="upcoming-exam-row">
                    <div>
                      <span className="strong small">{e.title}</span>
                      <span className="faint">{e.subject ? ` · ${e.subject}` : ''}</span>
                    </div>
                    <span className="small muted">{fmt(e.date)}</span>
                  </div>
                ))}
              {!(masters?.exams || []).filter((e) => e.date >= data.date).length && (
                <span className="faint">No upcoming exams.</span>
              )}
            </div>
          </Card>

          {pendingMarking.length > 0 && (
            <Card
              title={
                <span className="row" style={{ gap: 8 }}>
                  <AlertTriangle size={18} color="var(--st-partial)" /> Mark these lessons
                </span>
              }
            >
              <div className="stack">
                {pendingMarking.slice(0, 5).map((p) => (
                  <div key={p.id} className="row-between" style={{ flexWrap: 'nowrap' }}>
                    <span className="small">
                      <span className="strong">{p.topicTitle}</span>
                      <br />
                      <span className="faint">
                        {fmt(p.date)} · {p.classLabel}
                      </span>
                    </span>
                    <button className="btn sm" onClick={() => lm.openComplete(p)}>
                      Mark
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
      {lm.modals}
    </>
  );
}
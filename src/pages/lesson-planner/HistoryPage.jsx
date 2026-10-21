
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  History as HistoryIcon,
  XCircle,
} from 'lucide-react';

import Card from '@/components/common/Card';
import { StatusBadge } from '@/components/common/StatusBadge';
import EmptyState, { Loader } from '@/components/common/EmptyState';
import FilterBar from '@/components/lesson-planner/FilterBar';
import { useLessonModals } from '@/components/lesson-planner/useLessonModals';
import { useApp } from '@/context/AppContext';
import { useApi } from '@/hooks/useApi';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import { STATUS_META } from '@/utils/constants';
import { fmt } from '@/utils/date';
import { exportToExcel } from '@/utils/exportFile';

const short = (date) =>
  fmt(date, { day: 'numeric', month: 'short' });

// Extract history records from supported API response shapes.
function getHistoryRows(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.data?.items)) {
    return response.data.items;
  }

  if (Array.isArray(response?.data?.history)) {
    return response.data.history;
  }

  if (Array.isArray(response?.data?.lessons)) {
    return response.data.lessons;
  }

  if (Array.isArray(response?.items)) {
    return response.items;
  }

  if (Array.isArray(response?.history)) {
    return response.history;
  }

  if (Array.isArray(response?.lessons)) {
    return response.lessons;
  }

  return [];
}

/**
 * Show what happened to a lesson:
 * rescheduled, moved, cancelled, or completed.
 */
function LessonNote({ i }) {
  if (i.status === 'rescheduled' && i.movedTo) {
    return (
      <div className="hist-note">
        <span className="hist-move to">
          <ArrowRight size={14} />
          {' '}Moved to {short(i.movedTo.date)},{' '}
          {i.movedTo.periodLabel}
        </span>

        {i.movedTo.reason && (
          <span className="faint">{i.movedTo.reason}</span>
        )}
      </div>
    );
  }

  if (i.movedFrom) {
    return (
      <div className="hist-note">
        <span className="hist-move from">
          <ArrowLeft size={14} />
          {' '}Moved from {short(i.movedFrom.date)},{' '}
          {i.movedFrom.periodLabel}
        </span>

        {i.movedFrom.reason && (
          <span className="faint">{i.movedFrom.reason}</span>
        )}
      </div>
    );
  }

  if (i.status === 'cancelled') {
    return (
      <div className="hist-note">
        <span className="hist-move cancel">
          <XCircle size={14} />
          {' '}Cancelled
        </span>

        {i.cancelReason && (
          <span className="faint">{i.cancelReason}</span>
        )}
      </div>
    );
  }

  if (i.completion?.remarks) {
    return (
      <span className="small">
        {i.completion.remarks}
      </span>
    );
  }

  return <span className="faint">—</span>;
}

export default function HistoryPage() {
  const { user, role } = useApp();

  const [filters, setFilters] = useState({});

  const { data, loading, reload } = useApi(
    () =>
      lessonPlannerApi.getHistory({
        userId: user.id,
        role,
        ...filters,
      }),
    [user.id, role, JSON.stringify(filters)],
  );

  const lm = useLessonModals(reload);

  // Always use an array when rendering history.
  const historyRows = getHistoryRows(data);

  const show = [
    'search',
    'class',
    'section',
    'subject',
    ...(role !== 'teacher' ? ['teacher'] : []),
    'status',
    'from',
    'to',
  ];

  const exportRows = () => {
    const rows = historyRows.map((i) => ({
      Date: i.date,
      Period: i.periodLabel,
      Class: i.classLabel,
      Subject: i.subjectName,
      Chapter: i.chapterTitle,
      Topic: i.topicTitle,
      Teacher: i.teacherName,
      Status:
        STATUS_META[i.status]?.label ||
        i.status ||
        '',
      Understanding:
        i.completion?.understanding || '',
      'Moved to': i.movedTo
        ? `${i.movedTo.date} ${i.movedTo.periodLabel}`
        : '',
      'Moved from': i.movedFrom
        ? `${i.movedFrom.date} ${i.movedFrom.periodLabel}`
        : '',
      'Reason / Remarks':
        i.movedTo?.reason ||
        i.movedFrom?.reason ||
        i.cancelReason ||
        i.completion?.remarks ||
        '',
    }));

    exportToExcel(
      rows,
      'lesson-history.xlsx',
      'History',
    );
  };

  return (
    <>
      <Card>
        <FilterBar
          value={filters}
          onChange={setFilters}
          show={show}
        />
      </Card>

      <Card
        className="flush"
        title={`${historyRows.length} lessons`}
        actions={
          historyRows.length > 0 && (
            <button
              className="btn sm"
              onClick={exportRows}
            >
              <FileSpreadsheet size={14} />
              {' '}Export Excel
            </button>
          )
        }
      >
        {loading && !data ? (
          <Loader />
        ) : historyRows.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="No lessons match these filters"
            text="Try clearing a filter or widening the dates."
          />
        ) : (
          <div
            className="table-wrap"
            style={{ marginTop: 12 }}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Topic</th>

                  {role !== 'teacher' && (
                    <th>Teacher</th>
                  )}

                  <th>Understanding</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>

              <tbody>
                {historyRows.map((i, index) => (
                  <tr
                    key={i.id || index}
                    className="clickable"
                    onClick={() => lm.openDetail(i)}
                  >
                    <td
                      style={{
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fmt(i.date, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}

                      <br />

                      <span className="faint">
                        {i.periodLabel}
                      </span>
                    </td>

                    <td>
                      {i.classLabel}

                      <br />

                      <span className="faint">
                        {i.subjectName}
                      </span>
                    </td>

                    <td>
                      <span className="strong">
                        {i.topicTitle}
                      </span>

                      <br />

                      <span className="faint">
                        {i.chapterTitle}
                      </span>
                    </td>

                    {role !== 'teacher' && (
                      <td>{i.teacherName}</td>
                    )}

                    <td>
                      {i.completion?.understanding || (
                        <span className="faint">—</span>
                      )}
                    </td>

                    <td>
                      <StatusBadge status={i.status} />
                    </td>

                    <td style={{ minWidth: 200 }}>
                      <LessonNote i={i} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {lm.modals}
    </>
  );
}

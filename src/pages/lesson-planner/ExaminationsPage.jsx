import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import Card from '@/components/common/Card';
import ProgressBar from '@/components/common/ProgressBar';
import { useDialog } from '@/context/DialogContext';
import { calculateAvailableClasses, readFeatureStore } from '@/services/featureStore';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import './ExaminationsPage.css';

const blank = {
  examName: 'Quarterly Examination',
  academicYear: '2026-2027',
  classId: 'class-8',
  section: 'A',
  subject: 'Mathematics',
  examDate: '',
  startDate: '',
  endDate: '',
  classesPerWeek: 6,
  requiredPeriods: 30,
  revisionPeriods: 6,
  syllabusIncluded: '',
  remarks: '',
};

export default function ExaminationsPage() {
  const dialog = useDialog();
  const [data, setData] = useState(() => ({
    ...readFeatureStore(),
    exams: []
  }));
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);

  const refresh = async () => {
    const response = await lessonPlannerApi.getExams();

    if (!response.success) {
      throw new Error(response.message || 'Failed to load examinations');
    }

    setData(previous => ({
      ...previous,
      exams: response.data || []
    }));
  };

  useEffect(() => {
    refresh().catch(error => {
      console.error('Failed to load examinations:', error);
    });
  }, []);

  const holidays = data.holidays.map((h) => h.date);
  const examDates = data.exams.filter((e) => e.id !== editing).map((e) => e.examDate);
  const available = useMemo(
    () =>
      calculateAvailableClasses({
        fromDate: new Date().toISOString().slice(0, 10),
        examDate: form.examDate,
        classesPerWeek: form.classesPerWeek,
        holidays,
        examDates,
      }),
    [form.examDate, form.classesPerWeek, holidays.join(','), examDates.join(',')],
  );
  const remaining = available - (Number(form.requiredPeriods) || 0) - (Number(form.revisionPeriods) || 0);
  const save = async () => {
    if (!form.examDate || !form.examName) return;

    try {
      const response = await lessonPlannerApi.saveExam({
        ...(editing ? { id: editing } : {}),
        ...form
      });

      if (!response.success) {
        throw new Error(response.message || 'Failed to save examination');
      }

      await refresh();
      setEditing(null);
      setForm(blank);
    } catch (error) {
      console.error('Failed to save examination:', error);
      window.alert(error.message || 'Failed to save examination');
    }
  };

  const remove = async (exam) => {
    const ok = await dialog.confirm({
      title: 'Delete exam?',
      message: `"${exam.examName}" will be deleted.`,
      confirmLabel: 'Delete',
      danger: true
    });

    if (!ok) return;

    try {
      const response = await lessonPlannerApi.deleteExam(exam.id);

      if (!response.success) {
        throw new Error(response.message || 'Failed to delete examination');
      }

      await refresh();
    } catch (error) {
      console.error('Failed to delete examination:', error);
      window.alert(error.message || 'Failed to delete examination');
    }
  };
  const edit = (e) => {
    setEditing(e.id);
    setForm({ ...e });
  };
  return (
    <div className="exams-page stack">
      <div className="page-heading">
        <div>
          <h2>Examination Planning</h2>
          <p className="muted">
            Create exams, define exam-wise syllabus, and calculate available teaching classes dynamically.
          </p>
        </div>
      </div>
      <div className="grid-2 exams-layout">
        <Card title={editing ? 'Edit examination' : 'Create examination'}>
          <div className="form-grid exam-form">
            <label className="field">
              <span>Exam Name</span>
              <select
                className="select"
                value={form.examName}
                onChange={(e) => setForm({ ...form, examName: e.target.value })}
              >
                {['Quarterly Examination', 'Half-Yearly Examination', 'Final Examination'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Academic Year</span>
              <input
                className="input"
                value={form.academicYear}
                onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Class</span>
              <select
                className="select"
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: e.target.value })}
              >
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Section</span>
              <input
                className="input"
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Subject</span>
              <input
                className="input"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Exam Date</span>
              <input
                className="input"
                type="date"
                value={form.examDate}
                onChange={(e) => setForm({ ...form, examDate: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Start Date</span>
              <input
                className="input"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </label>
            <label className="field">
              <span>End Date</span>
              <input
                className="input"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Classes per week</span>
              <input
                className="input"
                type="number"
                min="1"
                max="6"
                value={form.classesPerWeek}
                onChange={(e) => setForm({ ...form, classesPerWeek: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Teaching Classes Required</span>
              <input
                className="input"
                type="number"
                min="0"
                value={form.requiredPeriods}
                onChange={(e) => setForm({ ...form, requiredPeriods: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Revision Classes</span>
              <input
                className="input"
                type="number"
                min="0"
                value={form.revisionPeriods}
                onChange={(e) => setForm({ ...form, revisionPeriods: e.target.value })}
              />
            </label>
            <label className="field span-2">
              <span>Syllabus Included</span>
              <textarea
                className="textarea"
                placeholder="e.g. Chapter 1, Chapter 2, Chapter 3"
                value={form.syllabusIncluded}
                onChange={(e) => setForm({ ...form, syllabusIncluded: e.target.value })}
              />
            </label>
            <label className="field span-2">
              <span>Remarks</span>
              <textarea
                className="textarea"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </label>
          </div>
          <div className="exam-metrics">
            <div>
              <span>Available Classes</span>
              <strong>{available}</strong>
            </div>
            <div>
              <span>Required</span>
              <strong>{form.requiredPeriods || 0}</strong>
            </div>
            <div>
              <span>Revision</span>
              <strong>{form.revisionPeriods || 0}</strong>
            </div>
            <div className={remaining < 0 ? 'negative' : ''}>
              <span>Remaining</span>
              <strong>{remaining}</strong>
            </div>
          </div>
          {remaining < 0 && (
            <div className="exam-warning">
              <AlertTriangle size={17} /> Required + revision classes exceed the available teaching classes.
            </div>
          )}
          <div className="actions">
            <button className="btn primary" onClick={save} disabled={!form.examDate || remaining < 0}>
              <Plus size={16} />
              {editing ? 'Update Exam' : 'Add Exam'}
            </button>
            {editing && (
              <button
                className="btn"
                onClick={() => {
                  setEditing(null);
                  setForm(blank);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </Card>
        <Card title="Planned examinations">
          <div className="exam-list">
            {data.exams.map((e) => {
              const a = calculateAvailableClasses({
                fromDate: new Date().toISOString().slice(0, 10),
                examDate: e.examDate,
                classesPerWeek: e.classesPerWeek,
                holidays,
                examDates: data.exams.filter((x) => x.id !== e.id).map((x) => x.examDate),
              });
              const req = Number(e.requiredPeriods) || 0;
              const rev = Number(e.revisionPeriods) || 0;
              const pct = Math.min(100, Math.round(((req + rev) / Math.max(a, 1)) * 100));
              return (
                <div className="exam-card" key={e.id}>
                  <div className="row-between">
                    <div>
                      <div className="strong">{e.examName}</div>
                      <div className="small muted">
                        {data.classes.find((c) => c.id === e.classId)?.name} {e.section} Â· {e.subject} Â· {e.examDate}
                      </div>
                    </div>
                    <div className="actions">
                      <button className="icon-btn" onClick={() => edit(e)} aria-label={`Edit ${e.examName}`}>
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Delete ${e.examName}`}
                        onClick={() => remove(e)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="small muted exam-syllabus">Syllabus: {e.syllabusIncluded || 'Not selected'}</div>
                  <ProgressBar value={pct} />
                  <div className="mini-metrics">
                    <span>
                      Available <b>{a}</b>
                    </span>
                    <span>
                      Required <b>{req}</b>
                    </span>
                    <span>
                      Revision <b>{rev}</b>
                    </span>
                    <span>
                      Remaining <b>{a - req - rev}</b>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

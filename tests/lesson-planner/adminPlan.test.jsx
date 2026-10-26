// Admin assigns a plan to a teacher – in-browser mock (same rules as lesson-plan-service)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { generatePlan, previewPlan } from '@/services/mock/api';
import { generatePlanItems } from '@/services/mock/engine';
import { freshDb, call } from '@/test/mockApi';

const ADMIN = { id: 'a1', name: 'Suresh Varma', role: 'admin' };
const TEACHER = { id: 't1', name: 'Priya Sharma', role: 'teacher' };
// Class 8-A Science, Priya (t1), a week with nothing planned yet (2–7 Nov 2026)
const WEEK = { classId: 'c8', sectionId: 's8a', subjectId: 'sci', startDate: '2026-11-02', endDate: '2026-11-07' };

let s;
beforeEach(() => {
  s = freshDb();
});
afterEach(() => vi.useRealTimers());

const sciSyllabus = () => s.syllabus.find((x) => x.classId === 'c8' && x.subjectId === 'sci');

describe('Admin creates a plan for a teacher', () => {
  it('needs a teacher', async () => {
    await expect(call(generatePlan(WEEK, ADMIN))).rejects.toThrow(/Choose the teacher/);
  });

  it('only for an active teacher (not the HOD)', async () => {
    await expect(call(generatePlan({ ...WEEK, teacherId: 't3' }, ADMIN))).rejects.toThrow(/active teacher/);
  });

  it('a teacher cannot choose topics', async () => {
    const [first] = sciSyllabus().chapters[1].topics;
    await expect(call(generatePlan({ ...WEEK, teacherId: 't1', topicIds: [first.id] }, TEACHER))).rejects.toThrow(
      /Only the admin/,
    );
  });

  it('preview shows the chosen topics in the chosen order and saves nothing', async () => {
    const before = s.plans.length;
    const [a, b] = sciSyllabus().chapters[3].topics; // not planned yet in the seed
    const res = await call(previewPlan({ ...WEEK, teacherId: 't1', topicIds: [b.id, a.id] }, ADMIN));
    const order = [...new Set(res.data.lessons.map((l) => l.topicId))];
    expect(order[0]).toBe(b.id);
    expect(res.data.freeSlots).toBeGreaterThan(0);
    expect(s.plans).toHaveLength(before);
  });

  it('creates a draft owned by the teacher, keeps the note and notifies the teacher', async () => {
    const res = await call(generatePlan({ ...WEEK, teacherId: 't1', note: 'Add a lab activity.' }, ADMIN));
    const plan = res.data.plan;
    expect(plan).toMatchObject({ teacherId: 't1', status: 'draft', createdBy: 'a1', assignedByAdmin: true });
    expect(plan.note).toBe('Add a lab activity.');
    const note = s.notifications.find((n) => n.to === 't1' && n.title === 'New plan assigned to you');
    expect(note).toBeTruthy();
    expect(note.text).toMatch(/Add a lab activity/);
    expect(note.link).toBe(`/lesson-planner/plans/${plan.id}`);
  });
});

describe('Engine: chapter dates and per-plan periods', () => {
  const syllabus = {
    chapters: [
      {
        id: 'c1',
        title: 'One',
        startDate: '2026-10-05',
        endDate: '2026-10-10',
        topics: [{ id: 'x', title: 'X', estPeriods: 2 }],
      },
      { id: 'c2', title: 'Two', topics: [{ id: 'y', title: 'Y', estPeriods: 1 }] },
    ],
  };
  // Monday p1 only
  const run = (extra = {}) =>
    generatePlanItems({
      syllabus,
      slots: [{ weekday: 0, periodId: 'p1' }],
      startDate: '2026-09-28',
      endDate: '2026-10-18',
      holidays: [],
      exams: [],
      existingItems: [],
      alreadyPlannedKeys: new Set(),
      ...extra,
    });

  it('a dated chapter waits for its dates; an undated one fills the free period before it', () => {
    const { placed } = run();
    expect(placed.map((p) => `${p.date} ${p.topic.id}`)).toEqual(['2026-09-28 y', '2026-10-05 x']);
  });

  it('what does not fit in its chapter dates is reported with the reason', () => {
    const { unscheduled } = run();
    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0].reason).toMatch(/dates end on 2026-10-10/);
  });

  it('periods can be changed for one plan', () => {
    const { placed } = run({ periodOverrides: { x: 1 } });
    expect(placed.filter((p) => p.topic.id === 'x')).toHaveLength(1);
  });
});

// ── The admin's screen ──
const masters = {
  staff: [
    { id: 't1', name: 'Priya Sharma', role: 'teacher' },
    { id: 't2', name: 'Ravi Kumar', role: 'teacher' },
    { id: 't3', name: 'Anitha Rao', role: 'hod' },
  ],
  templates: [{ id: 'tpl-ssc', name: 'SSC standard', board: 'SSC', isDefault: true }],
};
vi.mock('@/context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    user: { id: 'a1', name: 'Suresh Varma', role: 'admin' },
    masters,
    myAssignments: (id) =>
      id === 't1' ? [{ sectionId: 's8a', subjectId: 'sci', classId: 'c8', periodsPerWeek: 6 }] : [],
    sectionLabel: () => 'Class 8-A',
    subjectName: () => 'Science',
    staffName: (id) => masters.staff.find((x) => x.id === id)?.name,
  }),
}));

describe('Admin create-plan screen', () => {
  it('lists only teachers, then that teacher’s classes', async () => {
    vi.useRealTimers();
    const { default: AdminCreatePlanPage } = await import('@/pages/lesson-planner/AdminCreatePlanPage');
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminCreatePlanPage />
      </MemoryRouter>,
    );
    const select = screen.getByLabelText('Choose an active teacher');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Select a teacher…', 'Priya Sharma', 'Ravi Kumar']);
    expect(screen.getByRole('button', { name: /Preview plan/ })).toBeDisabled();
    fireEvent.change(select, { target: { value: 't1' } });
    expect(screen.getByRole('button', { name: /Class 8-A/ })).toBeTruthy();
  });
});
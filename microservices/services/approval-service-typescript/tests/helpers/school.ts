// @ts-nocheck
// A small demo school, in the same shape auth-service returns from /internal/school/:schoolId
export function demoSchool(overrides = {}) {
  return {
    schoolId: "one",
    classes: [{ id: "c8", name: "Class 8" }],
    sections: [{ id: "s8a", classId: "c8", name: "A" }],
    subjects: [
      { id: "sci", name: "Science", departmentId: "d-sci" },
      { id: "art", name: "Art", departmentId: "d-art" } // a department with no HOD
    ],
    departments: [
      { id: "d-sci", name: "Science", hodId: "t3" },
      { id: "d-art", name: "Art", hodId: null }
    ],
    staff: [
      { id: "t1", name: "Priya Sharma", role: "teacher", active: true },
      { id: "t3", name: "Anitha Rao", role: "hod", active: true },
      { id: "t9", name: "Other HOD", role: "hod", active: true },
      { id: "p1", name: "Principal Rao", role: "principal", active: true }
    ],
    settings: { principalAfterDays: 2 },
    ...overrides
  };
}

// A plan in the shape lesson-plan-service returns from /internal/plans/:id
export function demoPlan(overrides = {}) {
  return {
    _id: "plan-1",
    schoolId: "one",
    teacherId: "t1",
    classId: "c8",
    sectionId: "s8a",
    subjectId: "sci",
    status: "submitted",
    submittedAt: new Date().toISOString(),
    reviews: [],
    ...overrides
  };
}

export const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
// The shapes approval-service reads from lesson-plan-service.

// GET /internal/school/:schoolId  (only the fields approval-service uses)
export interface SchoolStaff {
  id: string;
  name: string;
  role: string;
  departmentId?: string | null;
  active?: boolean;
}
export interface School {
  schoolId: string;
  classes: Array<{ id: string; name: string }>;
  sections: Array<{ id: string; classId: string; name: string }>;
  subjects: Array<{ id: string; name: string; departmentId?: string | null }>;
  departments: Array<{ id: string; name: string; hodId?: string | null }>;
  staff: SchoolStaff[];
  settings?: { principalAfterDays?: number; approver?: 'hod' | 'principal' };
}

// GET /internal/plans/:id  →  { plan, items }
export interface PlanReview {
  by: string;
  action: string;
  comment?: string;
  at?: string;
}
export interface Plan {
  _id?: string;
  id?: string;
  schoolId: string;
  teacherId: string;
  classId?: string;
  sectionId?: string;
  subjectId: string;
  status: string;
  submittedAt?: string | Date | null;
  reviews?: PlanReview[];
}

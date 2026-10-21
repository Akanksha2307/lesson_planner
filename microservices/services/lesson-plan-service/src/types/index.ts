// Shared shapes used across the Lesson Planner service.

export interface AuthUser {
  id: string;
  role: string;
  name?: string;
  departmentId?: string;
  schoolId?: string;
}

// Built by the authenticate middleware and passed to every service function
export interface RequestContext {
  schoolId: string;
  academicYearId: string;
  boardId: string;
}

export interface ValidatedData {
  body?: any;
  query?: any;
  params?: any;
}

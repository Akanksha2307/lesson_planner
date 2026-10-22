export type UserRole = "teacher" | "hod" | "principal" | "admin";

export interface AuthenticatedUser {
  id: string;
  role: UserRole | string;
  schoolId: string;
  name?: string;
}

export type ApprovalStatus =
  | "SUBMITTED"
  | "HOD_REVIEW"
  | "PRINCIPAL_REVIEW"
  | "SENT_BACK_TO_TEACHER"
  | "SENT_BACK_BY_PRINCIPAL"
  | "APPROVED";

export interface ApprovalHistoryItem {
  action: string;
  performedBy: string;
  role: UserRole;
  comment?: string;
  performedAt?: Date;
}

export interface ApprovalRecordDto {
  id?: string;
  lessonPlanId: string;
  title: string;
  subject?: string;
  className?: string;
  section?: string;
  status?: ApprovalStatus;
  history?: ApprovalHistoryItem[];
}

export interface ReviewPlanDto {
  action: "approved" | "returned" | "approve" | "send-back";
  comment?: string;
  reviewerId?: string;
}

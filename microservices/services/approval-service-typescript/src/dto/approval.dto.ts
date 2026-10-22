import type { ApprovalHistoryItem, ApprovalStatus } from "../types/approval.types.js";

export interface CreateApprovalDto {
  lessonPlanId: string;
  title: string;
  subject?: string;
  className?: string;
  section?: string;
}

export interface ApprovalHistoryDto {
  lessonPlanId: string;
  title: string;
  status: ApprovalStatus | string;
  history: ApprovalHistoryItem[];
}

export interface ApprovalResponseDto {
  success: boolean;
  data?: unknown;
  message: string;
}

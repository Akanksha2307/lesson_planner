// Reading approval records: list, one record, one plan's history. A teacher only sees their own.
import type { ApprovalHistoryItem, ApprovalStatus, IApproval } from '../models/index.js';
import { approvalRepository } from '../repositories/approval.repository.js';
import type { AuthUser } from '../types/auth.types.js';
import { forbidden, notFound } from '../utils/AppError.js';

function mustSee(user: AuthUser, record: IApproval): void {
  if (user.role === 'teacher' && record.teacherId !== user.id) throw forbidden('You can only view your own approval requests.');
}

export function listApprovals(user: AuthUser, status?: ApprovalStatus): Promise<IApproval[]> {
  return approvalRepository.list({
    schoolId: user.schoolId,
    ...(user.role === 'teacher' ? { teacherId: user.id } : {}),
    ...(status ? { status } : {}),
  });
}

export async function getApproval(user: AuthUser, id: string): Promise<IApproval> {
  const record = await approvalRepository.findById(user.schoolId, id);
  if (!record) throw notFound('Approval request not found.');
  mustSee(user, record);
  return record;
}

export async function getSubmission(user: AuthUser, planId: string): Promise<IApproval> {
  const record = await approvalRepository.findByPlan(user.schoolId, planId);
  if (!record) throw notFound('Submission not found for this lesson plan.');
  mustSee(user, record);
  return record;
}

export async function getApprovalHistory(
  user: AuthUser,
  planId: string,
): Promise<{ lessonPlanId: string; title: string; status: ApprovalStatus; history: ApprovalHistoryItem[] }> {
  const record = await approvalRepository.findByPlan(user.schoolId, planId);
  if (!record) throw notFound('Approval history not found for this lesson plan.');
  mustSee(user, record);
  return { lessonPlanId: record.lessonPlanId, title: record.title, status: record.status, history: record.history ?? [] };
}

// POST /api/lesson-planner/plans/:id/review – the HOD (or the principal when the HOD is
// unavailable) approves or sends back a submitted plan.
//
//   1. read the plan from lesson-plan-service             (GET   /internal/plans/:id)
//   2. read the school from lesson-plan-service           (GET   /internal/school/:schoolId)
//   3. check the HOD / principal rule                     (hodRules.ts)
//   4. change the plan's status in lesson-plan-service    (PATCH /internal/plans/:id/status)
//   5. keep a record + history here, and notify the teacher (and the HOD if the principal acted)
import type { ApprovalAction } from '../models/index.js';
import { approvalRepository } from '../repositories/approval.repository.js';
import { notificationRepository, type NewNotification } from '../repositories/notification.repository.js';
import type { AuthUser } from '../types/auth.types.js';
import type { Plan, School } from '../types/school.types.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/AppError.js';
import type { PlanReviewBody } from '../validations/approval.validation.js';
import { hodStatus, whyCannotReview } from './hodRules.js';
import { getPlan, getSchool, setPlanStatus } from './lessonPlan.client.js';

type Decision = PlanReviewBody['action']; // 'approved' | 'returned'

const planIdOf = (plan: Plan): string => String(plan.id ?? plan._id);
const nameOf = (school: School, staffId: string): string => school.staff.find((s) => s.id === staffId)?.name ?? '';

// { label: "Class 8-A Science", className: "Class 8-A", subject: "Science" }
function planLabel(plan: Plan, school: School) {
  const section = school.sections.find((s) => s.id === plan.sectionId);
  const cls = school.classes.find((c) => c.id === (section?.classId ?? plan.classId));
  const subject = school.subjects.find((s) => s.id === plan.subjectId)?.name ?? '';
  const className = section ? `${cls?.name ?? ''}-${section.name}` : cls?.name ?? '';
  return { label: `${className} ${subject}`.trim() || 'Lesson plan', className, subject };
}

export async function reviewPlan(user: AuthUser, planId: string, { action, comment }: PlanReviewBody): Promise<Plan> {
  const { plan } = await getPlan(planId);
  if (plan.schoolId !== user.schoolId) throw notFound('Lesson plan not found');

  const school = await getSchool(user.schoolId);

  // Someone already reviewed it (HOD and principal both see it – first one wins)
  if (plan.status !== 'submitted') {
    const last = plan.reviews?.at(-1);
    const who = last ? nameOf(school, last.by) : '';
    throw conflict(last ? `This plan was already reviewed${who ? ` by ${who}` : ''}.` : 'This plan is not waiting for approval.');
  }

  const reason = whyCannotReview(school, user, plan);
  if (reason) throw forbidden(reason);

  if (action === 'returned' && !comment.trim()) throw badRequest('Add a comment so the teacher knows what to change.');

  const updated = await setPlanStatus(planIdOf(plan), { schoolId: user.schoolId, status: action, reviewerId: user.id, comment });

  await saveRecord(user, plan, school, action, comment);
  await notifyAfterReview(user, plan, school, action, comment);
  return updated;
}

// One approval record per plan, with the full history of reviews
async function saveRecord(user: AuthUser, plan: Plan, school: School, action: Decision, comment: string): Promise<void> {
  const id = planIdOf(plan);
  const { label, subject, className } = planLabel(plan, school);
  const approved = action === 'approved';
  const byPrincipal = user.role === 'principal';

  const record =
    (await approvalRepository.findDocumentByPlan(user.schoolId, id)) ??
    approvalRepository.newRecord({
      schoolId: user.schoolId,
      lessonPlanId: id,
      title: label,
      subject,
      className,
      teacherId: plan.teacherId,
      teacherName: nameOf(school, plan.teacherId),
    });

  record.status = approved ? 'APPROVED' : byPrincipal ? 'SENT_BACK_BY_PRINCIPAL' : 'SENT_BACK_TO_TEACHER';
  if (byPrincipal) {
    record.principalId = user.id;
    record.principalComment = comment;
    record.principalReviewedAt = new Date();
  } else {
    record.hodId = user.id;
    record.hodComment = comment;
    record.hodReviewedAt = new Date();
  }
  const historyAction: ApprovalAction = `${byPrincipal ? 'PRINCIPAL' : 'HOD'}_${approved ? 'APPROVED' : 'SENT_BACK'}`;
  record.history.push({ action: historyAction, performedBy: user.id, role: user.role, comment, performedAt: new Date() });
  await record.save();
}

async function notifyAfterReview(user: AuthUser, plan: Plan, school: School, action: Decision, comment: string): Promise<void> {
  const id = planIdOf(plan);
  const { label } = planLabel(plan, school);
  const approved = action === 'approved';
  const reviewerRole = user.role === 'principal' ? 'Principal' : 'HOD';
  const by = `${nameOf(school, user.id) || reviewerRole} (${reviewerRole})`;
  const base = { schoolId: user.schoolId, relatedPlanId: id, link: `/lesson-planner/plans/${id}` };

  const notes: NewNotification[] = [
    {
      ...base,
      recipientId: plan.teacherId,
      type: approved ? 'PLAN_APPROVED' : 'PLAN_SENT_BACK',
      title: approved ? 'Plan approved' : 'Plan sent back',
      message: approved ? `Your ${label} plan was approved by ${by}.` : `Your ${label} plan was sent back by ${by}: “${comment}”`,
    },
  ];

  // The principal reviewed in place of the HOD → tell the HOD
  const hodId = hodStatus(school, plan).hodId;
  if (user.role === 'principal' && hodId && hodId !== user.id) {
    notes.push({
      ...base,
      recipientId: hodId,
      type: 'REVIEWED_BY_PRINCIPAL',
      title: approved ? 'Principal approved a plan' : 'Principal sent back a plan',
      message: `${nameOf(school, user.id)} ${approved ? 'approved' : 'sent back'} ${nameOf(school, plan.teacherId)}'s ${label} plan on your behalf.`,
    });
  }

  await notificationRepository.createMany(notes);
}

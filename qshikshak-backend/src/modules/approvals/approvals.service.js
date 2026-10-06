// Approval workflow:  draft / returned  →  submitted  →  approved  or  returned (with a comment)
//
// Who reviews: the HOD of the subject's department.
// The principal may review ONLY when the HOD is not available:
//   - the department has no HOD, or
//   - the HOD's account is inactive, or
//   - the plan has waited longer than settings.principalAfterDays (default 2) without a review.
// Otherwise the principal can see the plans but cannot approve / send back.
// (If settings.approver = "principal", the principal is always the reviewer.)
// If two people review at the same moment, the first one wins.
import { Plan, PlanItem, PLAN_STATUS, LESSON_STATUS } from '../plans/plans.model.js';
import { getPlan, listPlans } from '../plans/plans.service.js';
import { Department, Staff, Subject } from '../masters/masters.model.js';
import { getSettings } from '../masters/masters.service.js';
import { publish } from '../../common/events.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/response.js';

const DAY = 86400000;

// The HOD responsible for a subject (via its department)
async function hodOf(schoolId, subjectId) {
  const subject = await Subject.findOne({ _id: subjectId, schoolId });
  const dept = subject?.departmentId && (await Department.findOne({ _id: subject.departmentId, schoolId }));
  return dept?.hodId || null;
}

// Is the HOD available to review this plan? If not, why (the principal may then step in).
async function hodStatus(schoolId, plan, settings) {
  const hodId = await hodOf(schoolId, plan.subjectId);
  const hod = hodId && (await Staff.findOne({ _id: hodId, schoolId }));
  const waitingDays = plan.submittedAt ? Math.floor((Date.now() - new Date(plan.submittedAt)) / DAY) : 0;
  const limit = settings.principalAfterDays ?? 2;
  let reason = null;
  if (!hod) reason = 'no HOD is assigned to this department';
  else if (!hod.active) reason = `the HOD (${hod.name}) is inactive`;
  else if (waitingDays >= limit) reason = `the plan has waited ${waitingDays} day${waitingDays === 1 ? '' : 's'} for the HOD`;
  return { hodId: hod?.id || null, hodName: hod?.name, available: !reason, reason, waitingDays, limit };
}

// Can this user review this plan? Returns null if yes, or the reason why not.
async function whyCannotReview(schoolId, user, plan, settings) {
  if (settings.approver === 'principal') {
    return user.role === 'principal' ? null : 'In this school only the principal reviews plans.';
  }
  const hod = await hodStatus(schoolId, plan, settings);
  if (user.role === 'hod') {
    return hod.hodId === user.id ? null : 'Only the HOD of this subject or the principal can review this plan.';
  }
  if (user.role === 'principal') {
    if (!hod.available) return null;
    const left = hod.limit - hod.waitingDays;
    return `${hod.hodName} (HOD) reviews this plan. You can step in if the HOD is unavailable, or if it is still waiting in ${left} day${left === 1 ? '' : 's'}.`;
  }
  return 'You do not have permission to do this.';
}

// The plan with its counts and reviews, as the plan page shows it
const summary = async (ctx, user, id) => (await getPlan(ctx, user, id)).plan;

export async function submitPlan(ctx, user, id) {
  const plan = await Plan.findOne({ _id: id, schoolId: ctx.schoolId });
  if (!plan) throw notFound('This plan does not exist or was deleted.');
  if (plan.teacherId !== user.id) throw forbidden('Only the teacher of this plan can submit it.');
  if (plan.status === PLAN_STATUS.SUBMITTED) throw conflict('This plan is already waiting for approval.');
  if (plan.status === PLAN_STATUS.APPROVED) throw conflict('This plan is already approved.');

  // Every lesson still to be taught needs objectives and a teaching method
  const planned = await PlanItem.find({ planId: id, status: LESSON_STATUS.PLANNED }).lean();
  const missing = planned.filter((i) => !i.details?.objectives?.length || !i.details?.method).length;
  if (missing) {
    throw badRequest(
      `${missing} lesson${missing > 1 ? 's are' : ' is'} missing objectives or teaching method. Fill them before submitting.`,
    );
  }

  const settings = await getSettings(ctx.schoolId);
  const needsApproval = settings.approvalRequired;
  plan.status = needsApproval ? PLAN_STATUS.SUBMITTED : PLAN_STATUS.APPROVED;
  plan.submittedAt = new Date();
  await plan.save();

  let message = 'Plan approved';
  if (needsApproval) {
    const hod = await hodStatus(ctx.schoolId, plan, settings);
    const toPrincipal = settings.approver === 'principal' || !hod.available;
    const principal = await Staff.findOne({ schoolId: ctx.schoolId, role: 'principal', active: true });
    publish('plan.submitted', {
      schoolId: ctx.schoolId,
      planId: id,
      teacherId: plan.teacherId,
      reviewerId: toPrincipal ? principal?.id : hod.hodId,
      reviewerRole: toPrincipal ? 'principal' : 'hod',
    });
    message = toPrincipal ? 'Plan sent to the principal (no HOD available)' : 'Plan sent to HOD';
  }
  return { plan: await summary(ctx, user, id), message };
}

export async function reviewPlan(ctx, user, id, { action, comment }) {
  const plan = await Plan.findOne({ _id: id, schoolId: ctx.schoolId });
  if (!plan) throw notFound('This plan does not exist or was deleted.');
  const settings = await getSettings(ctx.schoolId);
  // A plan that is not waiting gets the "already reviewed" answer below, not a permission error
  if (plan.status === PLAN_STATUS.SUBMITTED) {
    const why = await whyCannotReview(ctx.schoolId, user, plan, settings);
    if (why) throw forbidden(why);
  } else if (!['hod', 'principal'].includes(user.role)) {
    throw forbidden();
  }
  if (action === 'returned' && !comment?.trim()) throw badRequest('Add a comment so the teacher knows what to change.');

  const review = { by: user.id, action, comment: comment?.trim() || '', at: new Date() };
  // Only changes the plan if it is still waiting – so the first reviewer wins
  const updated = await Plan.findOneAndUpdate(
    { _id: id, schoolId: ctx.schoolId, status: PLAN_STATUS.SUBMITTED },
    { $set: { status: action === 'approved' ? PLAN_STATUS.APPROVED : PLAN_STATUS.RETURNED }, $push: { reviews: review } },
    { new: true },
  );
  if (!updated) {
    const now = await Plan.findById(id); // read again: someone may have reviewed a moment ago
    if (now && now.status !== PLAN_STATUS.SUBMITTED && now.reviews.length) {
      const last = now.reviews[now.reviews.length - 1];
      const who = await Staff.findOne({ _id: last.by, schoolId: ctx.schoolId });
      throw conflict(`This plan was already reviewed${who ? ` by ${who.name}` : ''}.`);
    }
    throw conflict('This plan is not waiting for approval.');
  }

  const hodId = await hodOf(ctx.schoolId, plan.subjectId);
  publish('plan.reviewed', {
    schoolId: ctx.schoolId,
    planId: id,
    teacherId: plan.teacherId,
    action,
    comment: review.comment,
    reviewerId: user.id,
    reviewerRole: user.role,
    // The principal reviewed instead of the HOD → tell the HOD
    onBehalfOfHodId: user.role === 'principal' && hodId && hodId !== user.id ? hodId : null,
  });
  return { plan: await summary(ctx, user, id), message: action === 'approved' ? 'Plan approved' : 'Plan sent back' };
}

// Approvals page: plans with this status that this reviewer is responsible for.
// HOD → plans of subjects in their departments. Principal → all plans.
// Each waiting plan says whether this user can review it now (canReview) and why not (reviewNote).
export async function listForReviewer(ctx, user, { status = PLAN_STATUS.SUBMITTED }) {
  const settings = await getSettings(ctx.schoolId);
  const withReviewInfo = async (plans) =>
    Promise.all(
      plans.map(async (p) => {
        if (p.status !== PLAN_STATUS.SUBMITTED) return p;
        const why = await whyCannotReview(ctx.schoolId, user, p, settings);
        return { ...p, canReview: !why, reviewNote: why };
      }),
    );
  const plans = await listPlans(ctx, user, { status });
  if (user.role === 'principal') return withReviewInfo(plans);
  const depts = await Department.find({ schoolId: ctx.schoolId, hodId: user.id }).lean();
  const subjects = await Subject.find({ schoolId: ctx.schoolId, departmentId: { $in: depts.map((d) => d._id) } }).lean();
  const mine = new Set(subjects.map((s) => s._id));
  return withReviewInfo(plans.filter((p) => mine.has(p.subjectId)));
}

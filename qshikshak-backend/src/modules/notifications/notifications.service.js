// Bell notifications. Other modules never call this directly – they publish events
// (plan.submitted, plan.reviewed) and the listeners at the bottom turn them into notifications.
import { Notification } from './notifications.model.js';
import { Plan, PLAN_STATUS } from '../plans/plans.model.js';
import { loadSchool } from '../plans/plans.service.js';
import { Department, Settings, Staff, Subject } from '../masters/masters.model.js';
import { subscribe } from '../../common/events.js';

const DAY = 86400000;
const ROLE = { hod: 'HOD', principal: 'Principal', admin: 'Admin', teacher: 'Teacher' };

// ---------- API ----------
export const listFor = (ctx, user) =>
  Notification.find({ schoolId: ctx.schoolId, to: user.id }).sort({ at: -1 }).limit(50);

export const markAllRead = (ctx, user) =>
  Notification.updateMany({ schoolId: ctx.schoolId, to: user.id, read: false }, { $set: { read: true } });

// ---------- creating notifications ----------
// key (optional): if a notification with this key already exists, do not send it again
export async function notify(schoolId, { to, title, text, link, key }) {
  if (!to) return null;
  if (key && (await Notification.exists({ schoolId, key }))) return null;
  return Notification.create({ schoolId, to, title, text, link, key });
}

// "Class 8-B Science" and the teacher's name, for the message text
async function describe(schoolId, planId) {
  const plan = await Plan.findOne({ _id: planId, schoolId });
  if (!plan) return null;
  const sch = await loadSchool(schoolId);
  return {
    plan,
    label: `${sch.sectionLabel(plan.sectionId)} ${sch.subjectName(plan.subjectId)}`,
    teacher: sch.staff(plan.teacherId)?.name || 'A teacher',
    staffName: (id) => sch.staff(id)?.name,
  };
}

// Teacher submitted → tell the reviewer (the HOD, or the principal when no HOD is available)
export async function onSubmitted({ schoolId, planId, reviewerId, reviewerRole }) {
  const d = await describe(schoolId, planId);
  if (!d) return;
  if (reviewerRole === 'principal') {
    await notify(schoolId, {
      to: reviewerId,
      title: 'Plan to review',
      text: `${d.teacher} submitted ${d.label}. No HOD is available, so please review it.`,
      link: `/lesson-planner/plans/${planId}`,
    });
  } else {
    await notify(schoolId, {
      to: reviewerId,
      title: 'New plan to review',
      text: `${d.teacher} submitted ${d.label}.`,
      link: '/lesson-planner/approvals',
    });
  }
}

// HOD / principal reviewed → tell the teacher; if the principal stepped in, also tell the HOD
export async function onReviewed({ schoolId, planId, teacherId, action, comment, reviewerId, reviewerRole, onBehalfOfHodId }) {
  const d = await describe(schoolId, planId);
  if (!d) return;
  const by = `${d.staffName(reviewerId) || ROLE[reviewerRole]} (${ROLE[reviewerRole]})`;
  const approved = action === 'approved';
  await notify(schoolId, {
    to: teacherId,
    title: approved ? 'Plan approved' : 'Plan sent back',
    text: approved ? `Your ${d.label} plan was approved by ${by}.` : `Your ${d.label} plan was sent back by ${by}: “${comment}”`,
    link: `/lesson-planner/plans/${planId}`,
  });
  if (onBehalfOfHodId) {
    await notify(schoolId, {
      to: onBehalfOfHodId,
      title: approved ? 'Principal approved a plan' : 'Principal sent back a plan',
      text: `${d.staffName(reviewerId)} ${approved ? 'approved' : 'sent back'} ${d.teacher}'s ${d.label} plan on your behalf.`,
      link: `/lesson-planner/plans/${planId}`,
    });
  }
}

// Runs every hour (see server.js): plans the HOD has not reviewed in time → tell the principal once.
export async function remindPrincipals(now = Date.now()) {
  const waiting = await Plan.find({ status: PLAN_STATUS.SUBMITTED, submittedAt: { $ne: null } });
  let sent = 0;
  for (const plan of waiting) {
    const settings = await Settings.findById(plan.schoolId);
    if (settings?.approver === 'principal') continue; // the principal was already the reviewer
    const days = Math.floor((now - new Date(plan.submittedAt)) / DAY);
    if (days < (settings?.principalAfterDays ?? 2)) continue;

    // Skip if the department has no HOD – the principal was told at submit time
    const subject = await Subject.findOne({ _id: plan.subjectId, schoolId: plan.schoolId });
    const dept = subject?.departmentId && (await Department.findOne({ _id: subject.departmentId, schoolId: plan.schoolId }));
    if (!dept?.hodId) continue;

    const principal = await Staff.findOne({ schoolId: plan.schoolId, role: 'principal', active: true });
    const d = await describe(plan.schoolId, plan.id);
    const n = await notify(plan.schoolId, {
      to: principal?.id,
      title: 'Plan waiting for HOD',
      text: `${d.teacher}'s ${d.label} plan has waited ${days} days for the HOD. You can review it now.`,
      link: `/lesson-planner/plans/${plan.id}`,
      key: `remind:${plan.id}:${new Date(plan.submittedAt).getTime()}`, // once per submission
    });
    if (n) sent += 1;
  }
  return sent;
}

// ---------- listen to events ----------
subscribe('plan.submitted', onSubmitted);
subscribe('plan.reviewed', onReviewed);

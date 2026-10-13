import mongoose from "mongoose";
import Approval from "../models/Approval.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireSchool(user) {
  if (!user?.schoolId) {
    throw httpError(403, "Your account is not associated with a school.");
  }

  return user.schoolId;
}

function addHistory(approval, action, user, comment = "") {
  approval.history.push({
    action,
    performedBy: user.id,
    role: user.role,
    comment,
    performedAt: new Date()
  });
}

async function findApproval(id, schoolId) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid approval request ID.");
  }

  const approval = await Approval.findOne({ _id: id, schoolId });

  if (!approval) {
    throw httpError(404, "Approval request not found.");
  }

  return approval;
}

export async function submitApproval(user, input) {
  const schoolId = requireSchool(user);

  if (user.role !== "teacher") {
    throw httpError(403, "Only teachers can submit lesson plans.");
  }

  const existing = await Approval.findOne({
    schoolId,
    lessonPlanId: input.lessonPlanId
  });

  if (existing) {
    if (
      existing.teacherId !== user.id ||
      !["SENT_BACK_TO_TEACHER", "SENT_BACK_BY_PRINCIPAL"].includes(existing.status)
    ) {
      throw httpError(
        409,
        "This lesson plan already has an active or completed approval request."
      );
    }

    existing.title = input.title;
    existing.subject = input.subject;
    existing.className = input.className;
    existing.section = input.section;
    existing.status = "SUBMITTED";
    existing.hodId = "";
    existing.hodComment = "";
    existing.hodReviewedAt = null;
    existing.principalId = "";
    existing.principalComment = "";
    existing.principalReviewedAt = null;

    addHistory(existing, "RESUBMITTED", user);
    await existing.save();

    return existing;
  }

  const approval = new Approval({
    schoolId,
    lessonPlanId: input.lessonPlanId,
    title: input.title,
    subject: input.subject,
    className: input.className,
    section: input.section,
    teacherId: user.id,
    teacherName: user.name ?? "",
    status: "SUBMITTED",
    history: []
  });

  addHistory(approval, "SUBMITTED", user);
  await approval.save();

  return approval;
}

export async function listApprovals(user, filters = {}) {
  const schoolId = requireSchool(user);
  const query = { schoolId };

  if (user.role === "teacher") {
    query.teacherId = user.id;
  } else if (!["hod", "principal", "admin"].includes(user.role)) {
    throw httpError(403, "You cannot view approval requests.");
  }

  if (filters.status) {
    query.status = filters.status;
  }

  return Approval.find(query).sort({ updatedAt: -1 }).limit(200).lean();
}

export async function getApproval(user, id) {
  const schoolId = requireSchool(user);
  const approval = await findApproval(id, schoolId);

  if (user.role === "teacher" && approval.teacherId !== user.id) {
    throw httpError(403, "You can only view your own approval requests.");
  }

  if (!["teacher", "hod", "principal", "admin"].includes(user.role)) {
    throw httpError(403, "You cannot view approval requests.");
  }

  return approval;
}

export async function hodApprove(user, id, comment = "") {
  const schoolId = requireSchool(user);

  if (user.role !== "hod") {
    throw httpError(403, "Only an HOD can approve at this stage.");
  }

  const approval = await findApproval(id, schoolId);

  if (approval.status !== "SUBMITTED") {
    throw httpError(409, "This request is not awaiting HOD review.");
  }

  approval.status = "PRINCIPAL_REVIEW";
  approval.hodId = user.id;
  approval.hodComment = comment;
  approval.hodReviewedAt = new Date();

  addHistory(approval, "HOD_APPROVED", user, comment);
  await approval.save();

  return approval;
}

export async function hodSendBack(user, id, comment = "") {
  const schoolId = requireSchool(user);

  if (user.role !== "hod") {
    throw httpError(403, "Only an HOD can send a request back at this stage.");
  }

  if (!comment.trim()) {
    throw httpError(400, "A comment is required when sending a request back.");
  }

  const approval = await findApproval(id, schoolId);

  if (approval.status !== "SUBMITTED") {
    throw httpError(409, "This request is not awaiting HOD review.");
  }

  approval.status = "SENT_BACK_TO_TEACHER";
  approval.hodId = user.id;
  approval.hodComment = comment;
  approval.hodReviewedAt = new Date();

  addHistory(approval, "HOD_SENT_BACK", user, comment);
  await approval.save();

  return approval;
}

export async function principalApprove(user, id, comment = "") {
  const schoolId = requireSchool(user);

  if (user.role !== "principal") {
    throw httpError(403, "Only a principal can give final approval.");
  }

  const approval = await findApproval(id, schoolId);

  if (approval.status !== "PRINCIPAL_REVIEW") {
    throw httpError(409, "This request is not awaiting principal review.");
  }

  approval.status = "APPROVED";
  approval.principalId = user.id;
  approval.principalComment = comment;
  approval.principalReviewedAt = new Date();

  addHistory(approval, "PRINCIPAL_APPROVED", user, comment);
  await approval.save();

  return approval;
}

export async function principalSendBack(user, id, comment = "") {
  const schoolId = requireSchool(user);

  if (user.role !== "principal") {
    throw httpError(403, "Only a principal can send a request back at this stage.");
  }

  if (!comment.trim()) {
    throw httpError(400, "A comment is required when sending a request back.");
  }

  const approval = await findApproval(id, schoolId);

  if (approval.status !== "PRINCIPAL_REVIEW") {
    throw httpError(409, "This request is not awaiting principal review.");
  }

  approval.status = "SENT_BACK_BY_PRINCIPAL";
  approval.principalId = user.id;
  approval.principalComment = comment;
  approval.principalReviewedAt = new Date();

  addHistory(approval, "PRINCIPAL_SENT_BACK", user, comment);
  await approval.save();

  return approval;
}


export async function getApprovalHistory(user, planId) {
  const schoolId = requireSchool(user);

  const approval = await Approval.findOne({
    schoolId,
    lessonPlanId: planId.trim()
  }).lean();

  if (!approval) {
    throw httpError(404, "Approval history not found for this lesson plan.");
  }

  if (user.role === "teacher" && approval.teacherId !== user.id) {
    throw httpError(403, "You can only view your own approval history.");
  }

  return {
    lessonPlanId: approval.lessonPlanId,
    title: approval.title,
    status: approval.status,
    history: approval.history ?? []
  };
}

export async function getSubmissionDetails(user, planId) {
  const schoolId = requireSchool(user);

  if (!planId || typeof planId !== "string" || !planId.trim()) {
    throw httpError(400, "Lesson plan ID is required.");
  }

  const approval = await Approval.findOne({
    schoolId,
    lessonPlanId: planId.trim()
  }).lean();

  if (!approval) {
    throw httpError(404, "Submission not found for this lesson plan.");
  }

  if (
    user.role === "teacher" &&
    approval.teacherId !== user.id
  ) {
    throw httpError(403, "You can only view your own submissions.");
  }

  if (!["teacher", "hod", "principal", "admin"].includes(user.role)) {
    throw httpError(403, "You cannot view submission details.");
  }

  return approval;
}


// POST /api/lesson-planner/plans/:id/review  –  the HOD (or the principal when the HOD is
// unavailable) approves or sends back a submitted plan.
//
//   1. read the plan from lesson-plan-service            (GET   /internal/plans/:id)
//   2. read the school from auth-service                 (GET   /internal/school/:schoolId)
//   3. check the HOD / principal rule                    (hodRules.js)
//   4. change the plan's status in lesson-plan-service   (PATCH /internal/plans/:id/status)
//   5. keep a record + history here, and notify the teacher (and the HOD if the principal acted)
import Approval from "../models/Approval.js";
import Notification from "../models/Notification.js";
import { getPlan, getSchool, setPlanStatus } from "./serviceClient.js";
import { whyCannotReview, hodStatus } from "./hodRules.js";

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function reviewPlan(user, planId, { action, comment = "" }) {
  if (!user.schoolId) throw httpError(403, "Your account is not associated with a school.");

  const { plan } = await getPlan(planId);
  const id = plan.id || plan._id;
  if (plan.schoolId !== user.schoolId) throw httpError(404, "Lesson plan not found");

  const school = await getSchool(user.schoolId);
  const staff = new Map((school.staff || []).map((s) => [s.id, s]));

  // Someone already reviewed it (HOD and principal both see it – first one wins)
  if (plan.status !== "submitted") {
    const last = (plan.reviews || []).at(-1);
    const who = last && staff.get(last.by)?.name;
    throw httpError(409, last ? `This plan was already reviewed${who ? ` by ${who}` : ""}.` : "This plan is not waiting for approval.");
  }

  const reason = whyCannotReview(school, user, plan);
  if (reason) throw httpError(403, reason);

  if (action === "returned" && !comment.trim()) {
    throw httpError(400, "Add a comment so the teacher knows what to change.");
  }

  // lesson-plan-service changes the status only if the plan is still "submitted"
  const updated = await setPlanStatus(id, { schoolId: user.schoolId, status: action, reviewerId: user.id, comment });

  await saveRecord(user, plan, school, action, comment);
  await notifyAfterReview(user, plan, school, action, comment);
  return updated;
}

// One approval record per plan, with the full history of reviews
async function saveRecord(user, plan, school, action, comment) {
  const id = plan.id || plan._id;
  const { label, subject, className } = planLabel(plan, school);
  const approved = action === "approved";
  const byPrincipal = user.role === "principal";

  let record = await Approval.findOne({ schoolId: user.schoolId, lessonPlanId: id });
  if (!record) {
    record = new Approval({
      schoolId: user.schoolId,
      lessonPlanId: id,
      title: label,
      subject,
      className,
      teacherId: plan.teacherId,
      teacherName: nameOf(school, plan.teacherId)
    });
  }

  record.status = approved ? "APPROVED" : byPrincipal ? "SENT_BACK_BY_PRINCIPAL" : "SENT_BACK_TO_TEACHER";
  if (byPrincipal) {
    record.principalId = user.id;
    record.principalComment = comment;
    record.principalReviewedAt = new Date();
  } else {
    record.hodId = user.id;
    record.hodComment = comment;
    record.hodReviewedAt = new Date();
  }
  record.history.push({
    action: `${byPrincipal ? "PRINCIPAL" : "HOD"}_${approved ? "APPROVED" : "SENT_BACK"}`,
    performedBy: user.id,
    role: user.role,
    comment
  });
  await record.save();
}

async function notifyAfterReview(user, plan, school, action, comment) {
  const id = plan.id || plan._id;
  const { label } = planLabel(plan, school);
  const approved = action === "approved";
  const reviewerRole = user.role === "principal" ? "Principal" : "HOD";
  const by = `${nameOf(school, user.id) || reviewerRole} (${reviewerRole})`;
  const link = `/lesson-planner/plans/${id}`;

  const notes = [
    {
      recipientId: plan.teacherId,
      type: approved ? "PLAN_APPROVED" : "PLAN_SENT_BACK",
      title: approved ? "Plan approved" : "Plan sent back",
      message: approved ? `Your ${label} plan was approved by ${by}.` : `Your ${label} plan was sent back by ${by}: “${comment}”`
    }
  ];

  // The principal reviewed in place of the HOD → tell the HOD
  const hodId = hodStatus(school, plan).hodId;
  if (user.role === "principal" && hodId && hodId !== user.id) {
    notes.push({
      recipientId: hodId,
      type: "REVIEWED_BY_PRINCIPAL",
      title: approved ? "Principal approved a plan" : "Principal sent back a plan",
      message: `${nameOf(school, user.id)} ${approved ? "approved" : "sent back"} ${nameOf(school, plan.teacherId)}'s ${label} plan on your behalf.`
    });
  }

  await Notification.insertMany(notes.map((n) => ({ ...n, schoolId: user.schoolId, relatedPlanId: id, link })));
}

const nameOf = (school, staffId) => (school.staff || []).find((s) => s.id === staffId)?.name || "";

// { label: "Class 8-A Science", className: "Class 8-A", subject: "Science" }
function planLabel(plan, school) {
  const section = (school.sections || []).find((s) => s.id === plan.sectionId);
  const cls = (school.classes || []).find((c) => c.id === (section?.classId || plan.classId));
  const subject = (school.subjects || []).find((s) => s.id === plan.subjectId)?.name || "";
  const className = section ? `${cls?.name || ""}-${section.name}` : cls?.name || "";
  return { label: `${className} ${subject}`.trim() || "Lesson plan", className, subject };
}
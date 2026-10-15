import * as approvalService from "../services/approval.service.js";
import * as reviewService from "../services/review.service.js";

function handleError(res, error) {
  const status = error.status || 500;

  if (status === 500) {
    console.error("Approval Service error:", error);
  }

  return res.status(status).json({
    success: false,
    message:
      status === 500
        ? "An internal server error occurred."
        : error.message
  });
}

function sendSuccess(
  res,
  data,
  message = "Request completed successfully.",
  status = 200
) {
  return res.status(status).json({
    success: true,
    data,
    message
  });
}

// 1. Submit a lesson plan for approval
export async function createApproval(req, res) {
  try {
    const input = {
      ...req.body,
      lessonPlanId: req.params.id ?? req.body.lessonPlanId
    };

    const approval = await approvalService.submitApproval(
      req.user,
      input
    );

    return sendSuccess(
      res,
      approval,
      "Lesson plan submitted for approval.",
      201
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// 2. Get all approval requests
export async function getApprovals(req, res) {
  try {
    const approvals = await approvalService.listApprovals(req.user, {
      status: req.query.status
    });

    return sendSuccess(
      res,
      approvals,
      "Approval requests retrieved."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// Get a single approval by MongoDB document ID
export async function getApprovalById(req, res) {
  try {
    const approval = await approvalService.getApproval(
      req.user,
      req.params.id
    );

    return sendSuccess(
      res,
      approval,
      "Approval request retrieved."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// HOD approves a lesson plan
export async function approveByHod(req, res) {
  try {
    const approval = await approvalService.hodApprove(
      req.user,
      req.params.id,
      req.body.comment
    );

    return sendSuccess(
      res,
      approval,
      "HOD review completed. Sent to principal."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// HOD sends a lesson plan back
export async function sendBackByHod(req, res) {
  try {
    const approval = await approvalService.hodSendBack(
      req.user,
      req.params.id,
      req.body.comment
    );

    return sendSuccess(
      res,
      approval,
      "Lesson plan sent back by HOD."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// Principal approves a lesson plan
export async function approveByPrincipal(req, res) {
  try {
    const approval = await approvalService.principalApprove(
      req.user,
      req.params.id,
      req.body.comment
    );

    return sendSuccess(
      res,
      approval,
      "Lesson plan approved by principal."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// Principal sends a lesson plan back
export async function sendBackByPrincipal(req, res) {
  try {
    const approval = await approvalService.principalSendBack(
      req.user,
      req.params.id,
      req.body.comment
    );

    return sendSuccess(
      res,
      approval,
      "Lesson plan sent back by principal."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// 5. Get approval history for a lesson plan
export async function getApprovalHistory(req, res) {
  try {
    const history = await approvalService.getApprovalHistory(
      req.user,
      req.params.planId
    );

    return sendSuccess(
      res,
      history,
      "Approval history retrieved successfully."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// 2. Get submission details for a lesson plan
export async function getSubmissionDetails(req, res) {
  try {
    const submission = await approvalService.getSubmissionDetails(
      req.user,
      req.params.planId
    );

    return sendSuccess(
      res,
      submission,
      "Submission details retrieved successfully."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// 3. HOD or principal reviews a lesson plan using its lesson-plan ID
export async function reviewLessonPlan(req, res) {
  try {
    const { action, comment = "" } = req.body;
    const planId = req.params.id;

    if (
      req.user.role !== "hod" &&
      req.user.role !== "principal"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Only an HOD or principal can review a lesson plan."
      });
    }

    const submission = await approvalService.getSubmissionDetails(
      req.user,
      planId
    );

    if (!submission || !submission._id) {
      return res.status(404).json({
        success: false,
        message: "Approval request not found for this lesson plan."
      });
    }

    const approvalId = submission._id.toString();

    let approval;

    if (req.user.role === "hod") {
      approval =
        action === "approve"
          ? await approvalService.hodApprove(
              req.user,
              approvalId,
              comment
            )
          : await approvalService.hodSendBack(
              req.user,
              approvalId,
              comment
            );
    } else {
      approval =
        action === "approve"
          ? await approvalService.principalApprove(
              req.user,
              approvalId,
              comment
            )
          : await approvalService.principalSendBack(
              req.user,
              approvalId,
              comment
            );
    }

    return sendSuccess(
      res,
      approval,
      "Lesson plan review completed."
    );
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/lesson-planner/plans/:id/review  –  HOD (or principal when the HOD is unavailable)
// approves or sends back. Changes the plan's status in lesson-plan-service.
export async function reviewPlan(req, res) {
  try {
    const plan = await reviewService.reviewPlan(req.user, req.params.id, req.body);
    return sendSuccess(res, plan, req.body.action === "approved" ? "Plan approved" : "Plan sent back");
  } catch (error) {
    return handleError(res, error);
  }
}
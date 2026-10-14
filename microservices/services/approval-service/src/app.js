
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Router } from "express";

import approvalRoutes from "./routes/approval.routes.js";
import notificationRoutes from "./routes/notification.routes.js";

import {
  getSubmissionDetails,
  createApproval,
  reviewLessonPlan
} from "./controllers/approval.controller.js";

import {
  authenticateToken,
  authorizeRoles
} from "./middleware/auth.middleware.js";

import {
  validateBody,
  planSubmissionSchema,
  lessonPlanReviewSchema
} from "./validations/approval.validation.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());

const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS."));
    }
  })
);

app.use(express.json({ limit: "1mb" }));

// Service information
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "Approval Service",
    message: "Service is running successfully."
  });
});

// Health check
app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "Approval Service",
    status: "healthy"
  });
});

// APIs 4 and 5:
// GET /api/approvals
// GET /api/approvals/log/:planId
app.use("/api/approvals", approvalRoutes);

// APIs 1 and 3:
// POST /api/plans/:id/submit
// POST /api/plans/:id/review
const planRoutes = Router();

planRoutes.post(
  "/:id/submit",
  authenticateToken,
  authorizeRoles("teacher"),
  validateBody(planSubmissionSchema),
  createApproval
);

planRoutes.post(
  "/:id/review",
  authenticateToken,
  authorizeRoles("hod", "principal"),
  validateBody(lessonPlanReviewSchema),
  reviewLessonPlan
);

app.use("/api/plans", planRoutes);

// API 2:
// GET /api/submissions/:planId
app.get(
  "/api/submissions/:planId",
  authenticateToken,
  getSubmissionDetails
);

// APIs 6 and 7:
// GET /api/notifications
// POST /api/notifications/read
app.use("/api/notifications", notificationRoutes);

// Handle unknown routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found."
  });
});

// Central error handler
app.use((error, _req, res, _next) => {
  if (error.message === "Origin is not allowed by CORS.") {
    return res.status(403).json({
      success: false,
      message: error.message
    });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON request body."
    });
  }

  console.error("Unhandled application error:", error);

  return res.status(500).json({
    success: false,
    message: "An internal server error occurred."
  });
});

export default app;

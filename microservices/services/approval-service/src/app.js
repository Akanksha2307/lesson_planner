import express from "express";
import cors from "cors";
import helmet from "helmet";
import approvalRoutes from "./routes/approval.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import internalRoutes from "./routes/internal.routes.js";
import { getSubmissionDetails, reviewPlan } from "./controllers/approval.controller.js";
import { authenticateToken, authorizeRoles } from "./middleware/auth.middleware.js";
import { internalOnly } from "./middleware/internalOnly.js";
import { validateBody, planReviewSchema } from "./validations/approval.validation.js";

// Same prefix as the other services, so the gateway passes URLs through unchanged
const BASE = "/api/lesson-planner";

const app = express();

app.disable("x-powered-by");
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3002")
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
  res.status(200).json({ success: true, service: "Approval Service", message: "Service is running successfully." });
});

// Health check (Docker and the gateway use this)
app.get("/health", (_req, res) => {
  res.status(200).json({ success: true, service: "Approval Service", status: "healthy" });
});

// HOD / principal approves or sends back a submitted plan.
// (Submitting is done by lesson-plan-service: POST /api/lesson-planner/plans/:id/submit)
app.post(
  `${BASE}/plans/:id/review`,
  authenticateToken,
  authorizeRoles("hod", "principal"),
  validateBody(planReviewSchema),
  reviewPlan
);

// Approval records and review history
app.use(`${BASE}/approvals`, approvalRoutes);

// Service-to-service: other services ring the bell (needs the INTERNAL_TOKEN)
app.use("/internal", internalOnly, internalRoutes);

// One plan's approval record
app.get(`${BASE}/submissions/:planId`, authenticateToken, getSubmissionDetails);

// Bell: GET /notifications, POST /notifications/read
app.use(`${BASE}/notifications`, notificationRoutes);

// Handle unknown routes
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// Central error handler
app.use((error, _req, res, _next) => {
  if (error.message === "Origin is not allowed by CORS.") {
    return res.status(403).json({ success: false, message: error.message });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON request body." });
  }
  console.error("Unhandled application error:", error);
  return res.status(500).json({ success: false, message: "An internal server error occurred." });
});

export default app;
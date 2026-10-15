
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "./config/index.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import holidayRoutes from "./routes/holiday.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import internalRoutes from "./routes/internal.routes.js";
import syllabusRoutes from "./routes/syllabus.routes.js";
import libraryRoutes from "./routes/library.routes.js";
import plansRoutes from "./routes/plans.routes.js";
import todayRoutes from "./routes/today.routes.js";
import calendarRoutes from "./routes/calendar.routes.js";
import completionRoutes from "./routes/completion.routes.js";
import rescheduleRoutes from "./routes/reschedule.routes.js";
import remainingRoutes from "./routes/remaining.routes.js";

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(
  cors({
    origin: config.corsOrigins
  })
);

// Body parser
app.use(express.json({ limit: "2mb" }));

// Request logging
app.use(morgan("dev"));

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "lesson-plan-service",
    status: "running",
    port: config.port
  });
});

// Internal microservice routes
app.use("/internal", internalRoutes);

// Lesson Planner APIs
const BASE = "/api/lesson-planner";

app.use(BASE, authenticate, syllabusRoutes);
app.use(BASE, authenticate, libraryRoutes);
app.use(BASE, authenticate, plansRoutes);
app.use(BASE, authenticate, todayRoutes);
app.use(BASE, authenticate, calendarRoutes);
app.use(BASE, authenticate, completionRoutes);
app.use(BASE, authenticate, rescheduleRoutes);
app.use(BASE, authenticate, remainingRoutes);
app.use(BASE, authenticate, holidayRoutes);
app.use(BASE, authenticate, aiRoutes);
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// Global error handler
app.use(errorHandler);

export default app;

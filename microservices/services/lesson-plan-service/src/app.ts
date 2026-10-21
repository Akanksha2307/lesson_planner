import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";

import { config } from "./config/index";
import authenticate from "./middleware/auth.middleware";
import errorMiddleware from "./middleware/error.middleware";
import apiRoutes from "./routes/index";
import internalRoutes from "./routes/internal.routes";

const app = express();

// Security middleware
app.use(helmet());

// CORS (allowed origins come from CORS_ORIGINS)
app.use(
  cors({
    origin: config.corsOrigins
  })
);

// Body parser – runs before every route that reads req.body
app.use(express.json({ limit: "2mb" }));

// Request logging
app.use(morgan("dev"));

// Health check

// Health check
app.get("/health", (req: Request, res: Response) => {
  const dbConnected = mongoose.connection.readyState === 1;

  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    data: {
      service: "lesson-plan-service",
      db: dbConnected ? "up" : "down"
    },
    message: dbConnected
      ? "Service healthy"
      : "Database unavailable"
  });
});


// Internal microservice routes (x-internal-token)
app.use("/internal", internalRoutes);

// Lesson Planner APIs
//   CORS → body parser → authenticate → [authorize → validate → controller] (per route)
const BASE = "/api/lesson-planner";

app.use(BASE, authenticate, apiRoutes);

// 404 handler
// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    data: null,
    message: "Route not found"
  });
});
// Global error handler
app.use(errorMiddleware);

export default app;

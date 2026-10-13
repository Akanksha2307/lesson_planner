
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "./config/index.js";
import plansRoutes from "./routes/plans.routes.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import libraryRoutes from "./routes/library.routes.js";
import syllabusRoutes from "./routes/syllabus.routes.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: config.corsOrigins
  })
);

app.use(express.json({ limit: "2mb" }));

app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "lesson-plan-service",
    status: "running",
    port: config.port
  });
});

app.use(
  "/api/lesson-planner",
  authenticate,
  syllabusRoutes
);

app.use(
  "/api/lesson-planner",
  authenticate,
  libraryRoutes
);

app.use("/api/lesson-planner", plansRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

app.use(errorHandler);

export default app;

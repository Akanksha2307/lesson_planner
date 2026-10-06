// Builds the Express app (no network / database here, so tests can import it).
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import { authenticate } from './common/auth.js';
import { errorHandler, notFoundRoute } from './common/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import libraryRoutes from './modules/library/library.routes.js';
import mastersRoutes from './modules/masters/masters.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import plansRoutes from './modules/plans/plans.routes.js';
import approvalsRoutes from './modules/approvals/approvals.routes.js';
import syllabusRoutes from './modules/syllabus/syllabus.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  if (config.env !== 'test') app.use(morgan('dev'));

  // Health check – no login needed
  app.get('/api/health', (req, res) =>
    res.json({
      success: true,
      data: { status: 'up', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' },
      message: 'OK',
    }),
  );

  // Login – no token needed
  app.use('/api/auth', authRoutes);

  // Lesson Planner modules – all need a logged-in user
  const lessonPlanner = express.Router();
  lessonPlanner.use(authenticate);
  lessonPlanner.use(mastersRoutes);
  lessonPlanner.use(syllabusRoutes);
  lessonPlanner.use(plansRoutes);
  lessonPlanner.use(approvalsRoutes);
  lessonPlanner.use(notificationsRoutes);
  lessonPlanner.use(libraryRoutes);
  app.use('/api/lesson-planner', lessonPlanner);

  app.use(notFoundRoute);
  app.use(errorHandler);
  return app;
}
// @ts-nocheck

import { Router } from "express";
import {
  getNotifications,
  markNotificationsRead
} from "../controllers/notification.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticateToken);

router.get("/", getNotifications);
router.post("/read", markNotificationsRead);

export default router;

import type { Request, Response } from 'express';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { bodyOf, queryOf } from '../middleware/validation.middleware.js';
import * as notifications from '../services/notification.service.js';
import { unauthorized } from '../utils/AppError.js';
import { ok } from '../utils/response.js';
import type { listNotificationsQuery, markReadBody, notifyBody } from '../validations/notification.validation.js';

const userOf = (req: Request) => {
  if (!req.user) throw unauthorized();
  return req.user;
};

// GET /notifications?unread=true
export async function listNotifications(req: Request, res: Response): Promise<void> {
  const { unread } = queryOf<typeof listNotificationsQuery>(req);
  ok(res, await notifications.listNotifications(userOf(req), unread), 'Notifications retrieved.');
}

// POST /notifications/read   { notificationIds? }
export async function markNotificationsRead(req: Request, res: Response): Promise<void> {
  const { notificationIds } = bodyOf<typeof markReadBody>(req);
  ok(res, await notifications.markRead(userOf(req), notificationIds), 'Notifications marked as read.');
}

// POST /internal/notify   (other services ring the bell)
export async function notify(req: Request, res: Response): Promise<void> {
  ok(res, await notifications.notify(bodyOf<typeof notifyBody>(req)), 'Notifications sent.', HTTP_STATUS.CREATED);
}

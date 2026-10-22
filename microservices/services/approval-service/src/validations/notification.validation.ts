import { z } from 'zod';
import { idString, objectId } from './common.validation.js';

// GET /notifications?unread=true
export const listNotificationsQuery = z.object({
  unread: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;

// POST /notifications/read   { notificationIds? }  – no ids = "mark all as read" (what the frontend sends)
export const markReadBody = z.object({
  notificationIds: z.array(objectId('notification id')).min(1).max(100).optional(),
});
export type MarkReadBody = z.infer<typeof markReadBody>;

// POST /internal/notify   { schoolId, to: ["t1","t3"], title, text, link?, type? }
export const notifyBody = z.object({
  schoolId: idString('schoolId'),
  to: z.array(idString('recipient id')).min(1).max(500),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(2000),
  link: z.string().trim().max(300).optional().nullable(),
  type: z.string().trim().max(100).optional(),
});
export type NotifyBody = z.infer<typeof notifyBody>;

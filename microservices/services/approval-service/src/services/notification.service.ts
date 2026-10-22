// The bell: list, mark as read, and create (for other services).
import { notificationRepository } from '../repositories/notification.repository.js';
import type { AuthUser } from '../types/auth.types.js';
import type { NotifyBody } from '../validations/notification.validation.js';

// The shape the frontend's bell uses
export interface NotificationItemDto {
  id: string;
  to: string;
  title: string;
  text: string;
  link: string | null;
  at: Date | undefined;
  read: boolean;
}

export async function listNotifications(user: AuthUser, unreadOnly: boolean): Promise<NotificationItemDto[]> {
  const rows = await notificationRepository.findForRecipient(user.schoolId, user.id, unreadOnly);
  return rows.map((n) => ({
    id: String(n._id),
    to: n.recipientId,
    title: n.title,
    text: n.message,
    link: n.link || (n.relatedPlanId ? `/lesson-planner/plans/${n.relatedPlanId}` : null),
    at: n.createdAt,
    read: n.isRead,
  }));
}

// No ids = mark every unread one (what the frontend's bell sends)
export async function markRead(user: AuthUser, ids?: string[]): Promise<{ modifiedCount: number }> {
  return { modifiedCount: await notificationRepository.markRead(user.schoolId, user.id, ids) };
}

// POST /internal/notify – one notification per person (duplicates in "to" are removed)
export async function notify({ schoolId, to, title, text, link, type }: NotifyBody): Promise<{ created: number }> {
  const created = await notificationRepository.createMany(
    [...new Set(to)].map((recipientId) => ({ schoolId, recipientId, type: type || 'GENERAL', title, message: text, link: link || null })),
  );
  return { created };
}

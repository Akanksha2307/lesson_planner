// All database access for the bell.
import { Notification, type INotification, type NotificationRow } from '../models/index.js';

export type NewNotification = Pick<INotification, 'schoolId' | 'recipientId' | 'type' | 'title' | 'message'> &
  Partial<Pick<INotification, 'relatedPlanId' | 'link'>>;

export const notificationRepository = {
  findForRecipient(schoolId: string, recipientId: string, unreadOnly: boolean): Promise<NotificationRow[]> {
    return Notification.find({ schoolId, recipientId, ...(unreadOnly ? { isRead: false } : {}) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean<NotificationRow[]>()
      .exec();
  },

  async markRead(schoolId: string, recipientId: string, ids?: string[]): Promise<number> {
    const r = await Notification.updateMany(
      { schoolId, recipientId, isRead: false, ...(ids ? { _id: { $in: ids } } : {}) },
      { $set: { isRead: true, readAt: new Date() } },
    ).exec();
    return r.modifiedCount;
  },

  async createMany(rows: NewNotification[]): Promise<number> {
    if (!rows.length) return 0;
    const docs = await Notification.insertMany(rows);
    return docs.length;
  },
};

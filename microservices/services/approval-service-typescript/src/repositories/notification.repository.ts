import Notification from "../models/Notification.js";

/** Data-access layer for notification persistence. */
export const NotificationRepository = {
  findForRecipient(filter: Record<string, unknown>) {
    return Notification.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  },

  markAllUnreadRead(schoolId: string, recipientId: string) {
    return Notification.updateMany(
      { schoolId, recipientId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
  },

  markSelectedRead(schoolId: string, recipientId: string, notificationIds: string[]) {
    return Notification.updateMany(
      {
        _id: { $in: notificationIds },
        schoolId,
        recipientId,
        isRead: false
      },
      { $set: { isRead: true, readAt: new Date() } }
    );
  },

  createMany(documents: Record<string, unknown>[]) {
    return Notification.insertMany(documents);
  }
};

export default NotificationRepository;

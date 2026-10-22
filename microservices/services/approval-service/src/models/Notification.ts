// The bell: one row per person per message
import { Schema, model, type Types } from 'mongoose';

export interface INotification {
  schoolId: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  relatedPlanId: string | null;
  /** Page the bell opens when clicked, e.g. /lesson-planner/plans/plan-123 */
  link: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
export type NotificationRow = INotification & { _id: Types.ObjectId };

const notificationSchema = new Schema<INotification>(
  {
    schoolId: { type: String, required: true, index: true },
    recipientId: { type: String, required: true, index: true },
    type: { type: String, default: 'GENERAL', trim: true, maxlength: 100 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    relatedPlanId: { type: String, default: null },
    link: { type: String, default: null },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);
notificationSchema.index({ schoolId: 1, recipientId: 1, isRead: 1, createdAt: -1 });

export const Notification = model<INotification>('Notification', notificationSchema);

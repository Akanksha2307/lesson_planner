export interface NotificationItemDto {
  id: string;
  to: string;
  title: string;
  text: string;
  link: string | null;
  at: Date | string;
  read: boolean;
}

export interface CreateNotificationDto {
  schoolId: string;
  recipientId: string;
  type?: string;
  title: string;
  message: string;
  relatedPlanId?: string | null;
  link?: string | null;
}

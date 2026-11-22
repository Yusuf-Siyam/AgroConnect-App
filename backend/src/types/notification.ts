export const NOTIFICATION_TYPES = [
  'chat_message',
  'support_message',
  'support_reply',
  'order_placed',
  'order_accepted',
  'order_rejected',
  'order_cancelled',
  'job_accepted',
  'order_collected',
  'order_shipped',
  'order_delivered',
  'emergency_listing_created',
  'emergency_listing_cancelled',
  'group_successful',
  'group_failed',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PLATFORMS = ['ios', 'android', 'web'] as const;
export type NotificationPlatform = (typeof NOTIFICATION_PLATFORMS)[number];

/** Stored params never include chat message text or a delivery code. */
export type ChatNotificationParams = { chatId: string; senderName: string };
export type OrderNotificationParams = { orderId: string };
export type EmergencyNotificationParams = { listingId: string; productId: string };
export type GroupNotificationParams = { groupId: string; productId: string };
export type NotificationParams =
  | ChatNotificationParams
  | OrderNotificationParams
  | EmergencyNotificationParams
  | GroupNotificationParams;

export type ChatNotificationTarget = { chatId: string; url: string };
export type OrderNotificationTarget = { orderId: string; url: string };
export type ProductNotificationTarget = { productId: string; url: string };
export type NotificationTarget =
  | ChatNotificationTarget
  | OrderNotificationTarget
  | ProductNotificationTarget;

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  params: NotificationParams;
  target: NotificationTarget;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationList = {
  items: Notification[];
  total: number;
  limit: number;
  offset: number;
};

export type NotificationUnreadCount = { count: number };

export type LocalizedNotificationText = {
  title: string;
  body: string;
};

export type PushMessage = {
  title: string;
  body: string;
  data: Record<string, string>;
};

export type PushProvider = {
  /** Best-effort only; callers must tolerate failures. */
  send(userId: string, tokens: string[], message: PushMessage): Promise<void>;
};

export type NotificationDelivery = {
  inAppCreated: boolean;
  pushDelivered: boolean;
};

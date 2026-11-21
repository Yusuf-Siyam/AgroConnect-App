export const NOTIFICATION_TYPES = ['chat_message', 'support_message', 'support_reply'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PLATFORMS = ['ios', 'android', 'web'] as const;
export type NotificationPlatform = (typeof NOTIFICATION_PLATFORMS)[number];

/** Stored params never include chat message content. */
export type NotificationParams = {
  chatId: string;
  senderName: string;
};

export type NotificationTarget = {
  chatId: string;
  url: string;
};

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

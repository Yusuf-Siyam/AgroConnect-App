import type { Role } from '../../types/user';

export const CHAT_TYPES = ['buyer_farmer', 'buyer_transporter', 'support'] as const;
export type ChatType = (typeof CHAT_TYPES)[number];

export type ChatRole = Role | 'support';

/** Chat participants only ever receive a display name and role. */
export type ParticipantInfo = {
  displayName: string;
  role: ChatRole;
};

export type Chat = {
  id: string;
  type: ChatType;
  participants: string[];
  participantInfo: Record<string, ParticipantInfo>;
  buyerId?: string;
  farmerId?: string;
  transporterId?: string;
  orderId?: string;
  lastMessageAt: string | null;
  unreadCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
  readBy: string[];
};

export type ChatList = {
  items: Chat[];
  total: number;
  limit: number;
  offset: number;
};

export type CreateChatInput = {
  type: ChatType;
  farmerId?: string;
  buyerId?: string;
  orderId?: string;
};

/** Stored notifications are type + params; the mobile app renders the text. */
export type ChatNotificationType = 'chat_message' | 'support_message' | 'support_reply';

export type NotificationRecord = {
  id: string;
  userId: string;
  type: ChatNotificationType;
  params: { chatId: string; senderName: string };
  target: { chatId: string; url: string };
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
};

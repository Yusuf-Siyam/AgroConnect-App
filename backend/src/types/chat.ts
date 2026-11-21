import type { Role } from './auth';

export const CHAT_TYPES = ['buyer_farmer', 'buyer_transporter', 'support'] as const;
export type ChatType = (typeof CHAT_TYPES)[number];

/** Only name and role are exposed to chat participants. */
export type ParticipantInfo = {
  displayName: string;
  role: Role | 'support';
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

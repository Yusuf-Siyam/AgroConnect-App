import { api, assertApiConfigured, toApiError } from '@/services/api';

import type {
  Chat,
  ChatMessage,
  CreateChatInput,
  NotificationListResponse,
  NotificationUnreadCount,
} from './types';

async function request<T>(operation: () => Promise<{ data: T }>): Promise<T> {
  assertApiConfigured();
  try {
    return (await operation()).data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** Chats and messages are created only through the backend; mobile sends via REST. */
export function createChat(input: CreateChatInput): Promise<Chat> {
  return request(() => api.post<Chat>('/api/chat/conversations', input));
}

export function sendChatMessage(chatId: string, text: string): Promise<ChatMessage> {
  return request(() =>
    api.post<ChatMessage>(`/api/chat/conversations/${chatId}/messages`, { text }),
  );
}

/** Mark-read is a write, so it goes through the backend rather than Firestore. */
export function markChatRead(chatId: string): Promise<void> {
  return request(() => api.post<void>(`/api/chat/conversations/${chatId}/read`));
}

/** Notification reads and writes go through the owner-only backend endpoints. */
export function listNotifications(params: {
  limit?: number;
  offset?: number;
  unread?: boolean;
}): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.unread) query.set('unread', 'true');
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return request(() => api.get<NotificationListResponse>(`/api/notifications${suffix}`));
}

export function getUnreadNotificationCount(): Promise<NotificationUnreadCount> {
  return request(() => api.get<NotificationUnreadCount>('/api/notifications/unread-count'));
}

export function markNotificationRead(notificationId: string): Promise<void> {
  return request(() => api.post<void>(`/api/notifications/${notificationId}/read`));
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return request(() => api.post<{ updated: number }>('/api/notifications/read-all'));
}

export { chatErrorKey } from './errorMessages';

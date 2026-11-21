import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { Chat, ChatMessage, CreateChatInput } from './types';

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

/** In-app notifications are read from Firestore; only this write goes via REST. */
export function markNotificationRead(notificationId: string): Promise<void> {
  return request(() => api.post<void>(`/api/notifications/${notificationId}/read`));
}

export { chatErrorKey } from './errorMessages';

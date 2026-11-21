import type { Chat } from './types';

export const CHAT_MESSAGE_MAX_LENGTH = 1000;

/** Text-only, trimmed and non-empty; returns null for invalid drafts. */
export function normalizeChatMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > CHAT_MESSAGE_MAX_LENGTH) return null;
  return trimmed;
}

/** Support threads use the 'support' pseudonym as the admin unread key. */
export function unreadFor(chat: Chat | null, uid: string, isAdmin = false): number {
  if (!chat) return 0;
  const key = isAdmin && chat.type === 'support' ? 'support' : uid;
  return Number(chat.unreadCounts[key] ?? 0);
}

import type { TranslationKey } from '../../locales/en';

/** Backend chat codes are never shown raw; the UI uses translated copy. */
export function chatErrorKey(code?: string): TranslationKey {
  switch (code) {
    case 'CHAT_MESSAGE_RATE_LIMITED':
      return 'chat.error.rateLimited';
    case 'CHAT_CONVERSATION_LIMIT_REACHED':
      return 'chat.error.conversationLimit';
    case 'CHAT_SUPPORT_RATE_LIMITED':
      return 'chat.error.supportLimit';
    case 'CHAT_NOT_FOUND':
      return 'chat.error.notFound';
    case 'CHAT_NOT_AVAILABLE':
      return 'chat.error.notAvailable';
    case 'CHAT_PARTY_INVALID':
    case 'CHAT_TYPE_FORBIDDEN':
      return 'chat.error.forbidden';
    case 'USER_NOT_FOUND':
      return 'chat.error.userNotFound';
    case 'NETWORK_ERROR':
      return 'error.network';
    default:
      return 'error.generic';
  }
}

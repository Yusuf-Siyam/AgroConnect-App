import type { ChatNotificationType } from './types';

export type ChatLocale = 'bn' | 'en';

/**
 * Mobile mirror of the backend registry. Notifications are stored as type +
 * params only; rendered text exists here and in the backend, never in Firestore.
 */
export const CHAT_NOTIFICATION_TEMPLATES: Record<
  ChatNotificationType,
  Record<ChatLocale, { title: string; body: string }>
> = {
  chat_message: {
    bn: { title: 'নতুন বার্তা', body: '{{senderName}} একটি বার্তা পাঠিয়েছেন।' },
    en: { title: 'New message', body: '{{senderName}} sent you a message.' },
  },
  support_message: {
    bn: { title: 'নতুন সাপোর্ট বার্তা', body: '{{senderName}} সাপোর্টে একটি বার্তা পাঠিয়েছেন।' },
    en: { title: 'New support message', body: '{{senderName}} sent a support message.' },
  },
  support_reply: {
    bn: { title: 'সাপোর্টের উত্তর', body: '{{senderName}} আপনার সাপোর্ট অনুরোধের উত্তর দিয়েছেন।' },
    en: { title: 'Support reply', body: '{{senderName}} replied to your support request.' },
  },
};

export function renderChatNotification(
  locale: ChatLocale,
  type: ChatNotificationType,
  senderName: string,
): { title: string; body: string } {
  const template = CHAT_NOTIFICATION_TEMPLATES[type][locale];
  return {
    title: template.title.replaceAll('{{senderName}}', senderName),
    body: template.body.replaceAll('{{senderName}}', senderName),
  };
}

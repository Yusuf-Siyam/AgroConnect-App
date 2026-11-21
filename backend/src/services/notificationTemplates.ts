import type { LocalizedNotificationText, NotificationParams, NotificationType } from '../types/notification';

type Locale = 'bn' | 'en';

type Template = { title: string; body: string };

/**
 * Notifications are stored as type + params. Rendered text exists only here and
 * in the mobile mirror; no message content is ever accepted or persisted.
 */
export const NOTIFICATION_TEMPLATES: Record<NotificationType, Record<Locale, Template>> = {
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

export function renderNotification(
  locale: Locale,
  type: NotificationType,
  params: NotificationParams,
): LocalizedNotificationText {
  const template = NOTIFICATION_TEMPLATES[type][locale];
  const replace = (value: string) => value.replaceAll('{{senderName}}', params.senderName);
  return { title: replace(template.title), body: replace(template.body) };
}

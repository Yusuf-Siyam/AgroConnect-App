import { NOTIFICATION_TYPES, type ChatNotificationType, type NotificationParams, type NotificationType } from './types';

export type ChatLocale = 'bn' | 'en';
type LocalizedText = { title: string; body: string };

type TemplateRegistry<T extends string> = Record<T, Record<ChatLocale, LocalizedText>>;

/** Chat-only mirror kept for the embedded preview and its original contract. */
export const CHAT_NOTIFICATION_TEMPLATES: TemplateRegistry<ChatNotificationType> = {
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

/** Full mobile mirror of the backend registry. No message text or delivery code is stored. */
export const NOTIFICATION_TEMPLATES: TemplateRegistry<NotificationType> = {
  ...CHAT_NOTIFICATION_TEMPLATES,
  order_placed: {
    bn: { title: 'নতুন অর্ডার', body: 'আপনার পণ্যের জন্য একটি নতুন অর্ডার এসেছে।' },
    en: { title: 'New order', body: 'A new order was placed for your product.' },
  },
  order_accepted: {
    bn: { title: 'অর্ডার গৃহীত', body: 'আপনার অর্ডার কৃষক গ্রহণ করেছেন।' },
    en: { title: 'Order accepted', body: 'The farmer accepted your order.' },
  },
  order_rejected: {
    bn: { title: 'অর্ডার প্রত্যাখ্যাত', body: 'আপনার অর্ডার কৃষক প্রত্যাখ্যান করেছেন।' },
    en: { title: 'Order rejected', body: 'The farmer rejected your order.' },
  },
  order_cancelled: {
    bn: { title: 'অর্ডার বাতিল', body: 'অর্ডারটি বাতিল করা হয়েছে।' },
    en: { title: 'Order cancelled', body: 'The order was cancelled.' },
  },
  job_accepted: {
    bn: { title: 'ডেলিভারি নিশ্চিত', body: 'আপনার অর্ডারের ডেলিভারি নিশ্চিত হয়েছে।' },
    en: { title: 'Delivery confirmed', body: 'A transporter accepted your delivery job.' },
  },
  order_collected: {
    bn: { title: 'পণ্য সংগৃহীত', body: 'আপনার ডেলিভারি কোড প্রস্তুত।' },
    en: { title: 'Order collected', body: 'Your delivery code is ready.' },
  },
  order_shipped: {
    bn: { title: 'পণ্য পাঠানো হয়েছে', body: 'আপনার অর্ডার পাঠানো হয়েছে।' },
    en: { title: 'Order shipped', body: 'Your order is on the way.' },
  },
  order_delivered: {
    bn: { title: 'অর্ডার ডেলিভারি সম্পন্ন', body: 'আপনার অর্ডার ডেলিভারি সম্পন্ন হয়েছে।' },
    en: { title: 'Order delivered', body: 'Your order has been delivered.' },
  },
  emergency_listing_created: {
    bn: { title: 'জরুরি ছাড়', body: 'একটি পণ্যে সীমিত সময়ের জরুরি ছাড় যোগ হয়েছে।' },
    en: { title: 'Emergency deal', body: 'A limited-time emergency discount was added to a product.' },
  },
  emergency_listing_cancelled: {
    bn: { title: 'জরুরি ছাড় বন্ধ', body: 'একটি পণ্যের জরুরি ছাড় বন্ধ করা হয়েছে।' },
    en: { title: 'Emergency deal ended', body: 'An emergency discount was cancelled.' },
  },
};

function replaceParams(value: string, params: NotificationParams): string {
  return value
    .replaceAll('{{senderName}}', params.senderName ?? '')
    .replaceAll('{{orderId}}', params.orderId ?? '');
}

export function renderNotification(
  locale: ChatLocale,
  type: NotificationType,
  params: NotificationParams = {},
): LocalizedText {
  const template = NOTIFICATION_TEMPLATES[type][locale];
  return { title: replaceParams(template.title, params), body: replaceParams(template.body, params) };
}

export function renderChatNotification(
  locale: ChatLocale,
  type: ChatNotificationType,
  senderName: string,
): LocalizedText {
  return renderNotification(locale, type, { senderName });
}

/** Keeps the mobile mirror honest if the backend registry grows without this file. */
export function missingNotificationTypes(types: readonly string[]): string[] {
  return types.filter((type) => !(NOTIFICATION_TYPES as readonly string[]).includes(type));
}

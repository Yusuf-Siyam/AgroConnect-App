import type { Role } from '../../types/user';

export type PushData = Record<string, unknown>;
export type PushPlatform = 'ios' | 'android' | 'web';

const CHAT_URL_PATTERN = /^\/chat\/[A-Za-z0-9_-]{1,180}$/;
const BUYER_ORDER_URL_PATTERN = /^\/buyer\/orders\/[A-Za-z0-9_-]{1,180}$/;
const FARMER_ORDER_URL_PATTERN = /^\/farmer\/orders\/[A-Za-z0-9_-]{1,180}$/;
const BUYER_GROUP_URL_PATTERN = /^\/buyer\/groups\/[A-Za-z0-9_-]{1,180}$/;
const BUYER_PRODUCT_URL_PATTERN = /^\/buyer\/product\/[A-Za-z0-9_-]{1,180}$/;

function isAllowedUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (CHAT_URL_PATTERN.test(value) ||
      BUYER_ORDER_URL_PATTERN.test(value) ||
      FARMER_ORDER_URL_PATTERN.test(value))
  );
}

/**
 * Only validated in-app deep links are followed. A tampered push payload can
 * never route outside the authenticated chat/order screens.
 */
export function chatUrlFromData(data: PushData | null | undefined): string | null {
  const url = data?.url;
  return typeof url === 'string' && CHAT_URL_PATTERN.test(url) ? url : null;
}

export function notificationUrlFromData(data: PushData | null | undefined): string | null {
  const url = data?.url;
  return isAllowedUrl(url) ? url : null;
}

export function notificationIdFromData(data: PushData | null | undefined): string | null {
  const id = data?.notificationId;
  if (typeof id !== 'string' || !id.trim() || id.length > 180) return null;
  return id.trim();
}

/** Native device tokens only; the Expo token is never uploaded to the backend. */
export function deviceTokenPayload(
  token: string | undefined,
  platform: PushPlatform,
): { token: string; platform: PushPlatform } | null {
  const trimmed = token?.trim();
  return trimmed ? { token: trimmed, platform } : null;
}

/**
 * Role-aware destination for an in-app notification. Buyer order links are
 * never opened by a farmer (and vice versa), and admins may only open support
 * chat threads. An unsafe or wrong-role target yields null instead of a guessed route.
 */
export function notificationHref(role: Role, url: string | null | undefined): string | null {
  if (!isAllowedUrl(url)) return null;

  if (CHAT_URL_PATTERN.test(url)) {
    if (role === 'admin') return url.startsWith('/chat/support_') ? url : null;
    return url;
  }
  if (role === 'buyer' && BUYER_ORDER_URL_PATTERN.test(url)) return url;
  if (role === 'buyer' && (BUYER_GROUP_URL_PATTERN.test(url) || BUYER_PRODUCT_URL_PATTERN.test(url))) return url;
  if (role === 'farmer' && FARMER_ORDER_URL_PATTERN.test(url)) return url;
  return null;
}

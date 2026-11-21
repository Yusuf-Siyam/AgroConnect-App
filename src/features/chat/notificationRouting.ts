export type PushData = Record<string, unknown>;
export type PushPlatform = 'ios' | 'android' | 'web';

const CHAT_URL_PATTERN = /^\/chat\/[A-Za-z0-9_-]{1,180}$/;

/**
 * Only validated in-app chat deep links are followed. A tampered push payload
 * can never route outside the authenticated chat stack.
 */
export function chatUrlFromData(data: PushData | null | undefined): string | null {
  const url = data?.url;
  return typeof url === 'string' && CHAT_URL_PATTERN.test(url) ? url : null;
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

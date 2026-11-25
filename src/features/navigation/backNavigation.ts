import type { Href } from 'expo-router';

import { homePathForRole, type Role } from '../../types/user';

export type BackRole = Role | null | undefined;

export type BackAction =
  | { kind: 'back' }
  | { kind: 'replace'; href: Href }
  | { kind: 'none' };

export type BackDecisionInput = {
  pathname?: string | null;
  canGoBack: boolean;
  role?: BackRole;
  fallbackHref?: Href | null;
};

const NO_BACK_PATHS = new Set(['/', '/login']);
/** Top-level tabs keep real history but never invent a parent when none exists. */
const NO_FALLBACK_PATHS = new Set([
  '/farmer',
  '/buyer',
  '/transporter',
  '/admin',
  '/buyer/deals',
  '/buyer/groups',
  '/buyer/cart',
  '/buyer/wishlist',
  '/buyer/orders',
  '/buyer/trace',
  '/buyer/profile',
  '/farmer/products',
  '/farmer/orders',
  '/farmer/ai',
  '/farmer/more',
  '/transporter/jobs',
  '/transporter/deliveries',
  '/transporter/profile',
]);
const FARMER_MORE_PATHS = new Set([
  '/farmer/analytics',
  '/farmer/emergency',
  '/farmer/market',
  '/farmer/weather',
]);

export function normalizeBackPath(pathname?: string | null): string {
  if (!pathname) return '';
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? '';
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function hrefPath(href: Href): string {
  return normalizeBackPath(typeof href === 'string' ? href : href.pathname);
}

function roleHomeOrNull(role: BackRole): Href | null {
  if (!role) return null;
  const home = homePathForRole(role);
  return home === ('/login' as Href) ? null : home;
}

function replaceIfDifferent(path: string, href: Href | null): Href | null {
  if (!href) return null;
  return hrefPath(href) === path ? null : href;
}

/**
 * Parent route for a screen opened without usable history (deep link, cold-start
 * notification, direct web URL). It never points back at the current route, so a
 * fallback cannot create a navigation loop.
 */
export function fallbackHrefForPath(pathname: string | null | undefined, role: BackRole): Href | null {
  const path = normalizeBackPath(pathname);
  if (!path || NO_BACK_PATHS.has(path) || NO_FALLBACK_PATHS.has(path)) return null;

  if (path === '/register' || path === '/otp' || path === '/forgot-password') {
    return '/login' as Href;
  }

  if (path.startsWith('/chat/')) return '/chat' as Href;
  if (path === '/chat' || path === '/profile') return roleHomeOrNull(role);

  if (path.startsWith('/buyer/checkout')) return '/buyer/cart' as Href;
  if (path.startsWith('/buyer/product/')) return '/buyer' as Href;
  if (path.startsWith('/buyer/farmer/')) return '/buyer' as Href;
  if (path.startsWith('/buyer/orders/')) return '/buyer/orders' as Href;
  if (path.startsWith('/buyer/groups/')) return '/buyer/groups' as Href;
  if (path.startsWith('/buyer/')) return '/buyer' as Href;

  if (path.startsWith('/farmer/products/')) return '/farmer/products' as Href;
  if (path.startsWith('/farmer/orders/')) return '/farmer/orders' as Href;
  if (path.startsWith('/farmer/batches/')) return '/farmer/batches' as Href;
  if (path.startsWith('/farmer/harvest/')) return '/farmer/harvest' as Href;
  if (path.startsWith('/farmer/inventory/')) return '/farmer/inventory' as Href;
  if (path.startsWith('/farmer/groups/')) return '/farmer/groups' as Href;
  if (FARMER_MORE_PATHS.has(path)) return '/farmer/more' as Href;
  if (path.startsWith('/farmer/')) return '/farmer' as Href;

  if (path.startsWith('/transporter/deliveries/')) return '/transporter/deliveries' as Href;
  if (path.startsWith('/transporter/')) return '/transporter' as Href;
  if (path.startsWith('/admin/')) return '/admin' as Href;

  return roleHomeOrNull(role);
}

/** Prefer real history; otherwise replace the current screen with its parent. */
export function resolveBackAction(input: BackDecisionInput): BackAction {
  const path = normalizeBackPath(input.pathname);
  if (!path || NO_BACK_PATHS.has(path)) return { kind: 'none' };
  if (input.canGoBack) return { kind: 'back' };

  const fallback =
    replaceIfDifferent(path, input.fallbackHref ?? null) ??
    (NO_FALLBACK_PATHS.has(path) ? null : replaceIfDifferent(path, fallbackHrefForPath(path, input.role)));

  return fallback ? { kind: 'replace', href: fallback } : { kind: 'none' };
}

/** Hardware back is consumed only when this app has somewhere meaningful to go. */
export function shouldHandleHardwareBack(action: BackAction): boolean {
  return action.kind !== 'none';
}

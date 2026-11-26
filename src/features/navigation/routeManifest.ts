import type { Role } from '../../types/user';

/** Canonical app paths. Dynamic segments use the router file name without brackets. */
export const ROLE_ROUTE_MANIFEST: Record<Role, readonly string[]> = {
  farmer: [
    '/farmer',
    '/farmer/analytics',
    '/farmer/batches',
    '/farmer/batches/[id]',
    '/farmer/batches/new',
    '/farmer/emergency',
    '/farmer/groups',
    '/farmer/groups/[id]',
    '/farmer/harvest',
    '/farmer/harvest/[id]',
    '/farmer/harvest/new',
    '/farmer/inventory',
    '/farmer/inventory/[id]',
    '/farmer/market',
    '/farmer/more',
    '/farmer/orders',
    '/farmer/orders/[id]',
    '/farmer/products',
    '/farmer/products/[id]',
    '/farmer/products/new',
    '/farmer/weather',
    '/farmer/ai',
  ],
  buyer: [
    '/buyer',
    '/buyer/cart',
    '/buyer/checkout',
    '/buyer/deals',
    '/buyer/farmer',
    '/buyer/farmer/[farmerId]',
    '/buyer/groups',
    '/buyer/groups/[id]',
    '/buyer/orders',
    '/buyer/orders/[id]',
    '/buyer/product',
    '/buyer/product/[id]',
    '/buyer/profile',
    '/buyer/trace',
    '/buyer/wishlist',
  ],
  transporter: [
    '/transporter',
    '/transporter/deliveries',
    '/transporter/deliveries/[id]',
    '/transporter/jobs',
    '/transporter/profile',
  ],
  admin: ['/admin'],
};

/** Every destination shown in the farmer More tools hub. */
export const FARMER_MORE_HREFS = [
  '/farmer/inventory',
  '/farmer/analytics',
  '/farmer/weather',
  '/farmer/market',
  '/farmer/harvest',
  '/farmer/batches',
  '/farmer/emergency',
  '/farmer/groups',
  '/farmer/ai',
  '/profile',
] as const;

export function normalizeRoutePath(pathname?: string | null): string {
  if (!pathname) return '';
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? '';
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function matchesRoute(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;

  return patternParts.every((part, index) =>
    part.startsWith('[') && part.endsWith(']') ? pathParts[index]!.length > 0 : part === pathParts[index],
  );
}

export function isKnownRolePath(role: Role, pathname?: string | null): boolean {
  const path = normalizeRoutePath(pathname);
  if (!path) return false;
  return ROLE_ROUTE_MANIFEST[role].some((pattern) => matchesRoute(pattern, path));
}

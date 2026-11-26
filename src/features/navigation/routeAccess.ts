import { homePathForRole, type Role } from '../../types/user';

import { isKnownRolePath, normalizeRoutePath } from './routeManifest';

export type RouteAuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type RouteAccessInput = {
  status: RouteAuthStatus;
  expectedRole: Role;
  pathname?: string | null;
  role?: Role | null;
  profileError?: boolean;
  profileLoading?: boolean;
  isSuspended?: boolean;
};

export type RouteAccessDecision =
  | { kind: 'loading' }
  | { kind: 'allow' }
  | { kind: 'redirectLogin'; returnTo: string }
  | { kind: 'redirectHome'; href: string }
  | { kind: 'profileError' }
  | { kind: 'suspended' }
  | { kind: 'notFound' };

/**
 * Single source of truth for role-area navigation. It is pure so every branch
 * can be verified without mounting Expo Router or Firebase.
 */
export function resolveRouteAccess(input: RouteAccessInput): RouteAccessDecision {
  const path = normalizeRoutePath(input.pathname);
  const returnTo = path && path !== '/' && !path.startsWith('/login') && !path.startsWith('/register')
    ? path
    : '/';

  if (input.status === 'loading' || input.profileLoading) return { kind: 'loading' };
  if (input.status === 'unauthenticated') return { kind: 'redirectLogin', returnTo };
  if (input.profileError) return { kind: 'profileError' };
  if (input.isSuspended) return { kind: 'suspended' };
  if (!input.role) return { kind: 'loading' };
  if (input.role !== input.expectedRole) {
    return { kind: 'redirectHome', href: homePathForRole(input.role) as string };
  }
  if (!isKnownRolePath(input.expectedRole, path)) return { kind: 'notFound' };
  return { kind: 'allow' };
}

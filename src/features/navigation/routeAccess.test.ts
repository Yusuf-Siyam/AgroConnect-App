import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveRouteAccess } from './routeAccess';

const FARMER_PATHS = [
  '/farmer/analytics',
  '/farmer/weather',
  '/farmer/market',
  '/farmer/harvest',
  '/farmer/batches',
  '/farmer/emergency',
  '/farmer/groups',
];

describe('resolveRouteAccess', () => {
  it('does not redirect while Firebase auth is loading', () => {
    assert.deepEqual(
      resolveRouteAccess({ status: 'loading', expectedRole: 'farmer', pathname: '/farmer/groups' }),
      { kind: 'loading' },
    );
  });

  it('does not redirect while the profile is loading', () => {
    assert.deepEqual(
      resolveRouteAccess({
        status: 'authenticated',
        expectedRole: 'farmer',
        pathname: '/farmer/groups',
        profileLoading: true,
      }),
      { kind: 'loading' },
    );
  });

  it('sends a signed-out visitor to login with the intended path', () => {
    assert.deepEqual(
      resolveRouteAccess({
        status: 'unauthenticated',
        expectedRole: 'farmer',
        pathname: '/farmer/groups?tab=active',
      }),
      { kind: 'redirectLogin', returnTo: '/farmer/groups' },
    );
  });

  it('shows the profile error state when the signed-in profile request failed', () => {
    assert.deepEqual(
      resolveRouteAccess({
        status: 'authenticated',
        expectedRole: 'farmer',
        pathname: '/farmer/analytics',
        profileError: true,
      }),
      { kind: 'profileError' },
    );
  });

  for (const pathname of FARMER_PATHS) {
    it(`allows a farmer to open ${pathname}`, () => {
      assert.deepEqual(
        resolveRouteAccess({
          status: 'authenticated',
          expectedRole: 'farmer',
          pathname,
          role: 'farmer',
        }),
        { kind: 'allow' },
      );
    });
  }

  it('redirects a buyer in the farmer area to the buyer home', () => {
    assert.deepEqual(
      resolveRouteAccess({
        status: 'authenticated',
        expectedRole: 'farmer',
        pathname: '/farmer/groups',
        role: 'buyer',
      }),
      { kind: 'redirectHome', href: '/buyer' },
    );
  });

  it('reports an unknown farmer path as not found', () => {
    assert.deepEqual(
      resolveRouteAccess({
        status: 'authenticated',
        expectedRole: 'farmer',
        pathname: '/farmer/does-not-exist',
        role: 'farmer',
      }),
      { kind: 'notFound' },
    );
  });

  it('blocks a suspended account before checking the role path', () => {
    assert.deepEqual(
      resolveRouteAccess({
        status: 'authenticated',
        expectedRole: 'farmer',
        pathname: '/farmer/market',
        role: 'farmer',
        isSuspended: true,
      }),
      { kind: 'suspended' },
    );
  });
});

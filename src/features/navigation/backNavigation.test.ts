import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fallbackHrefForPath,
  normalizeBackPath,
  resolveBackAction,
  shouldHandleHardwareBack,
} from './backNavigation';

describe('back navigation paths', () => {
  it('normalizes query strings and trailing slashes', () => {
    assert.equal(normalizeBackPath('/buyer/orders/abc?tab=delivery'), '/buyer/orders/abc');
    assert.equal(normalizeBackPath('/buyer/'), '/buyer');
    assert.equal(normalizeBackPath('/'), '/');
    assert.equal(normalizeBackPath(null), '');
  });
});

describe('tab and nested back decisions', () => {
  it('pops real tab history but never invents a tab parent', () => {
    assert.deepEqual(resolveBackAction({ pathname: '/buyer/orders', canGoBack: true }), {
      kind: 'back',
    });
    assert.deepEqual(resolveBackAction({ pathname: '/buyer/orders', canGoBack: false }), {
      kind: 'none',
    });
    assert.deepEqual(resolveBackAction({ pathname: '/farmer/products', canGoBack: false }), {
      kind: 'none',
    });
  });

  it('returns deep-linked nested details to their list screen', () => {
    assert.deepEqual(
      resolveBackAction({ pathname: '/buyer/groups/g1', canGoBack: false, role: 'buyer' }),
      { kind: 'replace', href: '/buyer/groups' },
    );
    assert.deepEqual(
      resolveBackAction({ pathname: '/farmer/orders/o1', canGoBack: false, role: 'farmer' }),
      { kind: 'replace', href: '/farmer/orders' },
    );
  });
});

describe('detail and form back decisions', () => {
  it('prefers the previous screen for details and forms', () => {
    assert.deepEqual(
      resolveBackAction({ pathname: '/buyer/orders/o1', canGoBack: true, role: 'buyer' }),
      { kind: 'back' },
    );
    assert.deepEqual(
      resolveBackAction({ pathname: '/transporter/deliveries/d1', canGoBack: true }),
      { kind: 'back' },
    );
    assert.deepEqual(
      resolveBackAction({ pathname: '/farmer/products/new', canGoBack: true }),
      { kind: 'back' },
    );
  });

  it('uses a history-aware fallback for form cancellation without history', () => {
    assert.deepEqual(
      resolveBackAction({
        pathname: '/farmer/batches/new',
        canGoBack: false,
        fallbackHref: '/farmer/batches',
      }),
      { kind: 'replace', href: '/farmer/batches' },
    );
    assert.deepEqual(
      resolveBackAction({ pathname: '/buyer/checkout', canGoBack: false, role: 'buyer' }),
      { kind: 'replace', href: '/buyer/cart' },
    );
  });
});

describe('custom back button decisions', () => {
  it('honors an explicit parent while preserving real history', () => {
    assert.deepEqual(
      resolveBackAction({
        pathname: '/farmer/analytics',
        canGoBack: false,
        fallbackHref: '/farmer/more',
      }),
      { kind: 'replace', href: '/farmer/more' },
    );
    assert.deepEqual(
      resolveBackAction({
        pathname: '/farmer/analytics',
        canGoBack: true,
        fallbackHref: '/farmer/more',
      }),
      { kind: 'back' },
    );
  });
});

describe('no-history fallback', () => {
  it('uses role-aware parents for shared screens', () => {
    assert.deepEqual(fallbackHrefForPath('/chat/support_user-1', 'buyer'), '/chat');
    assert.deepEqual(fallbackHrefForPath('/chat', 'farmer'), '/farmer');
    assert.deepEqual(fallbackHrefForPath('/profile', 'transporter'), '/transporter');
    assert.deepEqual(fallbackHrefForPath('/forgot-password', null), '/login');
  });

  it('never points back at the current route or a terminal route', () => {
    assert.equal(fallbackHrefForPath('/', 'buyer'), null);
    assert.equal(fallbackHrefForPath('/login', 'buyer'), null);
    assert.equal(fallbackHrefForPath('/buyer', 'buyer'), null);
    assert.deepEqual(
      resolveBackAction({
        pathname: '/buyer/cart',
        canGoBack: false,
        fallbackHref: '/buyer/cart',
      }),
      { kind: 'none' },
    );
  });
});

describe('Android hardware back', () => {
  it('is consumed only when the app has a meaningful destination', () => {
    const detail = resolveBackAction({ pathname: '/chat/support_user-1', canGoBack: false });
    assert.equal(shouldHandleHardwareBack(detail), true);

    const tabRoot = resolveBackAction({ pathname: '/buyer', canGoBack: false });
    assert.equal(shouldHandleHardwareBack(tabRoot), false);

    const login = resolveBackAction({ pathname: '/login', canGoBack: false });
    assert.equal(shouldHandleHardwareBack(login), false);
  });
});

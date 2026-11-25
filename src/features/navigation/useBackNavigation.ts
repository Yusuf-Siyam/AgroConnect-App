import { useCanGoBack, usePathname, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

import { useAuth } from '@/providers/AuthProvider';

import {
  resolveBackAction,
  shouldHandleHardwareBack,
  type BackAction,
  type BackRole,
} from './backNavigation';

type Options = {
  fallbackHref?: Href | null;
  role?: BackRole;
};

/** Shared imperative back behavior for buttons, form actions and hardware keys. */
export function useBackNavigation(options: Options = {}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const pathname = usePathname();
  const { profile } = useAuth();
  const role = options.role ?? profile?.role;

  const getAction = useCallback(
    (currentCanGoBack = canGoBack): BackAction =>
      resolveBackAction({
        pathname,
        canGoBack: currentCanGoBack,
        role,
        fallbackHref: options.fallbackHref,
      }),
    [canGoBack, pathname, role, options.fallbackHref],
  );

  const action = getAction(canGoBack);

  const perform = useCallback(
    (resolved: BackAction) => {
      if (resolved.kind === 'back') router.back();
      else if (resolved.kind === 'replace') router.replace(resolved.href as Href);
    },
    [router],
  );

  const goBack = useCallback(() => {
    perform(getAction(router.canGoBack()));
  }, [getAction, perform, router]);

  /** Returns true when the app consumed the hardware event instead of exiting. */
  const handleHardwareBack = useCallback(() => {
    const resolved = getAction(router.canGoBack());
    if (!shouldHandleHardwareBack(resolved)) return false;
    perform(resolved);
    return true;
  }, [getAction, perform, router]);

  return { action, getAction, goBack, handleHardwareBack };
}

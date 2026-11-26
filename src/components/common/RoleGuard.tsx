import { usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { resolveRouteAccess } from '@/features/navigation/routeAccess';
import { consumeReturnPath, rememberReturnPath } from '@/features/navigation/returnPath';
import { useAuth } from '@/providers/AuthProvider';
import { homePathForRole, type Role } from '@/types/user';

import { RouteAccessScreen } from './RouteAccessScreen';
import { SplashScreen } from './SplashScreen';

export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const {
    profile,
    role: profileRole,
    status,
    isSuspended,
    profileError,
    profileLoading,
    refreshProfile,
    logout,
  } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  // An explicit Sign out must not preserve the guarded page as a return path.
  const skipReturnCapture = useRef(false);

  const decision = resolveRouteAccess({
    status,
    expectedRole: role,
    pathname,
    role: profileRole,
    profileError,
    profileLoading,
    isSuspended,
  });

  const returnTo = decision.kind === 'redirectLogin' ? decision.returnTo : null;
  const redirectHref = decision.kind === 'redirectHome' ? decision.href : null;

  useEffect(() => {
    if (decision.kind === 'redirectLogin') {
      if (skipReturnCapture.current) {
        consumeReturnPath();
      } else if (returnTo) {
        rememberReturnPath(returnTo);
      }
      skipReturnCapture.current = false;
      router.replace('/login' as Href);
      return;
    }
    if (decision.kind === 'redirectHome' && redirectHref) {
      router.replace(redirectHref as Href);
    }
  }, [decision.kind, returnTo, redirectHref, router]);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await refreshProfile();
    } catch {
      // The guard stays on the error screen until a retry succeeds.
    } finally {
      setRetrying(false);
    }
  }, [refreshProfile]);

  const signOut = useCallback(() => {
    skipReturnCapture.current = true;
    void logout();
  }, [logout]);

  const goHome = useCallback(() => {
    router.replace(homePathForRole(profile?.role ?? role) as Href);
  }, [profile?.role, role, router]);

  if (
    decision.kind === 'loading' ||
    decision.kind === 'redirectLogin' ||
    decision.kind === 'redirectHome'
  ) {
    return <SplashScreen />;
  }
  if (decision.kind === 'profileError') {
    return (
      <RouteAccessScreen
        kind="profileError"
        onRetry={() => void retry()}
        onSignOut={signOut}
        retrying={retrying}
      />
    );
  }
  if (decision.kind === 'suspended') {
    return <RouteAccessScreen kind="suspended" onSignOut={signOut} />;
  }
  if (decision.kind === 'notFound') {
    return <RouteAccessScreen kind="notFound" onHome={goHome} />;
  }

  return children;
}

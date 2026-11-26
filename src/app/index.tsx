import { Redirect } from 'expo-router';
import { useCallback, useState } from 'react';

import { RouteAccessScreen } from '@/components/common/RouteAccessScreen';
import { SplashScreen } from '@/components/common/SplashScreen';
import { consumeReturnPath } from '@/features/navigation/returnPath';
import { useAuth } from '@/providers/AuthProvider';
import { homePathForRole } from '@/types/user';

export default function Index() {
  const { status, role, profileError, profileLoading, refreshProfile, logout } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await refreshProfile();
    } catch {
      // Keep the recovery screen visible until the profile request succeeds.
    } finally {
      setRetrying(false);
    }
  }, [refreshProfile]);

  const signOut = useCallback(() => {
    consumeReturnPath();
    void logout();
  }, [logout]);

  if (status === 'loading' || profileLoading) return <SplashScreen />;
  if (profileError) {
    return (
      <RouteAccessScreen
        kind="profileError"
        onRetry={() => void retry()}
        onSignOut={signOut}
        retrying={retrying}
      />
    );
  }
  if (status === 'authenticated' && role) return <Redirect href={homePathForRole(role)} />;
  if (status === 'unauthenticated') return <Redirect href="/login" />;
  return <SplashScreen />;
}

import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useAuth } from '@/providers/AuthProvider';
import { homePathForRole, type Role } from '@/types/user';

import { SplashScreen } from './SplashScreen';

export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { status, profile } = useAuth();

  if (status === 'loading') return <SplashScreen />;
  if (status !== 'authenticated' || profile?.role !== role) {
    return <Redirect href={homePathForRole(profile?.role)} />;
  }

  return children;
}

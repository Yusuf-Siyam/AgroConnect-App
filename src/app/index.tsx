import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import { homePathForRole } from '@/types/user';

export default function Index() {
  const { status, role } = useAuth();

  if (status === 'authenticated') return <Redirect href={homePathForRole(role)} />;
  if (status === 'unauthenticated') return <Redirect href="/login" />;
  return null;
}

import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/common/RoleGuard';

export default function AdminLayout() {
  return (
    <RoleGuard role="admin">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}

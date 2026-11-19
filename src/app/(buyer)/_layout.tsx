import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/common/RoleGuard';

export default function BuyerLayout() {
  return (
    <RoleGuard role="buyer">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}

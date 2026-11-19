import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/common/RoleGuard';

export default function FarmerLayout() {
  return (
    <RoleGuard role="farmer">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}

import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/common/RoleGuard';

/** Farmer guard plus a host stack for tab and More tools routes. */
export default function FarmerLayout() {
  return (
    <RoleGuard role="farmer">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}

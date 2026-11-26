import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/common/RoleGuard';

/** Buyer guard plus a host stack for tab and detail routes. */
export default function BuyerLayout() {
  return (
    <RoleGuard role="buyer">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}

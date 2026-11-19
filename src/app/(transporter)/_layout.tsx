import { Stack } from 'expo-router';

import { RoleGuard } from '@/components/common/RoleGuard';

export default function TransporterLayout() {
  return (
    <RoleGuard role="transporter">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}

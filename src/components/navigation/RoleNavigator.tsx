import { Stack } from 'expo-router';

import { DashboardHeader } from './DashboardHeader';

/** Shared stack chrome for all four role dashboards. */
export function RoleNavigator() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        header: () => <DashboardHeader />,
        headerBackVisible: false,
      }}
    />
  );
}

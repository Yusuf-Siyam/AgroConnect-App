import { Tabs } from 'expo-router';

import { useTranslation } from '@/i18n';
import { theme } from '@/theme';

/** Transporter-only bottom navigation: Dashboard, Jobs, My Deliveries, Profile. */
export function TransporterTabs() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('transporter.tab.dashboard') }} />
      <Tabs.Screen name="jobs" options={{ title: t('transporter.tab.jobs') }} />
      <Tabs.Screen name="deliveries" options={{ title: t('transporter.tab.deliveries') }} />
      <Tabs.Screen name="profile" options={{ title: t('transporter.tab.profile') }} />
    </Tabs>
  );
}

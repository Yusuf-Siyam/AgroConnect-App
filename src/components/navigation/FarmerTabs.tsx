import { Tabs } from 'expo-router';

import { useTranslation } from '@/i18n';
import { theme } from '@/theme';

/** Farmer-only bottom navigation: Dashboard, Products, Orders, AI, More. */
export function FarmerTabs() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('farmer.tab.dashboard') }} />
      <Tabs.Screen name="products" options={{ title: t('farmer.tab.products') }} />
      <Tabs.Screen name="orders" options={{ title: t('farmer.tab.orders') }} />
      <Tabs.Screen name="ai" options={{ title: t('farmer.tab.ai') }} />
      <Tabs.Screen name="more" options={{ title: t('farmer.tab.more') }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="batches" options={{ href: null }} />
      <Tabs.Screen name="emergency" options={{ href: null }} />
      <Tabs.Screen name="groups" options={{ href: null }} />
      <Tabs.Screen name="harvest" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="market" options={{ href: null }} />
      <Tabs.Screen name="weather" options={{ href: null }} />
    </Tabs>
  );
}

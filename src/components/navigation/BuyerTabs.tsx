import { Tabs } from 'expo-router';

import { useTranslation } from '@/i18n';
import { theme } from '@/theme';

/** Buyer-only bottom navigation. */
export function BuyerTabs() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('buyer.tab.marketplace') }} />
      <Tabs.Screen name="cart" options={{ title: t('buyer.tab.cart') }} />
      <Tabs.Screen name="wishlist" options={{ title: t('buyer.tab.wishlist') }} />
      <Tabs.Screen name="orders" options={{ title: t('buyer.tab.orders') }} />
      <Tabs.Screen name="profile" options={{ title: t('buyer.tab.profile') }} />
    </Tabs>
  );
}

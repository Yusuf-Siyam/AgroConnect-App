import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { useTranslation } from '@/i18n';
import { listGroupPurchases, type GroupPurchase } from '@/features/buyer/groupService';

export default function BuyerGroupsScreen() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<GroupPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listGroupPurchases());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await listGroupPurchases();
        if (active) setItems(next);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [load]);

  return (
    <Screen>
      <AppText variant="title">{t('buyer.groups.title')}</AppText>
      <AppText className="text-sm text-gray-600 mt-1">{t('buyer.groups.subtitle')}</AppText>
      <FlatList
        className="mt-4"
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        ListEmptyComponent={!loading ? <AppText className="text-sm text-gray-500">{t('buyer.groups.empty')}</AppText> : undefined}
        renderItem={({ item }) => {
          const progress = item.targetQuantity > 0 ? Math.min(1, item.committedQuantity / item.targetQuantity) : 0;
          return (
            <Pressable onPress={() => router.push(`/buyer/groups/${item.id}` as never)} className="mb-3">
              <Card>
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-3">
                    <AppText className="font-semibold">{t('buyer.groups.cardTitle')}</AppText>
                    <AppText className="text-xs text-gray-500 mt-1">{item.status}</AppText>
                  </View>
                  <AppText className="text-gray-400">{">"}</AppText>
                </View>
                <View className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <View className="h-2 bg-primary-600" style={{ width: `${progress * 100}%` }} />
                </View>
                <AppText className="text-xs text-gray-600 mt-2">
                  {t('buyer.groups.progress', { committed: item.committedQuantity, target: item.targetQuantity, unit: item.unit })}
                </AppText>
                <AppText className="text-xs text-gray-500 mt-1">
                  {t('buyer.groups.deadline', { date: new Date(item.deadline).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB') })}
                </AppText>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

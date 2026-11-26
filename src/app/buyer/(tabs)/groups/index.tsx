import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { StateView } from '@/components/common/StateView';
import { buyerApiErrorKey } from '@/features/buyer/errorMessages';
import { listGroupPurchases, type GroupPurchase, type GroupPurchaseList } from '@/features/buyer/groupService';
import { useTranslation, type TranslationKey } from '@/i18n';

const PAGE_SIZE = 20;

export default function BuyerGroupsScreen() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<GroupPurchase[]>([]);
  const [list, setList] = useState<GroupPurchaseList | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const load = useCallback(async (nextOffset: number, options: { refresh?: boolean } = {}) => {
    const reset = options.refresh === true || nextOffset === 0;
    if (reset && options.refresh) setRefreshing(true);
    else if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const next = await listGroupPurchases({ limit: PAGE_SIZE, offset: nextOffset });
      setItems((current) => (reset ? next.items : [...current, ...next.items]));
      setList(next);
      setOffset(nextOffset + next.items.length);
      setError(null);
    } catch (loadError) {
      setError(buyerApiErrorKey((loadError as { code?: string }).code));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load(0);
    });
    return () => { active = false; };
  }, [load]);

  return (
    <Screen>
      <AppText variant="title">{t('buyer.groups.title')}</AppText>
      <AppText className="text-sm text-gray-600 mt-1">{t('buyer.groups.subtitle')}</AppText>
      {error ? (
        <StateView state="error" message={t(error)} onRetry={() => void load(0, { refresh: true })} />
      ) : null}
      {loading ? <StateView state="loading" /> : null}
      <FlatList
        className="mt-4"
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(0, { refresh: true })} />}
        ListEmptyComponent={!loading && !error ? <StateView state="empty" title={t('buyer.groups.empty')} /> : undefined}
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
      {list && items.length < list.total ? (
        <Button
          variant="outline"
          label={t('common.loadMore')}
          onPress={() => void load(offset)}
          loading={loadingMore}
          disabled={loadingMore}
        />
      ) : null}
    </Screen>
  );
}

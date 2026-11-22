import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { getPriceHistory } from '@/features/farmer/marketService';
import { useTranslation } from '@/i18n';

export default function MarketScreen() {
  const { t } = useTranslation();
  const [crop, setCrop] = useState('');
  const [district, setDistrict] = useState('');
  const [filters, setFilters] = useState({ crop: '', district: '' });

  const history = useInfiniteQuery({
    queryKey: ['farmer', 'market', filters],
    queryFn: ({ pageParam }) =>
      getPriceHistory({
        crop: filters.crop || undefined,
        district: filters.district || undefined,
        limit: 10,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
  });
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FarmerPage title={t('farmer.market.title')} subtitle={t('farmer.market.subtitle')}>
      <View className="flex-row gap-3">
        <TextField
          className="flex-1"
          label={t('farmer.market.crop')}
          value={crop}
          onChangeText={setCrop}
          placeholder={t('farmer.market.cropPlaceholder')}
        />
        <TextField
          className="flex-1"
          label={t('common.district')}
          value={district}
          onChangeText={setDistrict}
          placeholder={t('farmer.market.districtPlaceholder')}
        />
      </View>
      <Button label={t('farmer.market.searchAction')} onPress={() => setFilters({ crop: crop.trim(), district: district.trim() })} />

      {history.isPending ? <StateView state="loading" /> : null}
      {history.isError ? (
        <StateView
          state="error"
          message={t(farmerApiErrorKey((history.error as { code?: string }).code))}
          onRetry={() => void history.refetch()}
        />
      ) : null}
      {!history.isPending && !history.isError && items.length === 0 ? (
        <StateView
          state="empty"
          title={t('farmer.market.emptyTitle')}
          message={t('farmer.market.emptyMessage')}
        />
      ) : null}

      {items.map((point) => (
        <Card key={point.id} className="gap-1">
          <AppText className="font-semibold">
            {point.crop} · {point.district}
          </AppText>
          <AppText>
            {point.price} {t(`unit.${point.unit}` as 'unit.kg')}
          </AppText>
          <AppText variant="caption">
            {point.date} · {point.source}
          </AppText>
        </Card>
      ))}

      {history.hasNextPage ? (
        <Button
          label={t('common.loadMore')}
          variant="outline"
          loading={history.isFetchingNextPage}
          onPress={() => void history.fetchNextPage()}
        />
      ) : null}
    </FarmerPage>
  );
}

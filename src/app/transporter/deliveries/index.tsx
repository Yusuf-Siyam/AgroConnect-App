import { useInfiniteQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TransporterPage } from '@/components/transporter/TransporterPage';
import { listMyDeliveries } from '@/features/transporter/deliveryService';
import { transporterApiErrorKey } from '@/features/transporter/errorMessages';
import type { DeliveryJob } from '@/features/transporter/types';
import { useTranslation, type TranslationKey } from '@/i18n';

export default function TransporterDeliveriesScreen() {
  const { t } = useTranslation();

  const jobs = useInfiniteQuery({
    queryKey: ['transporter', 'deliveries', 'mine'],
    queryFn: ({ pageParam }) => listMyDeliveries({ limit: 20, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
  });

  const items = jobs.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <TransporterPage title={t('transporter.deliveries.title')} subtitle={t('transporter.deliveries.subtitle')}>
      {jobs.isPending ? <StateView state="loading" /> : null}
      {jobs.isError ? (
        <StateView
          state="error"
          message={t(transporterApiErrorKey((jobs.error as { code?: string }).code))}
          onRetry={() => void jobs.refetch()}
        />
      ) : null}
      {!jobs.isPending && !jobs.isError && items.length === 0 ? (
        <StateView
          state="empty"
          title={t('transporter.deliveries.emptyTitle')}
          message={t('transporter.deliveries.emptyMessage')}
        />
      ) : null}

      {items.map((job: DeliveryJob) => (
        <Card key={job.id} className="gap-2">
          <View className="flex-row items-center justify-between gap-2">
            <AppText className="font-semibold">#{job.id.slice(0, 8)}</AppText>
            <AppText variant="caption">
              {t(`order.status.${job.orderStatus}` as TranslationKey)}
            </AppText>
          </View>
          <AppText variant="caption">
            {t('transporter.job.pickup')}: {job.pickup.addressLine ?? job.pickup.district ?? t('common.notAvailable')}
          </AppText>
          <AppText variant="caption">
            {t('transporter.job.dropoff')}: {job.dropoff.addressLine ?? job.dropoff.district ?? t('common.notAvailable')}
          </AppText>
          <Button
            label={t('transporter.deliveries.open')}
            variant="outline"
            onPress={() =>
              router.push(`/transporter/deliveries/${job.id}` as Href)
            }
          />
        </Card>
      ))}

      {jobs.hasNextPage ? (
        <Button
          label={t('common.loadMore')}
          variant="outline"
          loading={jobs.isFetchingNextPage}
          onPress={() => void jobs.fetchNextPage()}
        />
      ) : null}
    </TransporterPage>
  );
}

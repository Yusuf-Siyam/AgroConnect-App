import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TransporterPage } from '@/components/transporter/TransporterPage';
import {
  acceptDeliveryJob,
  getTransporterProfile,
  listAvailableJobs,
  rejectDeliveryJob,
} from '@/features/transporter/deliveryService';
import { transporterApiErrorKey } from '@/features/transporter/errorMessages';
import type { DeliveryJob } from '@/features/transporter/types';
import { useTranslation } from '@/i18n';
import { formatNumber } from '@/utils/units';

export default function TransporterJobsScreen() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();

  const profile = useQuery({ queryKey: ['transporter', 'profile'], queryFn: getTransporterProfile });
  const jobs = useInfiniteQuery({
    queryKey: ['transporter', 'jobs', 'available'],
    queryFn: ({ pageParam }) => listAvailableJobs({ limit: 20, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.limit < last.total ? last.offset + last.limit : undefined,
    enabled: profile.data?.isVerified === true,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transporter', 'jobs'] }),
      queryClient.invalidateQueries({ queryKey: ['transporter', 'deliveries'] }),
      queryClient.invalidateQueries({ queryKey: ['transporter', 'dashboard'] }),
    ]);
  };

  const accept = useMutation({
    mutationFn: (jobId: string) => acceptDeliveryJob(jobId),
    onSuccess: async () => {
      await invalidate();
      router.push('/transporter/deliveries' as Href);
    },
  });
  const reject = useMutation({
    mutationFn: (jobId: string) => rejectDeliveryJob(jobId),
    onSuccess: invalidate,
  });

  const items = jobs.data?.pages.flatMap((page) => page.items) ?? [];
  const actionError = accept.error ?? reject.error;

  return (
    <TransporterPage title={t('transporter.jobs.title')} subtitle={t('transporter.jobs.subtitle')}>
      {profile.isPending || jobs.isPending ? <StateView state="loading" /> : null}
      {profile.isError ? (
        <StateView
          state="error"
          message={t(transporterApiErrorKey((profile.error as { code?: string }).code))}
          onRetry={() => void profile.refetch()}
        />
      ) : null}
      {profile.data && !profile.data.isVerified ? (
        <StateView state="empty" message={t('transporter.error.notVerified')} />
      ) : null}
      {jobs.isError ? (
        <StateView
          state="error"
          message={t(transporterApiErrorKey((jobs.error as { code?: string }).code))}
          onRetry={() => void jobs.refetch()}
        />
      ) : null}
      {!jobs.isPending && !jobs.isError && items.length === 0 ? (
        <StateView state="empty" title={t('transporter.jobs.emptyTitle')} message={t('transporter.jobs.emptyMessage')} />
      ) : null}

      {actionError ? (
        <AppText variant="error">
          {t(transporterApiErrorKey((actionError as { code?: string }).code))}
        </AppText>
      ) : null}

      {items.map((job: DeliveryJob) => (
        <Card key={job.id} className="gap-2">
          <AppText className="font-semibold">#{job.id.slice(0, 8)}</AppText>
          <AppText variant="caption">
            {t('transporter.job.pickup')}: {job.pickup.addressLine ?? job.pickup.district ?? t('common.notAvailable')}
          </AppText>
          <AppText variant="caption">
            {t('transporter.job.dropoff')}: {job.dropoff.addressLine ?? job.dropoff.district ?? t('common.notAvailable')}
          </AppText>
          <AppText variant="caption">
            {t('transporter.job.weight')}: {formatNumber(job.totalWeightKg, locale)} kg ·{' '}
            {t('transporter.job.distance')}:{' '}
            {job.distanceKm === null ? t('common.notAvailable') : `${formatNumber(job.distanceKm, locale)} km`}
          </AppText>
          <AppText>
            {t('transporter.job.fee')}: {formatNumber(job.deliveryFee, locale)} BDT
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            <View className="flex-1">
              <Button
                label={t('transporter.job.accept')}
                loading={accept.isPending && accept.variables === job.id}
                onPress={() => accept.mutate(job.id)}
              />
            </View>
            <View className="flex-1">
              <Button
                label={t('transporter.job.reject')}
                variant="outline"
                loading={reject.isPending && reject.variables === job.id}
                onPress={() => reject.mutate(job.id)}
              />
            </View>
          </View>
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

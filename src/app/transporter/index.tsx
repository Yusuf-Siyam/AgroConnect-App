import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TransporterPage } from '@/components/transporter/TransporterPage';
import { transporterApiErrorKey } from '@/features/transporter/errorMessages';
import {
  getEarningsSummary,
  getTransporterProfile,
  listAvailableJobs,
  listMyDeliveries,
} from '@/features/transporter/deliveryService';
import { useTranslation, type TranslationKey } from '@/i18n';
import { formatNumber } from '@/utils/units';

export default function TransporterDashboardScreen() {
  const { t, locale } = useTranslation();

  const profile = useQuery({ queryKey: ['transporter', 'profile'], queryFn: getTransporterProfile });
  const jobs = useQuery({
    queryKey: ['transporter', 'jobs', 'available'],
    queryFn: () => listAvailableJobs({ limit: 1, offset: 0 }),
    enabled: profile.data?.isVerified === true,
  });
  const deliveries = useQuery({
    queryKey: ['transporter', 'deliveries', 'mine'],
    queryFn: () => listMyDeliveries({ limit: 20, offset: 0 }),
    enabled: profile.data?.isVerified === true,
  });
  const earnings = useQuery({
    queryKey: ['transporter', 'earnings', 'summary'],
    queryFn: getEarningsSummary,
  });

  if (profile.isPending) {
    return (
      <TransporterPage title={t('transporter.tab.dashboard')}>
        <StateView state="loading" />
      </TransporterPage>
    );
  }

  if (profile.isError) {
    return (
      <TransporterPage title={t('transporter.tab.dashboard')}>
        <StateView
          state="error"
          message={t(transporterApiErrorKey((profile.error as { code?: string }).code))}
          onRetry={() => void profile.refetch()}
        />
      </TransporterPage>
    );
  }

  const transporter = profile.data;
  const activeDeliveries =
    deliveries.data?.items.filter((job) =>
      ['shipment_accepted', 'collected', 'shipped'].includes(job.orderStatus),
    ) ?? [];

  return (
    <TransporterPage
      title={t('transporter.dashboard.title')}
      subtitle={transporter ? t('transporter.dashboard.subtitle', { name: transporter.name }) : undefined}
    >
      <Card className="gap-2">
        <AppText variant="label">{t('transporter.profile.verificationLabel')}</AppText>
        <AppText className="font-semibold">
          {t(`transporter.verification.${transporter?.verificationStatus ?? 'pending'}` as TranslationKey)}
        </AppText>
        {!transporter?.isVerified ? (
          <AppText variant="caption">{t('transporter.profile.verificationHint')}</AppText>
        ) : null}
        <Button
          label={t('transporter.tab.profile')}
          variant="outline"
          onPress={() => router.push('/transporter/profile' as Href)}
        />
      </Card>

      <View className="flex-row flex-wrap gap-3">
        <Card className="min-w-[45%] flex-1 gap-1">
          <AppText variant="caption">{t('transporter.dashboard.availableJobs')}</AppText>
          <AppText variant="title">{jobs.data?.total ?? 0}</AppText>
        </Card>
        <Card className="min-w-[45%] flex-1 gap-1">
          <AppText variant="caption">{t('transporter.dashboard.activeDeliveries')}</AppText>
          <AppText variant="title">{activeDeliveries.length}</AppText>
        </Card>
        <Card className="min-w-[45%] flex-1 gap-1">
          <AppText variant="caption">{t('transporter.dashboard.netEarnings')}</AppText>
          <AppText variant="title">{formatNumber(earnings.data?.totalNetAmount ?? 0, locale)}</AppText>
        </Card>
      </View>

      {jobs.isError ? (
        <AppText variant="error">
          {t(transporterApiErrorKey((jobs.error as { code?: string }).code))}
        </AppText>
      ) : null}
      {deliveries.isError ? (
        <AppText variant="error">
          {t(transporterApiErrorKey((deliveries.error as { code?: string }).code))}
        </AppText>
      ) : null}

      <Button label={t('transporter.tab.jobs')} onPress={() => router.push('/transporter/jobs' as Href)} />
      <Button
        label={t('transporter.tab.deliveries')}
        variant="outline"
        onPress={() => router.push('/transporter/deliveries' as Href)}
      />
    </TransporterPage>
  );
}

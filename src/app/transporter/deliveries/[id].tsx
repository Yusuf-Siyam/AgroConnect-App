import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { StartChatButton } from '@/components/chat/StartChatButton';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { TransporterPage } from '@/components/transporter/TransporterPage';
import {
  confirmDelivery,
  confirmPickup,
  getDeliveryJob,
  startDelivery,
} from '@/features/transporter/deliveryService';
import { transporterApiErrorKey, validationKey } from '@/features/transporter/errorMessages';
import { deliveryCodeSchema } from '@/features/transporter/schemas';
import { useForegroundLocation } from '@/features/transporter/useForegroundLocation';
import { useTranslation, type TranslationKey } from '@/i18n';
import { formatNumber } from '@/utils/units';

export default function TransporterJobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const job = useQuery({
    queryKey: ['transporter', 'job', id],
    queryFn: () => getDeliveryJob(id),
    enabled: Boolean(id),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries();
  };

  const collect = useMutation({ mutationFn: () => confirmPickup(id), onSuccess: invalidate });
  const ship = useMutation({ mutationFn: () => startDelivery(id), onSuccess: invalidate });
  const deliver = useMutation({
    mutationFn: () => confirmDelivery(id, code.trim()),
    onSuccess: async () => {
      setCode('');
      setCodeError(null);
      await invalidate();
    },
  });

  const tracking = useForegroundLocation(id);
  const actionError = collect.error ?? ship.error ?? deliver.error;

  const onSubmitCode = () => {
    const parsed = deliveryCodeSchema.safeParse({ code: code.trim() });
    if (!parsed.success) {
      setCodeError(t(validationKey(parsed.error.issues[0]?.message)));
      return;
    }
    setCodeError(null);
    deliver.mutate();
  };

  if (job.isPending) {
    return (
      <TransporterPage title={t('transporter.jobDetail.title')}>
        <StateView state="loading" />
      </TransporterPage>
    );
  }
  if (job.isError || !job.data) {
    return (
      <TransporterPage title={t('transporter.jobDetail.title')}>
        <StateView
          state="error"
          message={t(transporterApiErrorKey((job.error as { code?: string }).code))}
          onRetry={() => void job.refetch()}
        />
      </TransporterPage>
    );
  }

  const data = job.data;
  const active = ['shipment_accepted', 'collected', 'shipped'].includes(data.orderStatus);

  return (
    <TransporterPage title={t('transporter.jobDetail.title')} subtitle={`#${data.id.slice(0, 8)}`}>
      <Card className="gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <AppText variant="label">{t('common.status')}</AppText>
          <AppText className="font-semibold">
            {t(`order.status.${data.orderStatus}` as TranslationKey)}
          </AppText>
        </View>
        <AppText variant="caption">
          {t('transporter.job.pickup')}: {data.pickup.addressLine ?? data.pickup.district ?? t('common.notAvailable')}
        </AppText>
        <AppText variant="caption">
          {t('transporter.job.dropoff')}: {data.dropoff.addressLine ?? data.dropoff.district ?? t('common.notAvailable')}
        </AppText>
        <AppText variant="caption">
          {t('transporter.job.phone')}: {data.dropoff.phoneNumber ?? t('common.notAvailable')}
        </AppText>
        <AppText variant="caption">
          {t('transporter.job.weight')}: {formatNumber(data.totalWeightKg, locale)} kg ·{' '}
          {t('transporter.job.distance')}:{' '}
          {data.distanceKm === null ? t('common.notAvailable') : `${formatNumber(data.distanceKm, locale)} km`}
        </AppText>
        <AppText>
          {t('transporter.job.fee')}: {formatNumber(data.deliveryFee, locale)} BDT ·{' '}
          {t('transporter.job.net')}: {formatNumber(data.netAmount, locale)} BDT
        </AppText>
      </Card>

      {data.transporterId ? (
        <StartChatButton
          input={{ type: 'buyer_transporter', orderId: data.orderId }}
          labelKey="chat.startBuyer"
        />
      ) : null}

      {data.orderStatus === 'shipment_accepted' ? (
        <Card className="gap-3">
          <AppText variant="label">{t('transporter.jobDetail.collectTitle')}</AppText>
          <AppText variant="caption">{t('transporter.jobDetail.collectHint')}</AppText>
          <Button
            label={t('transporter.jobDetail.collectAction')}
            loading={collect.isPending}
            onPress={() => collect.mutate()}
          />
        </Card>
      ) : null}

      {data.orderStatus === 'collected' ? (
        <Card className="gap-3">
          <AppText variant="label">{t('transporter.jobDetail.codeTitle')}</AppText>
          <AppText className="text-xl font-semibold">{data.deliveryCode ?? '------'}</AppText>
          <AppText variant="caption">{t('transporter.jobDetail.codeHint')}</AppText>
          <Button
            label={t('transporter.jobDetail.shipAction')}
            loading={ship.isPending}
            onPress={() => ship.mutate()}
          />
        </Card>
      ) : null}

      {data.orderStatus === 'shipped' ? (
        <Card className="gap-3">
          <AppText variant="label">{t('transporter.jobDetail.deliverTitle')}</AppText>
          <AppText variant="caption">{t('transporter.jobDetail.deliverHint')}</AppText>
          <TextField
            label={t('transporter.jobDetail.codeLabel')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            error={codeError ?? undefined}
            placeholder={t('transporter.jobDetail.codePlaceholder')}
          />
          <Button
            label={t('transporter.jobDetail.deliverAction')}
            loading={deliver.isPending}
            onPress={onSubmitCode}
          />
        </Card>
      ) : null}

      {actionError ? (
        <AppText variant="error">
          {t(transporterApiErrorKey((actionError as { code?: string }).code))}
        </AppText>
      ) : null}

      {active ? (
        <Card className="gap-3">
          <AppText variant="label">{t('transporter.jobDetail.locationTitle')}</AppText>
          <AppText variant="caption">
            {t('transporter.jobDetail.locationHint', { seconds: tracking.durationSeconds })}
          </AppText>
          {tracking.lastLocation ? (
            <AppText variant="caption">
              {t('transporter.jobDetail.locationUpdated')}:{' '}
              {new Date(tracking.lastLocation.recordedAt).toLocaleTimeString()}
            </AppText>
          ) : null}
          {tracking.state === 'denied' ? (
            <AppText variant="error">{t('transporter.error.locationDenied')}</AppText>
          ) : null}
          {tracking.state === 'error' ? (
            <AppText variant="error">{t('transporter.error.locationFailed')}</AppText>
          ) : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                label={t('transporter.jobDetail.shareLocation', { seconds: tracking.durationSeconds })}
                variant="outline"
                loading={tracking.isTracking}
                disabled={tracking.isTracking}
                onPress={() => void tracking.start()}
              />
            </View>
            {tracking.isTracking ? (
              <View className="flex-1">
                <Button label={t('common.cancel')} variant="danger" onPress={tracking.stop} />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {data.orderStatus === 'delivered' ? (
        <AppText className="text-success">{t('transporter.jobDetail.completed')}</AppText>
      ) : null}
    </TransporterPage>
  );
}

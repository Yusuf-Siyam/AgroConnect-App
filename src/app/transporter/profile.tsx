import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { StateView } from '@/components/common/StateView';
import { TextField } from '@/components/common/TextField';
import { TransporterPage } from '@/components/transporter/TransporterPage';
import {
  createTransporterProfile,
  getTransporterProfile,
  listEarnings,
  updateTransporterProfile,
} from '@/features/transporter/deliveryService';
import { transporterApiErrorKey, validationKey } from '@/features/transporter/errorMessages';
import {
  toTransporterProfileFormValues,
  toTransporterProfilePayload,
  transporterProfileFormSchema,
  type TransporterProfileFormValues,
} from '@/features/transporter/schemas';
import { useAuth } from '@/providers/AuthProvider';
import { useTranslation, type TranslationKey } from '@/i18n';
import { formatNumber } from '@/utils/units';

export default function TransporterProfileScreen() {
  const { t, locale } = useTranslation();
  const { profile: authProfile } = useAuth();
  const queryClient = useQueryClient();

  const profile = useQuery({ queryKey: ['transporter', 'profile'], queryFn: getTransporterProfile });
  const earnings = useQuery({
    queryKey: ['transporter', 'earnings', 'history'],
    queryFn: () => listEarnings({ limit: 20, offset: 0 }),
  });

  const defaults: TransporterProfileFormValues = {
    name: authProfile?.displayName ?? '',
    phone: authProfile?.phoneNumber ?? '',
    district: authProfile?.district ?? '',
    vehicleType: authProfile?.vehicle?.type ?? '',
    plateNumber: authProfile?.vehicle?.registrationNumber ?? '',
    capacityKg: '',
  };

  const { control, handleSubmit, formState } = useForm<TransporterProfileFormValues>({
    resolver: zodResolver(transporterProfileFormSchema),
    values: profile.data ? toTransporterProfileFormValues(profile.data) : defaults,
  });

  const save = useMutation({
    mutationFn: (values: TransporterProfileFormValues) => {
      const payload = toTransporterProfilePayload(values);
      return profile.data ? updateTransporterProfile(payload) : createTransporterProfile(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transporter', 'profile'] });
    },
  });

  const onSubmit = handleSubmit((values) => save.mutate(values));

  const fields: {
    name: keyof TransporterProfileFormValues;
    labelKey: TranslationKey;
    props?: { keyboardType?: 'phone-pad' | 'numeric' };
  }[] = [
    { name: 'name', labelKey: 'transporter.form.name' },
    { name: 'phone', labelKey: 'transporter.form.phone', props: { keyboardType: 'phone-pad' } },
    { name: 'district', labelKey: 'transporter.form.district' },
    { name: 'vehicleType', labelKey: 'transporter.form.vehicleType' },
    { name: 'plateNumber', labelKey: 'transporter.form.plateNumber' },
    { name: 'capacityKg', labelKey: 'transporter.form.capacityKg', props: { keyboardType: 'numeric' } },
  ];

  return (
    <TransporterPage title={t('transporter.profile.title')} subtitle={t('transporter.profile.subtitle')}>
      {profile.isPending ? <StateView state="loading" /> : null}
      {profile.isError ? (
        <StateView
          state="error"
          message={t(transporterApiErrorKey((profile.error as { code?: string }).code))}
          onRetry={() => void profile.refetch()}
        />
      ) : null}

      {!profile.isPending && !profile.isError ? (
        <Card className="gap-4">
          <AppText variant="label">{t('transporter.profile.vehicleTitle')}</AppText>
          <AppText variant="caption">
            {t('transporter.profile.verificationLabel')}:{' '}
            {t(
              `transporter.verification.${profile.data?.verificationStatus ?? 'pending'}` as TranslationKey,
            )}
          </AppText>
          {fields.map((field) => (
            <Controller
              key={field.name}
              control={control}
              name={field.name}
              render={({ field: input, fieldState }) => (
                <TextField
                  label={t(field.labelKey)}
                  value={input.value}
                  onChangeText={input.onChange}
                  onBlur={input.onBlur}
                  keyboardType={field.props?.keyboardType}
                  error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
                />
              )}
            />
          ))}
          {save.isError ? (
            <AppText variant="error">
              {t(transporterApiErrorKey((save.error as { code?: string }).code))}
            </AppText>
          ) : null}
          {save.isSuccess ? <AppText className="text-success">{t('transporter.profile.saved')}</AppText> : null}
          <Button
            label={t('transporter.profile.save')}
            loading={save.isPending || formState.isSubmitting}
            onPress={onSubmit}
          />
        </Card>
      ) : null}

      <Card className="gap-3">
        <AppText variant="label">{t('transporter.earnings.title')}</AppText>
        {earnings.isPending ? <StateView state="loading" /> : null}
        {earnings.isError ? (
          <StateView
            state="error"
            message={t(transporterApiErrorKey((earnings.error as { code?: string }).code))}
            onRetry={() => void earnings.refetch()}
          />
        ) : null}
        {earnings.data?.items.length === 0 ? (
          <AppText variant="caption">{t('transporter.earnings.empty')}</AppText>
        ) : null}
        {earnings.data?.items.map((entry) => (
          <View key={entry.id} className="gap-1 border-b border-line pb-2">
            <AppText className="font-semibold">
              {t('transporter.earnings.net')}: {formatNumber(entry.netAmount, locale)} BDT
            </AppText>
            <AppText variant="caption">
              {t('transporter.earnings.fee')}: {formatNumber(entry.deliveryFee, locale)} ·{' '}
              {t('transporter.earnings.commission')}: {formatNumber(entry.commission, locale)}
            </AppText>
            <AppText variant="caption">{new Date(entry.createdAt).toLocaleDateString()}</AppText>
          </View>
        ))}
      </Card>
    </TransporterPage>
  );
}

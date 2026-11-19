import { useMutation } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { Screen } from '@/components/common/Screen';
import { TextField } from '@/components/common/TextField';
import { validationKey } from '@/features/authentication/errorMessages';
import { profileSchema, type ProfileValues } from '@/features/authentication/schemas';
import { useTranslation } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import type { Role } from '@/types/user';

const roleKeys: Record<Role, TranslationKey> = {
  farmer: 'roles.farmer',
  buyer: 'roles.buyer',
  transporter: 'roles.transporter',
  admin: 'roles.admin',
};

export default function ProfileScreen() {
  const { t, locale } = useTranslation();
  const { profile, updateProfile, logout } = useAuth();

  const { control, handleSubmit, formState } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      displayName: profile?.displayName ?? '',
      phoneNumber: profile?.phoneNumber ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      updateProfile({
        displayName: values.displayName.trim(),
        ...(values.phoneNumber ? { phoneNumber: values.phoneNumber.trim() } : {}),
      }),
  });

  const onSubmit = handleSubmit(async (values) => {
    await mutation.mutateAsync(values);
  });

  return (
    <Screen scroll>
      <View className="gap-6 px-6 py-8">
        <View className="gap-2">
          <AppText variant="title" className="text-primary">
            {t('profile.title')}
          </AppText>
          <AppText variant="subtitle">{t('profile.subtitle')}</AppText>
        </View>

        <Card className="gap-4">
          <AppText variant="label">{t('profile.personalInfo')}</AppText>
          <Controller
            control={control}
            name="displayName"
            render={({ field, fieldState }) => (
              <TextField
                label={t('common.fullName')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
              />
            )}
          />
          <Controller
            control={control}
            name="phoneNumber"
            render={({ field, fieldState }) => (
              <TextField
                label={t('common.phoneNumber')}
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="phone-pad"
                error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
              />
            )}
          />
          {mutation.isSuccess ? <AppText className="text-success">{t('profile.updateSuccess')}</AppText> : null}
          {mutation.isError ? <AppText variant="error">{t('error.generic')}</AppText> : null}
          <Button
            label={formState.isSubmitting ? t('common.saving') : t('profile.updateAction')}
            onPress={onSubmit}
            loading={mutation.isPending || formState.isSubmitting}
          />
        </Card>

        <Card className="gap-3">
          <AppText variant="label">{t('profile.accountInfo')}</AppText>
          <AppText variant="caption">{t('common.email')}</AppText>
          <AppText>{profile?.email ?? t('common.notAvailable')}</AppText>
          <AppText variant="caption">{t('dashboard.roleLabel')}</AppText>
          <AppText>{profile ? t(roleKeys[profile.role]) : t('common.notAvailable')}</AppText>
          <AppText variant="caption">
            {profile?.isVerified ? t('common.verified') : t('common.pendingVerification')}
          </AppText>
          {profile?.createdAt ? (
            <AppText variant="caption">
              {t('common.memberSince')} {new Date(profile.createdAt).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB')}
            </AppText>
          ) : null}
        </Card>

        <Card className="gap-3">
          <AppText variant="label">{t('profile.languageSection')}</AppText>
          <LanguageSwitcher />
        </Card>

        <Button
          label={t('profile.signOutAction')}
          variant="outline"
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
        />
      </View>
    </Screen>
  );
}

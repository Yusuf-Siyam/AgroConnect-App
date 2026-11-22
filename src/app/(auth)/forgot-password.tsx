import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { env } from '@/config/env';
import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { TextField } from '@/components/common/TextField';
import { AUTH_EMULATOR_RESET_URL } from '@/features/authentication/emulatorLinks';
import { authErrorKey, validationKey } from '@/features/authentication/errorMessages';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/authentication/schemas';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { useState } from 'react';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { resetPassword, errorCode, clearError } = useAuth();
  const [sent, setSent] = useState(false);
  const { control, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    clearError();
    try {
      await resetPassword(values);
      setSent(true);
    } catch {
      // Error state is exposed through the auth context.
    }
  });

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-6 px-6 py-8">
        <View className="gap-2">
          <AppText variant="title" className="text-primary">
            {t('auth.forgotTitle')}
          </AppText>
          <AppText variant="subtitle">{t('auth.forgotSubtitle')}</AppText>
        </View>

        {sent ? (
          <Card className="gap-3">
            <AppText className="font-semibold text-success">{t('auth.resetSentTitle')}</AppText>
            <AppText variant="caption">{t('auth.resetSentMessage')}</AppText>
            {env.useEmulator ? (
              <AppText variant="caption" className="text-muted">
                {t('auth.resetEmulatorNote', { url: AUTH_EMULATOR_RESET_URL })}
              </AppText>
            ) : null}
          </Card>
        ) : (
          <Card className="gap-4">
            <Controller
              control={control}
              name="email"
              render={({ field, fieldState }) => (
                <TextField
                  label={t('common.email')}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
                />
              )}
            />

            {errorCode ? <AppText variant="error">{t(authErrorKey(errorCode))}</AppText> : null}

            <Button
              label={t('auth.forgotAction')}
              onPress={onSubmit}
              loading={formState.isSubmitting}
              testID="reset-submit"
            />
          </Card>
        )}

        <Link href="/login">
          <AppText className="text-center font-semibold text-primary">{t('auth.backToLogin')}</AppText>
        </Link>
      </View>
    </Screen>
  );
}

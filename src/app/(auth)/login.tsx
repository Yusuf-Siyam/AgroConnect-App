import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { TextField } from '@/components/common/TextField';
import { authErrorKey, validationKey } from '@/features/authentication/errorMessages';
import { loginSchema, type LoginValues } from '@/features/authentication/schemas';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { homePathForRole } from '@/types/user';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn, errorCode, isConfigured, clearError } = useAuth();
  const { control, handleSubmit, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    clearError();
    try {
      const profile = await signIn(values);
      router.replace(homePathForRole(profile.role));
    } catch {
      // Error state is exposed through the auth context.
    }
  });

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-6 px-6 py-8">
        <View className="gap-2">
          <AppText variant="title" className="text-primary">
            {t('auth.loginTitle')}
          </AppText>
          <AppText variant="subtitle">{t('auth.loginSubtitle')}</AppText>
        </View>

        {!isConfigured ? (
          <Card className="border-warning">
            <AppText className="font-semibold text-warning">{t('auth.configMissingTitle')}</AppText>
            <AppText variant="caption" className="mt-1">
              {t('auth.configMissingMessage')}
            </AppText>
          </Card>
        ) : null}

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

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <TextField
                label={t('common.password')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry
                autoCapitalize="none"
                error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
              />
            )}
          />

          {errorCode ? <AppText variant="error">{t(authErrorKey(errorCode))}</AppText> : null}

          <Button
            label={t('auth.loginAction')}
            onPress={onSubmit}
            loading={formState.isSubmitting}
            testID="login-submit"
          />
        </Card>

        <View className="gap-3">
          <Link href="/forgot-password">
            <AppText className="text-center font-semibold text-primary">{t('auth.forgotAction')}</AppText>
          </Link>
          <Link href="/otp">
            <AppText className="text-center text-muted">{t('auth.phoneOtpAction')}</AppText>
          </Link>
          <View className="flex-row items-center justify-center gap-2">
            <AppText variant="caption">{t('auth.noAccount')}</AppText>
            <Link href="/register">
              <AppText className="font-semibold text-primary">{t('auth.registerAction')}</AppText>
            </Link>
          </View>
        </View>
      </View>
    </Screen>
  );
}

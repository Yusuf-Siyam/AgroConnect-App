import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { RolePicker } from '@/components/common/RolePicker';
import { Screen } from '@/components/common/Screen';
import { TextField } from '@/components/common/TextField';
import { authErrorKey, validationKey } from '@/features/authentication/errorMessages';
import { registerFormSchema, type RegisterFormValues } from '@/features/authentication/schemas';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { homePathForRole } from '@/types/user';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { signUp, errorCode, isConfigured, clearError } = useAuth();
  const { control, handleSubmit, formState } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phoneNumber: '',
      password: '',
      confirmPassword: '',
      role: '',
      vehicleType: '',
      registrationNumber: '',
    },
  });

  const selectedRole = useWatch({ control, name: 'role' });

  const onSubmit = handleSubmit(async (values) => {
    if (!values.role) return;
    clearError();
    try {
      const profile = await signUp({ ...values, role: values.role });
      router.replace(homePathForRole(profile.role));
    } catch {
      // Error state is exposed through the auth context.
    }
  });

  const errorFor = (message?: string) => (message ? t(validationKey(message)) : undefined);

  return (
    <Screen scroll>
      <View className="gap-6 px-6 py-8">
        <View className="gap-2">
          <AppText variant="title" className="text-primary">
            {t('auth.registerTitle')}
          </AppText>
          <AppText variant="subtitle">{t('auth.registerSubtitle')}</AppText>
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
          <AppText variant="label">{t('auth.roleSelectionTitle')}</AppText>
          <AppText variant="caption">{t('auth.roleSelectionSubtitle')}</AppText>
          <Controller
            control={control}
            name="role"
            render={({ field, fieldState }) => (
              <View className="gap-1.5">
                <RolePicker value={field.value} onChange={field.onChange} />
                {fieldState.error ? <AppText variant="error">{errorFor(fieldState.error.message)}</AppText> : null}
              </View>
            )}
          />
        </Card>

        <Card className="gap-4">
          <Controller
            control={control}
            name="fullName"
            render={({ field, fieldState }) => (
              <TextField
                label={t('common.fullName')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoComplete="name"
                error={errorFor(fieldState.error?.message)}
              />
            )}
          />

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
                error={errorFor(fieldState.error?.message)}
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
                error={errorFor(fieldState.error?.message)}
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
                error={errorFor(fieldState.error?.message)}
              />
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field, fieldState }) => (
              <TextField
                label={t('common.confirmPassword')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry
                autoCapitalize="none"
                error={errorFor(fieldState.error?.message)}
              />
            )}
          />
        </Card>

        {selectedRole === 'transporter' ? (
          <Card className="gap-4">
            <AppText variant="label">{t('auth.transporterDetailsTitle')}</AppText>
            <Controller
              control={control}
              name="vehicleType"
              render={({ field, fieldState }) => (
                <TextField
                  label={t('auth.vehicleType')}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={t('auth.vehicleTypePlaceholder')}
                  error={errorFor(fieldState.error?.message)}
                />
              )}
            />
            <Controller
              control={control}
              name="registrationNumber"
              render={({ field, fieldState }) => (
                <TextField
                  label={t('auth.registrationNumber')}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={t('auth.registrationNumberPlaceholder')}
                  autoCapitalize="characters"
                  error={errorFor(fieldState.error?.message)}
                />
              )}
            />
          </Card>
        ) : null}

        {errorCode ? <AppText variant="error">{t(authErrorKey(errorCode))}</AppText> : null}

        <Button
          label={t('auth.registerAction')}
          onPress={onSubmit}
          loading={formState.isSubmitting}
          testID="register-submit"
        />

        <View className="flex-row items-center justify-center gap-2">
          <AppText variant="caption">{t('auth.haveAccount')}</AppText>
          <Link href="/login">
            <AppText className="font-semibold text-primary">{t('auth.loginAction')}</AppText>
          </Link>
        </View>
      </View>
    </Screen>
  );
}

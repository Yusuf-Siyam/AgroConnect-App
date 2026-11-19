import { Platform, Text as RNText, type TextProps } from 'react-native';

import { useTranslation } from '@/i18n';

type Variant = 'title' | 'subtitle' | 'body' | 'label' | 'caption' | 'error';

const variantClasses: Record<Variant, string> = {
  title: 'text-2xl font-bold text-ink',
  subtitle: 'text-base text-muted',
  body: 'text-base text-ink',
  label: 'text-sm font-semibold text-ink',
  caption: 'text-xs text-muted',
  error: 'text-sm text-danger',
};

export function AppText({
  variant = 'body',
  className = '',
  style,
  ...props
}: TextProps & { variant?: Variant }) {
  const { locale } = useTranslation();

  return (
    <RNText
      {...props}
      lang={Platform.OS === 'web' ? (locale === 'bn' ? 'bn-BD' : 'en-GB') : undefined}
      className={`${variantClasses[variant]} ${className}`}
      style={[{ textAlign: 'left' }, style]}
    />
  );
}

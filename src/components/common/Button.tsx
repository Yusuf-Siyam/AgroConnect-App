import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

import { theme } from '@/theme';

import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  outline: 'border border-line bg-white',
  danger: 'bg-danger',
};

const labelClasses: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  outline: 'text-ink',
  danger: 'text-white',
};

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  testID,
}: {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: Variant;
  testID?: string;
}) {
  const inactive = disabled || loading;

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      className={`min-h-12 items-center justify-center rounded-xl px-5 py-3 ${variantClasses[variant]} ${
        inactive ? 'opacity-60' : ''
      }`}
    >
      <View className="flex-row items-center gap-2">
        {loading ? (
          <ActivityIndicator color={variant === 'outline' ? theme.colors.ink : theme.colors.surface} />
        ) : null}
        <AppText className={`font-semibold ${labelClasses[variant]}`}>{label}</AppText>
      </View>
    </TouchableOpacity>
  );
}

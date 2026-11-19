import { View } from 'react-native';
import { TextInput, type TextInputProps } from 'react-native';

import { AppText } from './AppText';

export function TextField({
  label,
  error,
  placeholder,
  className = '',
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View className={`gap-1.5 ${className}`}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        {...props}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        className={`min-h-12 rounded-xl border bg-white px-4 py-3 text-base text-ink ${
          error ? 'border-danger' : 'border-line'
        }`}
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
    </View>
  );
}

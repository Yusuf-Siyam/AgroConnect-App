import { Pressable, View } from 'react-native';

import { AppText } from './AppText';

type Option = { label: string; value: string };

export function SelectField({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <View className="gap-2">
      <AppText variant="label">{label}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value || '__empty__'}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              className={`min-h-12 rounded-xl border px-4 py-3 ${
                selected ? 'border-primary bg-primary/10' : 'border-line bg-white'
              }`}
            >
              <AppText className={selected ? 'font-semibold text-primary' : 'text-ink'}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? <AppText variant="error">{error}</AppText> : null}
    </View>
  );
}

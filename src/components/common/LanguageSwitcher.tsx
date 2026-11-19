import { View } from 'react-native';

import { useTranslation } from '@/i18n';

import { AppText } from './AppText';

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();
  const options = [
    { value: 'bn' as const, label: 'বাংলা' },
    { value: 'en' as const, label: 'English' },
  ];

  return (
    <View className="flex-row gap-2">
      {options.map((option) => {
        const selected = locale === option.value;
        return (
          <View
            key={option.value}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onTouchEnd={() => setLocale(option.value)}
            className={`flex-1 items-center rounded-xl border px-4 py-3 ${
              selected ? 'border-primary bg-primary/10' : 'border-line bg-white'
            }`}
          >
            <AppText className={selected ? 'font-semibold text-primary' : 'text-ink'}>
              {option.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

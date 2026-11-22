import { Pressable, View } from 'react-native';

import { useTranslation } from '@/i18n';
import type { TranslationKey } from '@/i18n';
import type { Locale } from '@/types/locale';

import { AppText } from './AppText';

const options: { value: Locale; labelKey: TranslationKey }[] = [
  { value: 'bn', labelKey: 'language.bangla' },
  { value: 'en', labelKey: 'language.english' },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('common.language')}>
      {options.map((option) => {
        const selected = locale === option.value;
        const label = t(option.labelKey);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => setLocale(option.value)}
            className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-4 py-3 ${
              selected ? 'border-primary bg-primary/10' : 'border-line bg-white'
            }`}
          >
            <AppText className={selected ? 'font-semibold text-primary' : 'text-ink'}>{label}</AppText>
            {selected ? <AppText className="font-semibold text-primary">✓</AppText> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

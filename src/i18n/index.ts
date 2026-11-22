import { bn } from '@/locales/bn';
import { en, type TranslationKey } from '@/locales/en';
import { useLocaleStore } from '@/store/locale';
import type { Locale } from '@/types/locale';

export type { TranslationKey } from '@/locales/en';

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { bn, en };

export function normalizeLocale(value?: string | null): Locale {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'bn';
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  let value = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;

  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{{${name}}}`, String(replacement));
    }
  }

  return value;
}

export function useTranslation() {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return {
    locale,
    setLocale,
    t: (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params),
  };
}

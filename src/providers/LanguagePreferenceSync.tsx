import { useEffect, useRef } from 'react';

import { normalizeLocale } from '@/i18n';
import { useLocaleStore } from '@/store/locale';

import { useAuth } from './AuthProvider';

/**
 * Connects the device locale choice with the signed-in profile.
 *
 * The local store is authoritative on this device: it is restored from
 * AsyncStorage and every change is persisted. When a profile is available and
 * the user has never chosen a locale here, its `preferredLanguage` is adopted
 * without marking a local preference. Once the user chooses, the value is
 * mirrored to the existing profile endpoint on a best-effort basis.
 */
export function LanguagePreferenceSync() {
  const { status, profile, syncPreferredLanguage } = useAuth();
  const locale = useLocaleStore((state) => state.locale);
  const hasPreference = useLocaleStore((state) => state.hasPreference);
  const hydrated = useLocaleStore((state) => state.hydrated);
  const hydrateProfileLocale = useLocaleStore((state) => state.hydrateProfileLocale);
  const lastMirroredLocale = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || status !== 'authenticated' || hasPreference) return;
    const preferred = profile?.preferredLanguage;
    if (!preferred) return;

    const profileLocale = normalizeLocale(preferred);
    if (useLocaleStore.getState().locale !== profileLocale) {
      hydrateProfileLocale(profileLocale);
    }
  }, [hydrated, status, hasPreference, profile?.preferredLanguage, hydrateProfileLocale]);

  useEffect(() => {
    if (status !== 'authenticated' || !hydrated || !hasPreference) return;

    const profileLocale = profile?.preferredLanguage
      ? normalizeLocale(profile.preferredLanguage)
      : null;
    if (profileLocale === locale) {
      lastMirroredLocale.current = locale;
      return;
    }
    if (lastMirroredLocale.current === locale) return;

    lastMirroredLocale.current = locale;
    void syncPreferredLanguage(locale);
  }, [status, hydrated, hasPreference, profile?.preferredLanguage, locale, syncPreferredLanguage]);

  return null;
}

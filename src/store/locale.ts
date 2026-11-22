import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Locale } from '@/types/locale';

type LocaleState = {
  locale: Locale;
  hasPreference: boolean;
  hydrated: boolean;
  setLocale: (locale: Locale) => void;
  hydrateProfileLocale: (locale: Locale) => void;
  markHydrated: () => void;
};

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: 'bn',
      hasPreference: false,
      hydrated: false,
      setLocale: (locale) => set({ locale, hasPreference: true }),
      hydrateProfileLocale: (locale) => {
        if (!get().hasPreference) set({ locale });
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'agroconnect-locale',
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      partialize: (state) => ({ locale: state.locale, hasPreference: state.hasPreference }),
    },
  ),
);

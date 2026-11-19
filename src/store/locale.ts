import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Locale } from '@/types/locale';

type LocaleState = {
  locale: Locale;
  hasPreference: boolean;
  setLocale: (locale: Locale) => void;
  hydrateDeviceLocale: (locale: Locale) => void;
};

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: 'bn',
      hasPreference: false,
      setLocale: (locale) => set({ locale, hasPreference: true }),
      hydrateDeviceLocale: (locale) => {
        if (!get().hasPreference) set({ locale });
      },
    }),
    {
      name: 'agroconnect-locale',
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
    },
  ),
);

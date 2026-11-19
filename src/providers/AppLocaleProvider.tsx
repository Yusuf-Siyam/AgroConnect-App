import { useEffect, type ReactNode } from 'react';

import { detectDeviceLocale } from '@/i18n';
import { useLocaleStore } from '@/store/locale';

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useLocaleStore.persist.rehydrate().then(() => {
      if (!useLocaleStore.getState().hasPreference) {
        useLocaleStore.getState().hydrateDeviceLocale(detectDeviceLocale());
      }
    });
  }, []);

  return children;
}

import { useEffect, type ReactNode } from 'react';

import { useLocaleStore } from '@/store/locale';

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let active = true;

    void useLocaleStore.persist
      .rehydrate()
      .catch(() => {
        // AsyncStorage can be unavailable (for example in a restricted web
        // context). The in-memory Bangla default still works.
      })
      .finally(() => {
        if (!active) return;
        useLocaleStore.getState().hydrateProfileLocale('bn');
        useLocaleStore.getState().markHydrated();
      });

    return () => {
      active = false;
    };
  }, []);

  return children;
}

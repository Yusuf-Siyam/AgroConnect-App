import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

import { useBackNavigation } from '@/features/navigation/useBackNavigation';

/** Gives Android hardware back the same role-aware fallbacks as in-app back buttons. */
export function AndroidBackHandler() {
  const { handleHardwareBack } = useBackNavigation();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => subscription.remove();
  }, [handleHardwareBack]);

  return null;
}

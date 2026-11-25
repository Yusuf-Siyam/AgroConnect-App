import type { Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { useBackNavigation } from '@/features/navigation/useBackNavigation';
import { useTranslation, type TranslationKey } from '@/i18n';

const BACK_CHEVRON = '‹';

type Props = {
  fallbackHref?: Href | null;
  labelKey?: TranslationKey;
  compact?: boolean;
};

/** History-aware back control: pops real history, otherwise replaces with a parent route. */
export function NavigationBackButton({ fallbackHref, labelKey = 'common.back', compact }: Props) {
  const { t } = useTranslation();
  const { action, goBack } = useBackNavigation({ fallbackHref });

  if (action.kind === 'none') return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(labelKey)}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      onPress={goBack}
      className="min-h-10 flex-row items-center gap-1 rounded-xl px-2 py-1"
    >
      <AppText className="text-2xl leading-none text-primary">{BACK_CHEVRON}</AppText>
      {compact ? null : (
        <View>
          <AppText className="font-semibold text-primary">{t(labelKey)}</AppText>
        </View>
      )}
    </Pressable>
  );
}

/** Text variant used by auth screens that previously hardcoded a login link. */
export function NavigationBackLink({ fallbackHref, labelKey = 'common.back' }: Omit<Props, 'compact'>) {
  const { t } = useTranslation();
  const { action, goBack } = useBackNavigation({ fallbackHref });

  if (action.kind === 'none') return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(labelKey)}
      onPress={goBack}
      className="rounded-xl px-3 py-2"
    >
      <AppText className="text-center font-semibold text-primary">{t(labelKey)}</AppText>
    </Pressable>
  );
}

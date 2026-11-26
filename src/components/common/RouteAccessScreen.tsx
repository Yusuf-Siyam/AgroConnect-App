import { View } from 'react-native';

import { useTranslation, type TranslationKey } from '@/i18n';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { Screen } from './Screen';

type Kind = 'profileError' | 'suspended' | 'notFound';

const COPY: Record<Kind, { titleKey: TranslationKey; messageKey: TranslationKey }> = {
  profileError: {
    titleKey: 'route.profileErrorTitle',
    messageKey: 'route.profileErrorDetail',
  },
  suspended: {
    titleKey: 'route.suspendedTitle',
    messageKey: 'route.suspendedDetail',
  },
  notFound: {
    titleKey: 'route.notFoundTitle',
    messageKey: 'route.notFoundDetail',
  },
};

export function RouteAccessScreen({
  kind,
  onRetry,
  onSignOut,
  onHome,
  retrying = false,
}: {
  kind: Kind;
  onRetry?: () => void;
  onSignOut?: () => void;
  onHome?: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  const copy = COPY[kind];

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-4 px-6 py-8">
        <Card className="w-full gap-3">
          <AppText variant="title" className="text-primary">
            {t(copy.titleKey)}
          </AppText>
          <AppText variant="caption">{t(copy.messageKey)}</AppText>
          {kind === 'profileError' && onRetry ? (
            <Button label={t('common.retry')} onPress={onRetry} loading={retrying} />
          ) : null}
          {kind !== 'notFound' && onSignOut ? (
            <Button label={t('common.signOut')} variant="outline" onPress={onSignOut} />
          ) : null}
          {kind === 'notFound' && onHome ? (
            <Button label={t('route.goHome')} onPress={onHome} />
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}

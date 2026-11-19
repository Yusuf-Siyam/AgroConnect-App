import { ActivityIndicator, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { theme } from '@/theme';

import { AppText } from './AppText';
import { Card } from './Card';
import { Button } from './Button';

type StateViewProps = {
  state: 'loading' | 'error' | 'empty';
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function StateView({ state, title, message, onRetry }: StateViewProps) {
  const { t } = useTranslation();

  if (state === 'loading') {
    return (
      <View className="items-center justify-center gap-3 py-10">
        <ActivityIndicator color={theme.colors.primary} />
        <AppText variant="caption">{title ?? t('common.loading')}</AppText>
      </View>
    );
  }

  return (
    <Card className="items-center gap-2 py-8">
      <AppText className="text-center font-semibold">
        {title ?? t(state === 'error' ? 'state.errorTitle' : 'state.emptyTitle')}
      </AppText>
      <AppText variant="caption" className="text-center">
        {message ?? t(state === 'error' ? 'state.errorMessage' : 'state.emptyMessage')}
      </AppText>
      {state === 'error' && onRetry ? (
        <View className="mt-3 w-full max-w-56">
          <Button label={t('common.retry')} variant="outline" onPress={onRetry} />
        </View>
      ) : null}
    </Card>
  );
}

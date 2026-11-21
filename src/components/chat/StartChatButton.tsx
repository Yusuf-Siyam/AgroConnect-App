import { useMutation } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { chatErrorKey, createChat } from '@/features/chat/chatService';
import type { CreateChatInput } from '@/features/chat/types';
import { useTranslation, type TranslationKey } from '@/i18n';

/** Starts an authorized conversation through the backend, then opens the thread. */
export function StartChatButton({
  input,
  labelKey,
  variant = 'outline',
}: {
  input: CreateChatInput;
  labelKey: TranslationKey;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
}) {
  const { t } = useTranslation();
  const start = useMutation({
    mutationFn: () => createChat(input),
    onSuccess: (chat) => router.push(`/chat/${chat.id}` as Href),
  });

  return (
    <View className="gap-1">
      <Button
        label={t(labelKey)}
        variant={variant}
        loading={start.isPending}
        onPress={() => start.mutate()}
      />
      {start.isError ? (
        <AppText variant="error">{t(chatErrorKey((start.error as { code?: string }).code))}</AppText>
      ) : null}
    </View>
  );
}

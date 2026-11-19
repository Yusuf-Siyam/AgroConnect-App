import { View } from 'react-native';

import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';
import type { Role } from '@/types/user';

import { AppText } from './AppText';

const roleKeys: Record<Role, TranslationKey> = {
  farmer: 'roles.farmer',
  buyer: 'roles.buyer',
  transporter: 'roles.transporter',
  admin: 'roles.admin',
};

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation();

  return (
    <View className="self-start rounded-full bg-primary/10 px-3 py-1">
      <AppText variant="caption" className="font-semibold text-primary">
        {t(roleKeys[role])}
      </AppText>
    </View>
  );
}

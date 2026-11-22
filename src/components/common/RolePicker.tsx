import { Pressable, View } from 'react-native';

import { useTranslation, type TranslationKey } from '@/i18n';
import { PUBLIC_REGISTER_ROLES, type Role } from '@/types/user';

import { AppText } from './AppText';

const roleLabels: Record<(typeof PUBLIC_REGISTER_ROLES)[number], TranslationKey> = {
  farmer: 'roles.farmer',
  buyer: 'roles.buyer',
  transporter: 'roles.transporter',
};

export function RolePicker({
  value,
  onChange,
}: {
  value: Role | '' | null;
  onChange: (role: Role) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('common.role')}>
      {PUBLIC_REGISTER_ROLES.map((role) => {
        const selected = value === role;
        const label = t(roleLabels[role]);
        return (
          <Pressable
            key={role}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => onChange(role)}
            className={`min-h-12 flex-row items-center justify-between rounded-xl border px-4 py-3 ${
              selected ? 'border-primary bg-primary/10' : 'border-line bg-white'
            }`}
          >
            <AppText className={selected ? 'font-semibold text-primary' : 'text-ink'}>{label}</AppText>
            {selected ? <AppText className="font-semibold text-primary">✓</AppText> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

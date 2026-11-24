import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';

import { useTranslation } from '@/i18n';

import { AppText } from './AppText';
import { TextField } from './TextField';

export type SelectOption = { label: string; value: string };

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  disabled?: boolean;
};

export function SearchableSelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  error,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q));
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View className="gap-1.5">
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`min-h-12 justify-center rounded-xl border bg-white px-4 py-3 ${
          error ? 'border-danger' : 'border-line'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <AppText className={selected ? 'text-ink' : 'text-muted'}>
          {selected?.label ?? placeholder ?? t('common.selectOption')}
        </AppText>
      </Pressable>
      {error ? <AppText variant="error">{error}</AppText> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[80%] rounded-t-3xl bg-white px-4 pb-6 pt-4">
            <View className="mb-3 flex-row items-center justify-between">
              <AppText className="text-base font-semibold">{label}</AppText>
              <Pressable accessibilityRole="button" onPress={close} className="min-h-11 justify-center px-2">
                <AppText className="font-semibold text-primary">{t('common.cancel')}</AppText>
              </Pressable>
            </View>
            <TextField
              label={t('common.search')}
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder ?? t('common.searchPlaceholder')}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              className="mt-3"
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onChange(item.value);
                      close();
                    }}
                    className={`min-h-12 justify-center rounded-xl border px-4 py-3 mb-2 ${
                      active ? 'border-primary bg-primary/10' : 'border-line bg-white'
                    }`}
                  >
                    <AppText className={active ? 'font-semibold text-primary' : 'text-ink'}>{item.label}</AppText>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View className="py-6">
                  <AppText variant="caption" className="text-center">{t('state.emptyTitle')}</AppText>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

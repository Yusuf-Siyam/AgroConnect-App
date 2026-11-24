import { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { useTranslation } from '@/i18n';

import { AppText } from './AppText';
import { Button } from './Button';
import { TextField } from './TextField';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
};

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIso(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return null;
  if (toIsoDate(date) !== value) return null;
  return date;
}

export function DatePickerField({ label, value, onChange, error, placeholder }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const display = value || placeholder || t('common.datePlaceholder');

  const openPicker = () => {
    setDraft(value || toIsoDate(new Date()));
    setOpen(true);
  };

  const webProps = Platform.OS === 'web' ? ({ type: 'date' } as any) : {};

  return (
    <View className="gap-1.5">
      {Platform.OS === 'web' ? (
        <TextField
          label={label}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? t('common.datePlaceholder')}
          error={error}
          {...webProps}
        />
      ) : (
        <>
          <AppText variant="label">{label}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={openPicker}
            className={`min-h-12 justify-center rounded-xl border bg-white px-4 py-3 ${error ? 'border-danger' : 'border-line'}`}
          >
            <AppText className={value ? 'text-ink' : 'text-muted'}>{display}</AppText>
          </Pressable>
          {error ? <AppText variant="error">{error}</AppText> : null}
          <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
            <View className="flex-1 justify-center bg-black/40 px-4">
              <View className="rounded-2xl bg-white p-4 gap-4">
                <AppText className="text-base font-semibold">{label}</AppText>
                <TextField
                  label={t('common.pickDate')}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={t('common.datePlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button label={t('common.cancel')} variant="outline" onPress={() => setOpen(false)} />
                  </View>
                  <View className="flex-1">
                    <Button
                      label={t('common.save')}
                      onPress={() => {
                        const parsed = parseIso(draft);
                        if (parsed) {
                          onChange(toIsoDate(parsed));
                          setOpen(false);
                        } else {
                          onChange(draft);
                          setOpen(false);
                        }
                      }}
                    />
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

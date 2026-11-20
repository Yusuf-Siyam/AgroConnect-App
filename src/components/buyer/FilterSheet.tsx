import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { TextField } from '@/components/common/TextField';
import { PRODUCT_UNITS } from '@/features/farmer/types';
import type { Category, MarketplaceFilters } from '@/features/buyer/types';
import type { TranslationKey } from '@/i18n';
import { useTranslation } from '@/i18n';

type FilterSheetProps = {
  categories: Category[];
  filters: MarketplaceFilters;
  onApply: (filters: Partial<MarketplaceFilters>) => void;
  onClose: () => void;
};

export function FilterSheet({ categories, filters, onApply, onClose }: FilterSheetProps) {
  const { t, locale } = useTranslation();
  const [category, setCategory] = useState<string | undefined>(filters.category);
  const [unit, setUnit] = useState<MarketplaceFilters['unit']>(filters.unit);
  const [sort, setSort] = useState(filters.sort);
  const [minPrice, setMinPrice] = useState(
    filters.minPrice === undefined ? '' : String(filters.minPrice),
  );
  const [maxPrice, setMaxPrice] = useState(
    filters.maxPrice === undefined ? '' : String(filters.maxPrice),
  );
  const [district, setDistrict] = useState(filters.district ?? '');
  const [inStock, setInStock] = useState(filters.inStock ?? true);

  const apply = () => {
    const min = minPrice.trim() === '' ? undefined : Number(minPrice);
    const max = maxPrice.trim() === '' ? undefined : Number(maxPrice);
    onApply({
      category,
      unit,
      sort,
      minPrice: min !== undefined && Number.isFinite(min) ? min : undefined,
      maxPrice: max !== undefined && Number.isFinite(max) ? max : undefined,
      district: district.trim() || undefined,
      inStock,
      offset: 0,
    });
    onClose();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-canvas px-5 py-8">
        <View className="flex-row items-center justify-between">
          <AppText variant="title">{t('common.filters')}</AppText>
          <Button label={t('common.close')} variant="outline" onPress={onClose} />
        </View>

        <ScrollView className="mt-5" keyboardShouldPersistTaps="handled">
          <View className="gap-5 pb-8">
            <View className="gap-2">
              <AppText variant="label">{t('common.category')}</AppText>
              <View className="flex-row flex-wrap gap-2">
                <Button
                  label={t('buyer.marketplace.categoryAll')}
                  variant={category === undefined ? 'primary' : 'outline'}
                  onPress={() => setCategory(undefined)}
                />
                {categories.map((item) => (
                  <Button
                    key={item.id}
                    label={item.name[locale]}
                    variant={category === item.id ? 'primary' : 'outline'}
                    onPress={() => setCategory(item.id)}
                  />
                ))}
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label={t('common.minPrice')}
                  value={minPrice}
                  onChangeText={setMinPrice}
                  keyboardType="numeric"
                />
              </View>
              <View className="flex-1">
                <TextField
                  label={t('common.maxPrice')}
                  value={maxPrice}
                  onChangeText={setMaxPrice}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <TextField label={t('common.district')} value={district} onChangeText={setDistrict} />

            <View className="gap-2">
              <AppText variant="label">{t('common.unit')}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {PRODUCT_UNITS.map((value) => (
                  <Button
                    key={value}
                    label={t(`unit.${value}` as TranslationKey)}
                    variant={unit === value ? 'primary' : 'outline'}
                    onPress={() => setUnit(value)}
                  />
                ))}
              </View>
            </View>

            <View className="gap-2">
              <AppText variant="label">{t('common.sort')}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {(['newest', 'price_asc', 'price_desc'] as const).map((value) => (
                  <Button
                    key={value}
                    label={t(
                      value === 'newest'
                        ? 'common.newest'
                        : value === 'price_asc'
                          ? 'common.priceLowHigh'
                          : 'common.priceHighLow',
                    )}
                    variant={sort === value ? 'primary' : 'outline'}
                    onPress={() => setSort(value)}
                  />
                ))}
              </View>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: inStock }}
              onPress={() => setInStock((current) => !current)}
              className="flex-row items-center gap-3 rounded-xl border border-line bg-surface p-4"
            >
              <View
                className={`h-5 w-5 rounded border ${
                  inStock ? 'border-primary bg-primary' : 'border-line bg-surface'
                }`}
              />
              <AppText>{t('common.inStock')}</AppText>
            </Pressable>

            <View className="flex-row gap-3">
              <Button
                label={t('common.clear')}
                variant="outline"
                onPress={() => {
                  setCategory(undefined);
                  setUnit(undefined);
                  setSort('newest');
                  setMinPrice('');
                  setMaxPrice('');
                  setDistrict('');
                  setInStock(true);
                }}
              />
              <Button label={t('common.apply')} onPress={apply} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

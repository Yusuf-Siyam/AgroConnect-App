import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, Pressable, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { DatePickerField } from '@/components/common/DatePickerField';
import { SearchableSelectField } from '@/components/common/SearchableSelectField';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey, validationKey } from '@/features/farmer/errorMessages';
import { createUuid } from '@/features/farmer/id';
import { pickAndUploadProductImages, type UploadProgress } from '@/features/farmer/imageUpload';
import { BANGLADESH_DISTRICTS, PRODUCT_CATEGORIES } from '@/features/farmer/productOptions';
import {
  productFormSchema,
  toProductFormValues,
  toProductPayload,
  type ProductFormValues,
} from '@/features/farmer/schemas';
import { createProduct, updateProduct } from '@/features/farmer/productService';
import { PRODUCT_STATUSES, PRODUCT_UNITS, type Product } from '@/features/farmer/types';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { getUploadConfig } from '@/services/cloudinaryUpload';

const MAX_IMAGES = 5;

const emptyValues: ProductFormValues = {
  nameBn: '',
  nameEn: '',
  category: '',
  descriptionBn: '',
  descriptionEn: '',
  price: '',
  unit: 'kg',
  stock: '0',
  lowStockThreshold: '5',
  minOrderQty: '1',
  harvestDate: '',
  district: '',
  variety: '',
  status: 'draft',
};

export function ProductForm({ product }: { product?: Product }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [productId] = useState(() => product?.id ?? createUuid());
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const uploads = useQuery({ queryKey: ['uploads', 'config'], queryFn: getUploadConfig, staleTime: 60_000 });
  const uploadsEnabled = uploads.data?.enabled === true;

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? toProductFormValues(product) : emptyValues,
  });
  const { control, handleSubmit, formState } = form;

  const save = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const payload = toProductPayload(values, images, product ? undefined : productId);
      return product ? updateProduct(product.id, payload) : createProduct(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['farmer', 'products'] });
      await queryClient.invalidateQueries({ queryKey: ['farmer', 'product-stats'] });
      router.back();
    },
  });

  const resolveUploadError = (error: unknown): string => {
    const code = (error as { code?: string })?.code;
    if (code === 'CLOUDINARY_NOT_CONFIGURED') return t('error.uploadNotConfigured');
    if (code === 'UPLOAD_IMAGE_TYPE') return t('error.imageType');
    if (code === 'UPLOAD_IMAGE_SIZE') return t('error.imageSize');
    if (code === 'UPLOAD_IMAGE_LIMIT') return t('farmer.products.imageLimit');
    if (code === 'UPLOAD_READ_FAILED') return t('error.generic');
    if (error instanceof Error && error.message) return error.message;
    return t('error.generic');
  };

  const pickImages = async () => {
    if (!profile) return;
    if (!uploadsEnabled) {
      setUploadError(t('error.uploadNotConfigured'));
      return;
    }
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setUploadError(t('farmer.products.imageLimit'));
      return;
    }
    setUploadError(null);
    try {
      const urls = await pickAndUploadProductImages(profile.uid, productId, remaining, setUploadProgress);
      setImages((current) => [...current, ...urls].slice(0, MAX_IMAGES));
    } catch (error) {
      setUploadError(resolveUploadError(error));
    } finally {
      setUploadProgress(null);
    }
  };

  const submitWithStatus = (nextStatus: ProductFormValues['status']) =>
    handleSubmit(async (values) => {
      setSaveError(null);
      try {
        await save.mutateAsync({ ...values, status: nextStatus });
      } catch (error) {
        setSaveError(farmerApiErrorKey((error as { code?: string }).code));
      }
    })();

  const field = (
    name: keyof ProductFormValues,
    label: string,
    options: Record<string, unknown> = {},
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field: input, fieldState }) => (
        <TextField
          label={label}
          value={String(input.value ?? '')}
          onChangeText={input.onChange}
          onBlur={input.onBlur}
          error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
          {...options}
        />
      )}
    />
  );

  const categoryOptions = PRODUCT_CATEGORIES.map((category) => ({
    value: category,
    label: t(`product.category.${category}` as TranslationKey),
  }));

  const districtOptions = BANGLADESH_DISTRICTS.map((district) => ({ value: district, label: district }));

  const unitOptions = PRODUCT_UNITS.map((unit) => ({
    value: unit,
    label: t(`unit.${unit}` as TranslationKey),
  }));

  const statusOptions = PRODUCT_STATUSES.filter((s) => s === 'draft' || s === 'active').map((s) => ({
    value: s,
    label: t(`product.status.${s}` as TranslationKey),
  }));

  return (
    <FarmerPage
      title={t(product ? 'farmer.products.editTitle' : 'farmer.products.createTitle')}
      subtitle={t('farmer.products.subtitle')}
    >
      <View className="gap-4">
        <Card className="gap-4">
          <AppText className="font-semibold">{t('farmer.products.basicInfo')}</AppText>
          {field('nameBn', t('common.nameBn'))}
          {field('nameEn', t('common.nameEn'))}
          <Controller
            control={control}
            name="category"
            render={({ field: input, fieldState }) => (
              <SearchableSelectField
                label={t('common.category')}
                value={input.value}
                options={categoryOptions}
                onChange={input.onChange}
                placeholder={t('farmer.products.categoryPlaceholder')}
                error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
              />
            )}
          />
          {field('descriptionBn', t('common.descriptionBn'), { multiline: true, numberOfLines: 4, textAlignVertical: 'top' })}
          {field('descriptionEn', t('common.descriptionEn'), { multiline: true, numberOfLines: 4, textAlignVertical: 'top' })}
        </Card>

        <Card className="gap-4">
          <AppText className="font-semibold">{t('farmer.products.pricingStock')}</AppText>
          {field('price', t('common.price'), { keyboardType: 'decimal-pad' })}
          <Controller
            control={control}
            name="unit"
            render={({ field: input, fieldState }) => (
              <SearchableSelectField
                label={t('common.unit')}
                value={input.value}
                options={unitOptions}
                onChange={(value) => input.onChange(value as ProductFormValues['unit'])}
                placeholder={t('farmer.products.unitPlaceholder')}
                error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
              />
            )}
          />
          {field('stock', t('common.stock'), { keyboardType: 'number-pad' })}
          {field('lowStockThreshold', t('common.lowStockThreshold'), { keyboardType: 'number-pad' })}
          {field('minOrderQty', t('common.minOrderQty'), { keyboardType: 'number-pad' })}
          <Controller
            control={control}
            name="status"
            render={({ field: input, fieldState }) => (
              <SearchableSelectField
                label={t('common.status')}
                value={input.value}
                options={statusOptions}
                onChange={(value) => input.onChange(value as ProductFormValues['status'])}
                placeholder={t('farmer.products.statusPlaceholder')}
                error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
              />
            )}
          />
        </Card>

        <Card className="gap-4">
          <AppText className="font-semibold">{t('farmer.products.harvestInfo')}</AppText>
          <Controller
            control={control}
            name="harvestDate"
            render={({ field: input, fieldState }) => (
              <DatePickerField
                label={t('common.harvestDate')}
                value={input.value}
                onChange={input.onChange}
                placeholder={t('common.datePlaceholder')}
                error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
              />
            )}
          />
          <Controller
            control={control}
            name="district"
            render={({ field: input, fieldState }) => (
              <SearchableSelectField
                label={t('common.district')}
                value={input.value}
                options={districtOptions}
                onChange={input.onChange}
                placeholder={t('farmer.products.districtPlaceholder')}
                searchPlaceholder={t('common.searchPlaceholder')}
                error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
              />
            )}
          />
          {field('variety', t('common.variety'))}
        </Card>

        <Card className="gap-4">
          <AppText className="font-semibold">{t('farmer.products.imageInfo')}</AppText>
          <AppText variant="caption">{t('farmer.products.imageLimit')}</AppText>
          <View className="flex-row flex-wrap gap-3">
            {images.map((uri, index) => (
              <View key={`${uri}-${index}`} className="items-center gap-1">
                <Image source={{ uri }} className="h-20 w-20 rounded-xl bg-canvas" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.remove')}
                  onPress={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  className="min-h-11 justify-center px-2"
                >
                  <AppText variant="caption" className="text-danger">{t('common.remove')}</AppText>
                </Pressable>
              </View>
            ))}
          </View>
          {uploadProgress ? (
            <AppText variant="caption">
              {t('farmer.products.uploadProgress', {
                index: uploadProgress.index,
                total: uploadProgress.total,
                percent: Math.round(uploadProgress.progress * 100),
              })}
            </AppText>
          ) : null}
          {uploadError ? <AppText variant="error">{uploadError}</AppText> : null}
          <Button
            label={t('farmer.products.addImages')}
            variant="outline"
            loading={!!uploadProgress}
            disabled={!uploadsEnabled || images.length >= MAX_IMAGES || !!uploadProgress}
            onPress={() => void pickImages()}
          />
          {!uploadsEnabled && !uploads.isLoading ? (
            <AppText variant="caption" className="text-amber-700">{t('error.uploadNotConfigured')}</AppText>
          ) : null}
        </Card>

        {saveError ? <AppText variant="error">{t(saveError)}</AppText> : null}
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              label={t('farmer.products.saveDraft')}
              variant="outline"
              onPress={() => void submitWithStatus('draft')}
              loading={formState.isSubmitting || save.isPending}
              disabled={formState.isSubmitting || save.isPending}
            />
          </View>
          <View className="flex-1">
            <Button
              label={t('farmer.products.publish')}
              onPress={() => void submitWithStatus('active')}
              loading={formState.isSubmitting || save.isPending}
              disabled={formState.isSubmitting || save.isPending}
            />
          </View>
        </View>
      </View>
    </FarmerPage>
  );
}

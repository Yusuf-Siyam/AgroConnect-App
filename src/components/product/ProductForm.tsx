import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, TouchableOpacity, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { TextField } from '@/components/common/TextField';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { farmerApiErrorKey, validationKey } from '@/features/farmer/errorMessages';
import { createUuid } from '@/features/farmer/id';
import { pickAndUploadProductImages, type UploadProgress } from '@/features/farmer/imageUpload';
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
  const [uploadError, setUploadError] = useState<TranslationKey | null>(null);
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const uploads = useQuery({ queryKey: ['uploads', 'config'], queryFn: getUploadConfig, staleTime: 60_000 });
  const uploadsEnabled = uploads.data?.enabled === true;

  const { control, handleSubmit, formState } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product ? toProductFormValues(product) : emptyValues,
  });

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

  const pickImages = async () => {
    if (!profile) return;
    if (!uploadsEnabled) {
      setUploadError('error.uploadNotConfigured');
      return;
    }
    setUploadError(null);
    try {
      const urls = await pickAndUploadProductImages(
        profile.uid,
        productId,
        MAX_IMAGES - images.length,
        setUploadProgress,
      );
      setImages((current) => [...current, ...urls].slice(0, MAX_IMAGES));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'CLOUDINARY_NOT_CONFIGURED') {
        setUploadError('error.uploadNotConfigured');
      } else {
        setUploadError(
          error instanceof Error && error.message.includes('5 MB') ? 'error.imageSize' : 'error.imageType',
        );
      }
    } finally {
      setUploadProgress(null);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setSaveError(null);
    try {
      await save.mutateAsync(values);
    } catch (error) {
      setSaveError(farmerApiErrorKey((error as { code?: string }).code));
    }
  });

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
          value={String(input.value)}
          onChangeText={input.onChange}
          onBlur={input.onBlur}
          error={fieldState.error ? t(validationKey(fieldState.error.message)) : undefined}
          {...options}
        />
      )}
    />
  );

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
            {field('category', t('common.category'))}
            {field('descriptionBn', t('common.description'), { multiline: true })}
            {field('descriptionEn', t('common.description'), { multiline: true })}
            {field('price', t('common.price'), { keyboardType: 'decimal-pad' })}
            {field('stock', t('common.stock'), { keyboardType: 'number-pad' })}
            {field('lowStockThreshold', t('common.lowStockThreshold'), { keyboardType: 'number-pad' })}
            {field('minOrderQty', t('common.minOrderQty'), { keyboardType: 'number-pad' })}

            <Controller
              control={control}
              name="unit"
              render={({ field: unitField }) => (
                <View className="gap-2">
                  <AppText variant="label">{t('common.unit')}</AppText>
                  <View className="flex-row flex-wrap gap-2">
                    {PRODUCT_UNITS.map((unit) => (
                      <Button
                        key={unit}
                        label={t(`unit.${unit}` as TranslationKey)}
                        variant={unitField.value === unit ? 'primary' : 'outline'}
                        onPress={() => unitField.onChange(unit)}
                      />
                    ))}
                  </View>
                </View>
              )}
            />

            <Controller
              control={control}
              name="status"
              render={({ field: statusField }) => (
                <View className="gap-2">
                  <AppText variant="label">{t('common.status')}</AppText>
                  <View className="flex-row flex-wrap gap-2">
                    {PRODUCT_STATUSES.map((status) => (
                      <Button
                        key={status}
                        label={t(`product.status.${status}` as TranslationKey)}
                        variant={statusField.value === status ? 'primary' : 'outline'}
                        onPress={() => statusField.onChange(status)}
                      />
                    ))}
                  </View>
                </View>
              )}
            />
          </Card>

          <Card className="gap-4">
            <AppText className="font-semibold">{t('farmer.products.harvestInfo')}</AppText>
            {field('harvestDate', t('common.harvestDate'), { placeholder: t('common.datePlaceholder') })}
            {field('district', t('common.district'))}
            {field('variety', t('common.variety'))}
          </Card>

          <Card className="gap-4">
            <AppText className="font-semibold">{t('farmer.products.imageInfo')}</AppText>
            <AppText variant="caption">{t('farmer.products.imageLimit')}</AppText>
            <View className="flex-row flex-wrap gap-2">
              {images.map((uri, index) => (
                <TouchableOpacity
                  key={`${uri}-${index}`}
                  onPress={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Image source={{ uri }} className="h-20 w-20 rounded-xl bg-canvas" />
                </TouchableOpacity>
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
            {uploadError ? <AppText variant="error">{t(uploadError)}</AppText> : null}
            <Button
              label={t('farmer.products.addImages')}
              variant="outline"
              disabled={!uploadsEnabled || images.length >= MAX_IMAGES}
              onPress={() => void pickImages()}
            />
            {!uploadsEnabled ? <AppText variant="caption" className="text-amber-700">{t('error.uploadNotConfigured')}</AppText> : null}
          </Card>

          {saveError ? <AppText variant="error">{t(saveError)}</AppText> : null}
          <Button
            label={t('farmer.products.saveAction')}
            onPress={onSubmit}
            loading={formState.isSubmitting || save.isPending}
          />
      </View>
    </FarmerPage>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';

import { StateView } from '@/components/common/StateView';
import { FarmerPage } from '@/components/farmer/FarmerPage';
import { ProductForm } from '@/components/product/ProductForm';
import { farmerApiErrorKey } from '@/features/farmer/errorMessages';
import { getProduct } from '@/features/farmer/productService';
import { useTranslation } from '@/i18n';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const product = useQuery({
    queryKey: ['farmer', 'product', id],
    queryFn: () => getProduct(id),
    enabled: Boolean(id),
  });

  if (product.isPending) {
    return (
      <FarmerPage title={t('farmer.products.editTitle')}>
        <StateView state="loading" />
      </FarmerPage>
    );
  }

  if (product.isError || !product.data) {
    return (
      <FarmerPage title={t('farmer.products.editTitle')}>
        <StateView
          state="error"
          message={t(farmerApiErrorKey((product.error as { code?: string }).code))}
          onRetry={() => void product.refetch()}
        />
      </FarmerPage>
    );
  }

  return <ProductForm product={product.data} />;
}

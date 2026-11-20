import { PRODUCT_CATEGORIES } from '../constants/categories';
import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type { CategoryResponse, FarmerProfile, RatingSummary } from '../types/marketplace';
import type { ProductListResponse } from '../types/product';
import type { MarketplaceQuery } from '../validators/marketplace';
import { parseStoredProduct } from './product';

function productsCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('products');
}

export function listCategories(): CategoryResponse {
  return { items: PRODUCT_CATEGORIES.map((category) => ({ ...category })) };
}

/**
 * Buyer-facing marketplace. Only active, non-deleted products are queried and
 * zero-stock listings are always hidden. `inStock` is accepted for filter
 * compatibility but cannot expose hidden products.
 */
export async function listMarketplaceProducts(query: MarketplaceQuery): Promise<ProductListResponse> {
  const snapshot = await productsCollection()
    .where('deleted', '==', false)
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc')
    .get();

  const needle = query.search?.toLocaleLowerCase();
  const districtNeedle = query.district?.toLocaleLowerCase();

  const products = snapshot.docs
    .map((document) => parseStoredProduct(document.data()))
    .filter((product) => {
      if (query.inStock !== false && product.stock <= 0) return false;
      if (query.category && product.category !== query.category) return false;
      if (query.unit && product.unit !== query.unit) return false;
      if (query.minPrice !== undefined && product.price < query.minPrice) return false;
      if (query.maxPrice !== undefined && product.price > query.maxPrice) return false;
      if (
        districtNeedle &&
        !product.harvestInfo.district.toLocaleLowerCase().includes(districtNeedle)
      ) {
        return false;
      }
      if (!needle) return true;
      return [product.name.bn, product.name.en, product.category, product.harvestInfo.variety]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle);
    });

  if (query.sort === 'price_asc') {
    products.sort((left, right) => left.price - right.price);
  } else if (query.sort === 'price_desc') {
    products.sort((left, right) => right.price - left.price);
  }

  return {
    items: products.slice(query.offset, query.offset + query.limit),
    total: products.length,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Only the safe, public subset of a farmer's profile is ever returned. */
export async function getPublicFarmerProfile(farmerId: string): Promise<FarmerProfile> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore.collection('users').doc(farmerId).get();
  if (!snapshot.exists || snapshot.get('role') !== 'farmer') {
    throw new HttpError(404, 'FARMER_NOT_FOUND', 'Farmer profile not found.');
  }

  const data = snapshot.data() ?? {};
  const rating = data.ratingSummary as RatingSummary | undefined;
  const ratingSummary: RatingSummary = {
    average:
      typeof rating?.average === 'number' && Number.isFinite(rating.average)
        ? rating.average
        : 0,
    count:
      typeof rating?.count === 'number' && Number.isInteger(rating.count) && rating.count >= 0
        ? rating.count
        : 0,
  };

  const activeProducts = await productsCollection()
    .where('sellerId', '==', farmerId)
    .where('deleted', '==', false)
    .where('status', '==', 'active')
    .get();

  const profile: FarmerProfile = {
    id: farmerId,
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    ratingSummary,
    productCount: activeProducts.size,
  };

  const district = data.district;
  if (typeof district === 'string' && district.trim()) profile.district = district;
  const photoURL = data.photoURL;
  if (typeof photoURL === 'string' && photoURL.trim()) profile.photoURL = photoURL;

  return profile;
}


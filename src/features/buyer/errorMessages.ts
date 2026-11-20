import type { TranslationKey } from '@/i18n';

const apiErrorKeys: Record<string, TranslationKey> = {
  'api/not-configured': 'error.apiNotConfigured',
  NETWORK_ERROR: 'error.network',
  VALIDATION_ERROR: 'error.productValidation',
  INVALID_RESPONSE: 'error.invalidResponse',
  UNAUTHORIZED: 'error.unauthorized',
  FORBIDDEN: 'error.forbidden',
  PRODUCT_NOT_FOUND: 'error.productNotFound',
  FARMER_NOT_FOUND: 'error.farmerNotFound',
  CART_ITEM_UNAVAILABLE: 'error.cartItemUnavailable',
  CART_EMPTY: 'error.cartEmpty',
  PRODUCT_UNAVAILABLE: 'error.productUnavailable',
  INSUFFICIENT_STOCK: 'error.insufficientCartStock',
  MIN_ORDER_QTY: 'error.minOrderQty',
  OWN_PRODUCT: 'error.ownProduct',
  INVALID_ORDER_TRANSITION: 'error.invalidOrderTransition',
  ORDER_NOT_FOUND: 'error.orderNotFound',
  DUPLICATE_WISHLIST: 'error.duplicateWishlist',
  REVIEW_NOT_ELIGIBLE: 'error.reviewNotEligible',
  REVIEW_DUPLICATE: 'error.reviewDuplicate',
  INVALID_RATING: 'error.ratingInvalid',
};

export function buyerApiErrorKey(code: string | undefined): TranslationKey {
  return (code && apiErrorKeys[code]) || 'error.generic';
}

import type { EmergencyListing } from '../types/emergencyListing';
import type { Product } from '../types/product';

export type EffectivePrice = {
  unitPrice: number;
  baseUnitPrice: number;
  discountPercent?: number;
  emergencyListingId?: string;
  priceSource: 'base' | 'emergency';
};

function isListingActive(listing: EmergencyListing | null | undefined, now: Date): listing is EmergencyListing {
  if (!listing) return false;
  if (listing.status !== 'active') return false;
  if (listing.availableQty <= listing.soldQty) return false;
  return new Date(listing.expiresAt).getTime() > now.getTime();
}

export function getEffectiveProductPrice(
  product: Pick<Product, 'id' | 'price'>,
  listing: EmergencyListing | null | undefined,
  now = new Date(),
): EffectivePrice {
  if (isListingActive(listing, now) && listing.productId === product.id) {
    return {
      unitPrice: listing.discountedPrice,
      baseUnitPrice: product.price,
      discountPercent: listing.discountPercent,
      emergencyListingId: listing.id,
      priceSource: 'emergency',
    };
  }

  return {
    unitPrice: product.price,
    baseUnitPrice: product.price,
    priceSource: 'base',
  };
}

import { Redirect } from 'expo-router';

/** Hidden anchor for deep-linked product details; the marketplace is the real list. */
export default function BuyerProductAnchor() {
  return <Redirect href="/buyer" />;
}

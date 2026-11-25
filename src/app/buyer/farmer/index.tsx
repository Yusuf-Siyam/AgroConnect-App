import { Redirect } from 'expo-router';

/** Hidden anchor for deep-linked farmer profiles. */
export default function BuyerFarmerAnchor() {
  return <Redirect href="/buyer" />;
}

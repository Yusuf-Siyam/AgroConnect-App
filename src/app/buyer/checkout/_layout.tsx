import { Stack } from 'expo-router';

/** Checkout is a pushed form, not a bottom tab. */
export const unstable_settings = {
  anchor: 'index',
};

export default function BuyerCheckoutLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

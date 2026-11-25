import { Stack } from 'expo-router';

/** Product form/detail screens always have the product list underneath them. */
export const unstable_settings = {
  anchor: 'index',
};

export default function FarmerProductsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

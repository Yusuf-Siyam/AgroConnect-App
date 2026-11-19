// Expo inlines statically referenced EXPO_PUBLIC_* variables at build time.
// Only non-secret values may be placed in these variables.
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export const env = {
  apiBaseUrl,
  isApiConfigured: apiBaseUrl.length > 0,
} as const;

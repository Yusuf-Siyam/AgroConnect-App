import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_VERSION = 1;

export interface PhotoConsentStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function storageKey(uid: string): string {
  return `agroconnect.ai.photoSuggestionConsent.v${CONSENT_VERSION}.${uid}`;
}

/** Returns false when storage is unavailable so consent is never assumed. */
export async function hasPhotoSuggestionConsent(
  uid: string,
  storage: PhotoConsentStorage = AsyncStorage,
): Promise<boolean> {
  try {
    return (await storage.getItem(storageKey(uid))) === 'accepted';
  } catch {
    return false;
  }
}

/** Returns false if the one-time acknowledgement could not be persisted. */
export async function acceptPhotoSuggestionConsent(
  uid: string,
  storage: PhotoConsentStorage = AsyncStorage,
): Promise<boolean> {
  try {
    await storage.setItem(storageKey(uid), 'accepted');
    return true;
  } catch {
    return false;
  }
}

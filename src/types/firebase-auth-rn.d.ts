// TypeScript resolves `firebase/auth` through the package's top-level "types"
// entry (web build), where this React Native-only helper is not declared.
// Metro resolves the same import to @firebase/auth's "react-native" build on
// iOS/Android, where the helper does exist. This declaration bridges the two.
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  type AsyncStorageLike = {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };

  export function getReactNativePersistence(storage: AsyncStorageLike): Persistence;
}

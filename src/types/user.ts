import type { Href } from 'expo-router';

export const ROLES = ['farmer', 'buyer', 'transporter', 'admin'] as const;

/** Roles a user may select during public registration. Admin is provisioned server-side. */
export const PUBLIC_REGISTER_ROLES = ['farmer', 'buyer', 'transporter'] as const;

export type Role = (typeof ROLES)[number];

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string;
  phoneNumber?: string;
  /** Optional home district, used as the manual weather fallback. */
  district?: string;
  role: Role;
  isVerified: boolean;
  /** Optional account state used by route guards; absent means active. */
  isActive?: boolean;
  accountStatus?: 'active' | 'suspended';
  preferredLanguage?: 'bn' | 'en';
  vehicle?: {
    type: string;
    registrationNumber: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Runtime paths stay canonical (`/farmer`, `/buyer`, ...). Expo's generated
 * typed-route union may expose them as `/farmer/index`, so the narrow literals
 * are asserted as Href for navigation while runtime behavior is unchanged.
 */
export type RoleHome = Href;

export function homePathForRole(role?: Role | null): RoleHome {
  switch (role) {
    case 'farmer':
      return '/farmer' as Href;
    case 'buyer':
      return '/buyer' as Href;
    case 'transporter':
      return '/transporter' as Href;
    case 'admin':
      return '/admin' as Href;
    default:
      return '/login' as Href;
  }
}

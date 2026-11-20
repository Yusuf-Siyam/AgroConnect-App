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
  preferredLanguage?: 'bn' | 'en';
  vehicle?: {
    type: string;
    registrationNumber: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type RoleHome =
  | '/farmer/index'
  | '/buyer/index'
  | '/transporter/index'
  | '/admin/index'
  | '/login';

export function homePathForRole(role?: Role | null): RoleHome {
  switch (role) {
    case 'farmer':
      return '/farmer/index';
    case 'buyer':
      return '/buyer/index';
    case 'transporter':
      return '/transporter/index';
    case 'admin':
      return '/admin/index';
    default:
      return '/login';
  }
}

export const ROLES = ['farmer', 'buyer', 'transporter', 'admin'] as const;

export type Role = (typeof ROLES)[number];

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string;
  phoneNumber?: string;
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
  | '/farmer'
  | '/buyer'
  | '/transporter'
  | '/admin'
  | '/login';

export function homePathForRole(role?: Role | null): RoleHome {
  switch (role) {
    case 'farmer':
      return '/farmer';
    case 'buyer':
      return '/buyer';
    case 'transporter':
      return '/transporter';
    case 'admin':
      return '/admin';
    default:
      return '/login';
  }
}

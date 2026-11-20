export const ROLES = ['farmer', 'buyer', 'transporter', 'admin'] as const;

export type Role = (typeof ROLES)[number];

export type AuthenticatedUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: Role;
  claims: Record<string, unknown>;
};

export type UserProfileResponse = {
  uid: string;
  email: string | null;
  displayName: string;
  phoneNumber?: string;
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

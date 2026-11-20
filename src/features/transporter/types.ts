export const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type TransporterProfile = {
  transporterId: string;
  name: string;
  phone: string;
  district: string;
  vehicleType: string;
  plateNumber: string;
  capacityKg: number;
  verificationStatus: VerificationStatus;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryCoordinates = {
  latitude?: number;
  longitude?: number;
};

export type DeliveryLocation = DeliveryCoordinates & {
  recordedAt: string;
};

export type DeliveryJob = {
  id: string;
  orderId: string;
  buyerId: string;
  farmerId: string;
  pickup: { farmerId: string; addressLine?: string; district?: string } & DeliveryCoordinates;
  dropoff: {
    buyerId: string;
    addressLine?: string;
    district?: string;
    phoneNumber?: string;
  } & DeliveryCoordinates;
  totalWeightKg: number;
  distanceKm: number | null;
  deliveryFee: number;
  commission: number;
  netAmount: number;
  transporterId: string | null;
  orderStatus: string;
  location?: DeliveryLocation;
  rejectedBy: string[];
  deliveryCode: string | null;
  codeAttempts: number;
  codeLockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryJobList = {
  items: DeliveryJob[];
  total: number;
  limit: number;
  offset: number;
};

export type BuyerDelivery = {
  orderId: string;
  orderStatus: string;
  transporterId: string | null;
  deliveryCode: string | null;
  location: DeliveryLocation | null;
};

export type EarningsRecord = {
  id: string;
  transporterId: string;
  orderId: string;
  jobId: string;
  deliveryFee: number;
  commission: number;
  netAmount: number;
  createdAt: string;
  updatedAt: string;
};

export type EarningsSummary = {
  totalDeliveries: number;
  totalDeliveryFee: number;
  totalCommission: number;
  totalNetAmount: number;
};

export type EarningsHistory = {
  items: EarningsRecord[];
  total: number;
  limit: number;
  offset: number;
};

export const ACTIVE_DELIVERY_STATUSES = ['shipment_accepted', 'collected', 'shipped'] as const;

export const GROUP_PURCHASE_STATUSES = ['open', 'successful', 'failed', 'cancelled'] as const;
export type GroupPurchaseStatus = (typeof GROUP_PURCHASE_STATUSES)[number];

export const GROUP_PARTICIPANT_STATUSES = ['joined', 'cancelled'] as const;
export type GroupParticipantStatus = (typeof GROUP_PARTICIPANT_STATUSES)[number];

export type GroupPurchase = {
  id: string;
  creatorId: string;
  farmerId: string;
  productId: string;
  unit: string;
  targetQuantity: number;
  quantityPerParticipant: number;
  discountPercent: number;
  maxParticipants: number;
  deadline: string;
  status: GroupPurchaseStatus;
  participantCount: number;
  committedQuantity: number;
  createdAt: string;
  updatedAt: string;
};

export type GroupParticipant = {
  groupId: string;
  buyerId: string;
  orderId: string;
  quantity: number;
  joinedAt: string;
  status: GroupParticipantStatus;
};

export type GroupPurchaseListResponse = {
  items: GroupPurchase[];
  total: number;
  limit: number;
  offset: number;
};

export type GroupPurchaseJoinResponse = {
  group: GroupPurchase;
  participant: GroupParticipant;
  orderId: string;
};

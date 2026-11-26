import { z } from 'zod';

import { api } from '@/services/api';

const participantSchema = z.object({
  groupId: z.string(),
  buyerId: z.string(),
  quantity: z.number(),
  joinedAt: z.string(),
  status: z.enum(['joined', 'cancelled']),
}).nullable();

const groupSchema = z.object({
  id: z.string(),
  creatorId: z.string(),
  farmerId: z.string(),
  productId: z.string(),
  unit: z.string(),
  targetQuantity: z.number(),
  quantityPerParticipant: z.number(),
  discountPercent: z.number(),
  maxParticipants: z.number(),
  deadline: z.string(),
  status: z.enum(['open', 'successful', 'failed', 'cancelled']),
  participantCount: z.number(),
  committedQuantity: z.number(),
  failureReason: z.enum(['stock_unavailable']).optional(),
  myParticipant: participantSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const joinResponseSchema = z.object({
  group: groupSchema,
  participant: z.object({
    groupId: z.string(),
    buyerId: z.string(),
    quantity: z.number(),
    joinedAt: z.string(),
    status: z.enum(['joined', 'cancelled']),
  }),
});

const listSchema = z.object({
  items: z.array(groupSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type GroupPurchase = z.infer<typeof groupSchema>;
export type GroupPurchaseList = z.infer<typeof listSchema>;
export type GroupJoinResponse = z.infer<typeof joinResponseSchema>;
export type GroupPurchaseQuery = {
  status?: GroupPurchase['status'];
  limit?: number;
  offset?: number;
};

function queryParams(query: GroupPurchaseQuery) {
  return {
    ...(query.status ? { status: query.status } : {}),
    limit: query.limit ?? 20,
    offset: query.offset ?? 0,
  };
}

export async function listGroupPurchases(query: GroupPurchaseQuery = {}): Promise<GroupPurchaseList> {
  const res = await api.get<unknown>('/api/group-purchases', { params: queryParams(query) });
  return listSchema.parse(res.data);
}

export async function getGroupPurchase(groupId: string): Promise<GroupPurchase> {
  const res = await api.get<unknown>(`/api/group-purchases/${groupId}`);
  return groupSchema.parse(res.data);
}

export async function joinGroupPurchase(groupId: string, quantity?: number): Promise<GroupJoinResponse> {
  const res = await api.post<unknown>(
    `/api/group-purchases/${groupId}/join`,
    quantity ? { quantity } : {},
  );
  return joinResponseSchema.parse(res.data);
}

export async function leaveGroupPurchase(groupId: string): Promise<GroupPurchase> {
  const res = await api.post<unknown>(`/api/group-purchases/${groupId}/leave`, {});
  return groupSchema.parse(res.data);
}

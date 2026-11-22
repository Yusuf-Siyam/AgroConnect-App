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
export type GroupJoinResponse = z.infer<typeof joinResponseSchema>;

export async function listGroupPurchases(params?: { status?: string }): Promise<GroupPurchase[]> {
  const query = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
  const res = await api.get<unknown>(`/api/group-purchases${query}`);
  return listSchema.parse(res).items;
}

export async function getGroupPurchase(groupId: string): Promise<GroupPurchase> {
  return groupSchema.parse(await api.get<unknown>(`/api/group-purchases/${groupId}`));
}

export async function joinGroupPurchase(groupId: string, quantity?: number): Promise<GroupJoinResponse> {
  return joinResponseSchema.parse(await api.post<unknown>(`/api/group-purchases/${groupId}/join`, quantity ? { quantity } : {}));
}

export async function leaveGroupPurchase(groupId: string): Promise<GroupPurchase> {
  return groupSchema.parse(await api.post<unknown>(`/api/group-purchases/${groupId}/leave`, {}));
}

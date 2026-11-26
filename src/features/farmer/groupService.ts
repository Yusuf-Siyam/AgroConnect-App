import { z } from 'zod';

import { api } from '@/services/api';

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
  createdAt: z.string(),
  updatedAt: z.string(),
});

const listSchema = z.object({ items: z.array(groupSchema), total: z.number(), limit: z.number(), offset: z.number() });

export type FarmerGroupPurchase = z.infer<typeof groupSchema>;
export type FarmerGroupPurchaseList = z.infer<typeof listSchema>;
export type FarmerGroupPurchaseQuery = {
  status?: FarmerGroupPurchase['status'];
  limit?: number;
  offset?: number;
};

function queryParams(query: FarmerGroupPurchaseQuery) {
  return {
    ...(query.status ? { status: query.status } : {}),
    limit: query.limit ?? 20,
    offset: query.offset ?? 0,
  };
}

export async function listMyGroupPurchases(
  query: FarmerGroupPurchaseQuery = {},
): Promise<FarmerGroupPurchaseList> {
  const res = await api.get<unknown>('/api/group-purchases/mine', { params: queryParams(query) });
  return listSchema.parse(res.data);
}

export async function createGroupPurchase(input: {
  productId: string;
  targetQuantity: number;
  quantityPerParticipant: number;
  discountPercent: number;
  maxParticipants: number;
  deadlineInDays: number;
}): Promise<FarmerGroupPurchase> {
  const res = await api.post<unknown>('/api/group-purchases', input);
  return groupSchema.parse(res.data);
}

export async function cancelGroupPurchase(groupId: string): Promise<FarmerGroupPurchase> {
  const res = await api.post<unknown>(`/api/group-purchases/${groupId}/cancel`, {});
  return groupSchema.parse(res.data);
}

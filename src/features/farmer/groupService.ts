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

export async function listMyGroupPurchases(): Promise<FarmerGroupPurchase[]> {
  const res = await api.get<unknown>('/api/group-purchases');
  return listSchema.parse(res).items;
}

export async function createGroupPurchase(input: {
  productId: string;
  targetQuantity: number;
  quantityPerParticipant: number;
  discountPercent: number;
  maxParticipants: number;
  deadlineInDays: number;
}): Promise<FarmerGroupPurchase> {
  return groupSchema.parse(await api.post<unknown>('/api/group-purchases', input));
}

export async function cancelGroupPurchase(groupId: string): Promise<FarmerGroupPurchase> {
  return groupSchema.parse(await api.post<unknown>(`/api/group-purchases/${groupId}/cancel`, {}));
}

import { z } from 'zod';

const componentSchema = z.object({
  weight: z.number(),
  componentScore: z.number(),
});

export const farmerReputationSchema = z.object({
  farmerId: z.string(),
  score: z.number().nullable(),
  isNew: z.boolean(),
  reviewCount: z.number().int().min(0),
  deliveredCount: z.number().int().min(0),
  cancelledCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  breakdown: z.object({
    rating: componentSchema.extend({ averageRating: z.number() }),
    delivered: componentSchema.extend({
      deliveredCount: z.number().int().min(0),
      decisionCount: z.number().int().min(0),
    }),
    cancelReject: componentSchema.extend({
      cancelledCount: z.number().int().min(0),
      rejectedCount: z.number().int().min(0),
      decisionCount: z.number().int().min(0),
    }),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReputationComponent = z.infer<typeof componentSchema>;
export type FarmerReputation = z.infer<typeof farmerReputationSchema>;

/** The API already masks the score for new farmers; keep that rule in one place. */
export function displayReputationScore(reputation: FarmerReputation): number | null {
  return reputation.isNew ? null : reputation.score;
}

export function weightPercent(component: ReputationComponent): number {
  return Math.round(component.weight * 100);
}

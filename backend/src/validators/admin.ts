import { z } from 'zod';

export const reputationRecomputeSchema = z
  .object({
    farmerId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  })
  .strict();

export type ReputationRecomputeInput = z.infer<typeof reputationRecomputeSchema>;

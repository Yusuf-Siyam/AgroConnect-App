export type ReputationComponent = {
  weight: number;
  componentScore: number;
};

export type ReputationBreakdown = {
  rating: ReputationComponent & { averageRating: number };
  delivered: ReputationComponent & { deliveredCount: number; decisionCount: number };
  cancelReject: ReputationComponent & {
    cancelledCount: number;
    rejectedCount: number;
    decisionCount: number;
  };
};

/**
 * Public, backend-computed reputation. `score` is null on the API when there
 * are too few reviews to display a number; the counts and breakdown remain.
 */
export type FarmerReputation = {
  farmerId: string;
  score: number | null;
  isNew: boolean;
  reviewCount: number;
  deliveredCount: number;
  cancelledCount: number;
  rejectedCount: number;
  breakdown: ReputationBreakdown;
  createdAt: string;
  updatedAt: string;
};

export type StoredFarmerReputation = Omit<FarmerReputation, 'score'> & { score: number };

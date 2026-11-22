import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculateReputationFromCounts } from './reputation';

describe('reputation calculation', () => {
  it('computes a stable 0-100 score from reviews and order outcomes', () => {
    const first = calculateReputationFromCounts('farmer-1', {
      reviewCount: 3,
      ratingTotal: 13,
      deliveredCount: 4,
      rejectedCount: 1,
      cancelledCount: 1,
    });
    const second = calculateReputationFromCounts('farmer-1', {
      reviewCount: 3,
      ratingTotal: 13,
      deliveredCount: 4,
      rejectedCount: 1,
      cancelledCount: 1,
    });

    assert.equal(first.score, 76.7);
    assert.deepEqual(first.breakdown, second.breakdown);
    assert.equal(first.isNew, false);
  });

  it('marks farmers below the review minimum as new without changing stored score math', () => {
    const reputation = calculateReputationFromCounts('farmer-2', {
      reviewCount: 2,
      ratingTotal: 9,
      deliveredCount: 5,
      rejectedCount: 0,
      cancelledCount: 0,
    });

    assert.equal(reputation.isNew, true);
    assert.equal(reputation.score, 95);
    assert.equal(reputation.breakdown.rating.averageRating, 4.5);
  });
});

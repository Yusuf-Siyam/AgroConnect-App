import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { displayReputationScore, weightPercent, type FarmerReputation } from './reputation';

function reputation(overrides: Partial<FarmerReputation> = {}): FarmerReputation {
  const component = { weight: 0.5, componentScore: 80 };
  return {
    farmerId: 'farmer-1',
    score: 72,
    isNew: false,
    reviewCount: 4,
    deliveredCount: 3,
    cancelledCount: 0,
    rejectedCount: 0,
    breakdown: {
      rating: { ...component, averageRating: 4 },
      delivered: { weight: 0.3, componentScore: 100, deliveredCount: 3, decisionCount: 3 },
      cancelReject: {
        weight: 0.2,
        componentScore: 100,
        cancelledCount: 0,
        rejectedCount: 0,
        decisionCount: 3,
      },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('farmer reputation display helpers', () => {
  it('hides the numeric score for a new farmer', () => {
    assert.equal(displayReputationScore(reputation({ isNew: true, score: 0 })), null);
  });

  it('shows the numeric score when the farmer has enough reviews', () => {
    assert.equal(displayReputationScore(reputation()), 72);
  });

  it('converts component weights to whole percentages', () => {
    assert.equal(weightPercent(reputation().breakdown.delivered), 30);
  });
});

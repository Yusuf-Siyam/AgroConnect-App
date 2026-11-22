/**
 * Phase 11 advanced-feature defaults.
 *
 * These placeholders are intentionally centralized here so the backend, tests
 * and the mobile offline-cache policy read the same owner-confirmable values.
 * They are not secrets. Expo only inlines statically referenced EXPO_PUBLIC_*
 * variables, which is why each variable is named explicitly below.
 */

export const ADVANCED_FEATURE_DEFAULTS = {
  reputation: {
    minReviews: 3,
    weights: {
      rating: 0.5,
      delivered: 0.3,
      cancelReject: 0.2,
    },
  },
  emergency: {
    minDiscountPercent: 5,
    maxDiscountPercent: 50,
    maxDurationHours: 72,
  },
  group: {
    minDiscountPercent: 5,
    maxDiscountPercent: 40,
    maxDurationDays: 7,
    maxParticipants: 50,
  },
  prediction: {
    minPoints: 20,
    windowDays: 30,
    maxAgeDays: 120,
    horizonDays: 7,
  },
  offlineCache: {
    maxAgeHours: 24,
  },
} as const;

function numberValue(
  name: string,
  raw: string | undefined,
  fallback: number,
  options: { min: number; max: number; integer?: boolean },
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${name}: expected a number`);
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`Invalid ${name}: expected an integer`);
  }
  if (value < options.min || value > options.max) {
    throw new Error(`Invalid ${name}: expected a value between ${options.min} and ${options.max}`);
  }
  return value;
}

const reputationWeights = {
  rating: numberValue(
    'REPUTATION_WEIGHT_RATING',
    process.env.REPUTATION_WEIGHT_RATING,
    ADVANCED_FEATURE_DEFAULTS.reputation.weights.rating,
    { min: 0, max: 1 },
  ),
  delivered: numberValue(
    'REPUTATION_WEIGHT_DELIVERED',
    process.env.REPUTATION_WEIGHT_DELIVERED,
    ADVANCED_FEATURE_DEFAULTS.reputation.weights.delivered,
    { min: 0, max: 1 },
  ),
  cancelReject: numberValue(
    'REPUTATION_WEIGHT_CANCEL_REJECT',
    process.env.REPUTATION_WEIGHT_CANCEL_REJECT,
    ADVANCED_FEATURE_DEFAULTS.reputation.weights.cancelReject,
    { min: 0, max: 1 },
  ),
};

const weightTotal = reputationWeights.rating + reputationWeights.delivered + reputationWeights.cancelReject;
if (Math.abs(weightTotal - 1) > 0.000001) {
  throw new Error('Invalid reputation weights: rating, delivered and cancelReject must sum to 1');
}

export const advancedFeatures = {
  reputation: {
    minReviews: numberValue(
      'REPUTATION_MIN_REVIEWS',
      process.env.REPUTATION_MIN_REVIEWS,
      ADVANCED_FEATURE_DEFAULTS.reputation.minReviews,
      { min: 1, max: 100, integer: true },
    ),
    weights: reputationWeights,
  },
  emergency: {
    minDiscountPercent: numberValue(
      'EMERGENCY_DISCOUNT_MIN_PERCENT',
      process.env.EMERGENCY_DISCOUNT_MIN_PERCENT,
      ADVANCED_FEATURE_DEFAULTS.emergency.minDiscountPercent,
      { min: 0, max: 100, integer: true },
    ),
    maxDiscountPercent: numberValue(
      'EMERGENCY_DISCOUNT_MAX_PERCENT',
      process.env.EMERGENCY_DISCOUNT_MAX_PERCENT,
      ADVANCED_FEATURE_DEFAULTS.emergency.maxDiscountPercent,
      { min: 0, max: 100, integer: true },
    ),
    maxDurationHours: numberValue(
      'EMERGENCY_LISTING_MAX_HOURS',
      process.env.EMERGENCY_LISTING_MAX_HOURS,
      ADVANCED_FEATURE_DEFAULTS.emergency.maxDurationHours,
      { min: 1, max: 24 * 30, integer: true },
    ),
  },
  group: {
    minDiscountPercent: numberValue(
      'GROUP_DISCOUNT_MIN_PERCENT',
      process.env.GROUP_DISCOUNT_MIN_PERCENT,
      ADVANCED_FEATURE_DEFAULTS.group.minDiscountPercent,
      { min: 0, max: 100, integer: true },
    ),
    maxDiscountPercent: numberValue(
      'GROUP_DISCOUNT_MAX_PERCENT',
      process.env.GROUP_DISCOUNT_MAX_PERCENT,
      ADVANCED_FEATURE_DEFAULTS.group.maxDiscountPercent,
      { min: 0, max: 100, integer: true },
    ),
    maxDurationDays: numberValue(
      'GROUP_PURCHASE_MAX_DAYS',
      process.env.GROUP_PURCHASE_MAX_DAYS,
      ADVANCED_FEATURE_DEFAULTS.group.maxDurationDays,
      { min: 1, max: 90, integer: true },
    ),
    maxParticipants: numberValue(
      'GROUP_PURCHASE_MAX_PARTICIPANTS',
      process.env.GROUP_PURCHASE_MAX_PARTICIPANTS,
      ADVANCED_FEATURE_DEFAULTS.group.maxParticipants,
      { min: 2, max: 1000, integer: true },
    ),
  },
  prediction: {
    minPoints: numberValue(
      'PRICE_PREDICTION_MIN_POINTS',
      process.env.PRICE_PREDICTION_MIN_POINTS,
      ADVANCED_FEATURE_DEFAULTS.prediction.minPoints,
      { min: 2, max: 1000, integer: true },
    ),
    windowDays: numberValue(
      'PRICE_PREDICTION_WINDOW_DAYS',
      process.env.PRICE_PREDICTION_WINDOW_DAYS,
      ADVANCED_FEATURE_DEFAULTS.prediction.windowDays,
      { min: 1, max: 365, integer: true },
    ),
    maxAgeDays: numberValue(
      'PRICE_PREDICTION_MAX_AGE_DAYS',
      process.env.PRICE_PREDICTION_MAX_AGE_DAYS,
      ADVANCED_FEATURE_DEFAULTS.prediction.maxAgeDays,
      { min: 1, max: 3650, integer: true },
    ),
    horizonDays: numberValue(
      'PRICE_PREDICTION_HORIZON_DAYS',
      process.env.PRICE_PREDICTION_HORIZON_DAYS,
      ADVANCED_FEATURE_DEFAULTS.prediction.horizonDays,
      { min: 1, max: 30, integer: true },
    ),
  },
  offlineCache: {
    maxAgeHours: numberValue(
      'OFFLINE_CACHE_MAX_AGE_HOURS',
      process.env.OFFLINE_CACHE_MAX_AGE_HOURS ?? process.env.EXPO_PUBLIC_OFFLINE_CACHE_MAX_AGE_HOURS,
      ADVANCED_FEATURE_DEFAULTS.offlineCache.maxAgeHours,
      { min: 1, max: 24 * 30, integer: true },
    ),
  },
} as const;

if (advancedFeatures.emergency.minDiscountPercent > advancedFeatures.emergency.maxDiscountPercent) {
  throw new Error('Invalid emergency discounts: minimum cannot exceed maximum');
}
if (advancedFeatures.group.minDiscountPercent > advancedFeatures.group.maxDiscountPercent) {
  throw new Error('Invalid group discounts: minimum cannot exceed maximum');
}

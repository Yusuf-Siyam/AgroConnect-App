export type RatingSummary = {
  /** Mean of all submitted ratings, rounded to one decimal place. */
  average: number;
  count: number;
};

export type FarmerProfile = {
  id: string;
  displayName: string;
  district?: string;
  photoURL?: string;
  ratingSummary: RatingSummary;
  productCount: number;
};

export type CategoryResponse = {
  items: { id: string; name: { bn: string; en: string } }[];
};

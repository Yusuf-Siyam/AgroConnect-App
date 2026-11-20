export type Category = {
  id: string;
  name: { bn: string; en: string };
};

/**
 * The single source of truth for marketplace categories. The mobile app reads
 * this list through GET /api/categories so labels stay identical in bn and en.
 */
export const PRODUCT_CATEGORIES: readonly Category[] = [
  { id: 'rice', name: { bn: 'চাল', en: 'Rice' } },
  { id: 'cereal', name: { bn: 'শস্য', en: 'Cereal' } },
  { id: 'vegetable', name: { bn: 'সবজি', en: 'Vegetable' } },
  { id: 'fruit', name: { bn: 'ফল', en: 'Fruit' } },
  { id: 'pulse', name: { bn: 'ডাল', en: 'Pulse' } },
  { id: 'spice', name: { bn: 'মসলা', en: 'Spice' } },
  { id: 'tuber', name: { bn: 'কন্দ', en: 'Tuber' } },
  { id: 'oilseed', name: { bn: 'তৈলবীজ', en: 'Oilseed' } },
  { id: 'fish', name: { bn: 'মাছ', en: 'Fish' } },
  { id: 'meat', name: { bn: 'মাংস', en: 'Meat' } },
  { id: 'egg', name: { bn: 'ডিম', en: 'Egg' } },
  { id: 'dairy', name: { bn: 'দুগ্ধ', en: 'Dairy' } },
  { id: 'herb', name: { bn: 'ভেষজ', en: 'Herb' } },
  { id: 'flower', name: { bn: 'ফুল', en: 'Flower' } },
  { id: 'fodder', name: { bn: 'পশুখাদ্য', en: 'Fodder' } },
  { id: 'other', name: { bn: 'অন্যান্য', en: 'Other' } },
] as const;

export const CATEGORY_IDS = PRODUCT_CATEGORIES.map((category) => category.id);

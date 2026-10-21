// Lower-case names of the HIGH_PROTEIN_IDS foods, kept out of foods.ts so the coach facts (loaded on Today)
// do not pull the whole food library into the first download. data.test.ts checks it matches foods.ts.
export const HIGH_PROTEIN_NAMES: string[] = [
  'chicken breast, cooked (skinless)', 'chicken thigh, cooked (skinless)', 'greek yogurt, plain (0% fat)', 'skyr, plain',
  'cottage cheese', 'whey protein powder', 'protein shake, whey with water', 'protein shake, whey with milk', 'protein bar',
  'quest protein bar (net carbs)', 'tuna, canned in water (drained)', 'salmon, cooked', 'salmon sashimi (raw)',
  'white fish, steamed (batang / cod / dory)', 'prawns, cooked', 'beef sirloin, lean, cooked', 'pork loin, cooked',
  'tofu, firm', 'tempeh', 'egg whites', 'fish soup with rice', 'sliced fish soup, no rice', 'fish soup with bee hoon',
  'chicken rice, no skin', 'steamed chicken (chicken rice stall)', 'chicken satay with peanut sauce',
  'half-boiled eggs (2, kopitiam)', 'grilled chicken salad (cafe)', 'salmon poke bowl', 'chicken caesar wrap',
  'subway 6" roasted chicken (wheat)', 'mixed veg rice, steamed fish + 2 veg',
]

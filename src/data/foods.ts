import type { FoodItem, Macros } from '../domain/types'

export type FoodOrigin = 'SG hawker' | 'SG cafe' | 'generic' | 'branded'

export interface FoodRecord {
  id: string
  name: string
  brandOrOrigin: FoodOrigin
  per100g: Macros
  servingG: number
  servingLabel: string
  tags: string[]
}

// Nutrition values are per 100 g. Singapore hawker/cafe values are HPB-style
// estimates (typical stall portions, Food Insights order of magnitude) and are
// tagged 'HPB-style estimate' so the UI can show them as estimates. Generic
// values follow USDA FoodData Central. Alcohol calories are included in kcal
// even though they do not appear in the macro columns.

export const SG_SOURCE_TAG = 'HPB-style estimate'

function f(
  id: string, name: string, origin: FoodOrigin,
  kcal: number, proteinG: number, carbsG: number, fatG: number,
  servingG: number, servingLabel: string, tags: string[],
): FoodRecord {
  const allTags = origin === 'SG hawker' || origin === 'SG cafe' ? [...tags, SG_SOURCE_TAG] : tags
  return { id, name, brandOrOrigin: origin, per100g: { kcal, proteinG, carbsG, fatG }, servingG, servingLabel, tags: allTags }
}

const SG_HAWKER: FoodRecord[] = [
  // Rice plates
  f('chicken_rice', 'Chicken rice', 'SG hawker', 150, 6.3, 19, 5.5, 400, '1 plate (Hainanese, steamed chicken)', ['rice', 'chicken', 'lunch', 'dinner', 'hawker', 'popular']),
  f('chicken_rice_roasted', 'Chicken rice, roasted chicken', 'SG hawker', 155, 6.5, 18.5, 6.2, 400, '1 plate', ['rice', 'chicken', 'lunch', 'dinner', 'hawker']),
  f('chicken_rice_no_skin', 'Chicken rice, no skin', 'SG hawker', 137, 7.1, 19.5, 3.7, 380, '1 plate (skinless steamed chicken)', ['rice', 'chicken', 'lunch', 'dinner', 'hawker', 'lean']),
  f('chicken_rice_rice_only', 'Chicken rice, rice only', 'SG hawker', 185, 3.5, 30, 5.5, 200, '1 plate of rice', ['rice', 'hawker', 'side']),
  f('steamed_chicken_hawker', 'Steamed chicken (chicken rice stall)', 'SG hawker', 200, 24, 0, 11, 100, '1 portion', ['chicken', 'hawker', 'high protein']),
  f('duck_rice', 'Braised duck rice', 'SG hawker', 155, 6.5, 19.5, 5.5, 400, '1 plate', ['rice', 'duck', 'lunch', 'dinner', 'hawker']),
  f('char_siew_rice', 'Char siew rice', 'SG hawker', 170, 7, 21, 6.3, 400, '1 plate', ['rice', 'pork', 'lunch', 'dinner', 'hawker']),
  f('nasi_lemak_wing', 'Nasi lemak with chicken wing', 'SG hawker', 200, 6.3, 23, 9.4, 350, '1 set (wing, egg, ikan bilis)', ['rice', 'chicken', 'breakfast', 'lunch', 'hawker', 'malay']),
  f('nasi_lemak_basic', 'Nasi lemak, basic (egg, ikan bilis)', 'SG hawker', 180, 4.8, 24, 7.2, 250, '1 packet', ['rice', 'breakfast', 'hawker', 'malay']),
  f('nasi_padang', 'Nasi padang (rice, rendang, veg)', 'SG hawker', 167, 6.7, 19, 7.1, 450, '1 plate', ['rice', 'beef', 'lunch', 'dinner', 'hawker', 'malay']),
  f('ayam_penyet', 'Ayam penyet with rice', 'SG hawker', 200, 8.8, 18.8, 10, 400, '1 plate', ['rice', 'chicken', 'fried', 'lunch', 'dinner', 'hawker', 'indonesian']),
  f('chicken_briyani', 'Chicken briyani', 'SG hawker', 178, 7.1, 21, 7.1, 450, '1 plate', ['rice', 'chicken', 'lunch', 'dinner', 'hawker', 'indian']),
  f('economy_rice_1meat_2veg', 'Economy rice, 1 meat + 2 veg', 'SG hawker', 144, 5.6, 17.8, 5.3, 450, '1 plate (cai png)', ['rice', 'mixed veg rice', 'cai png', 'lunch', 'dinner', 'hawker']),
  f('economy_rice_2veg', 'Economy rice, 2 veg only', 'SG hawker', 129, 2.9, 20, 4, 350, '1 plate (cai png)', ['rice', 'mixed veg rice', 'cai png', 'vegetarian', 'lunch', 'hawker']),
  f('mixed_veg_rice_fish', 'Mixed veg rice, steamed fish + 2 veg', 'SG hawker', 130, 6.5, 17, 3.8, 400, '1 plate (cai png)', ['rice', 'mixed veg rice', 'cai png', 'fish', 'lunch', 'dinner', 'hawker', 'lean']),
  f('mixed_veg_rice_egg_tofu', 'Mixed veg rice, egg + tofu + veg', 'SG hawker', 140, 6, 18, 4.8, 400, '1 plate (cai png)', ['rice', 'mixed veg rice', 'cai png', 'vegetarian', 'lunch', 'hawker']),
  f('bak_kut_teh_rice', 'Bak kut teh with rice', 'SG hawker', 100, 5.8, 10, 4, 600, '1 bowl + rice', ['soup', 'pork', 'rice', 'lunch', 'dinner', 'hawker']),
  f('kway_chap', 'Kway chap', 'SG hawker', 130, 6, 11, 7, 500, '1 set', ['noodles', 'pork', 'lunch', 'hawker']),
  f('chicken_porridge', 'Chicken porridge', 'SG hawker', 60, 3, 9, 1.2, 500, '1 bowl', ['porridge', 'chicken', 'breakfast', 'light', 'hawker']),
  f('fish_porridge', 'Sliced fish porridge', 'SG hawker', 58, 3.6, 8.5, 1, 500, '1 bowl', ['porridge', 'fish', 'breakfast', 'light', 'hawker', 'lean']),

  // Noodles
  f('laksa', 'Laksa', 'SG hawker', 120, 4.8, 11.6, 6, 500, '1 bowl', ['noodles', 'soup', 'coconut', 'lunch', 'hawker', 'popular']),
  f('mee_goreng', 'Mee goreng', 'SG hawker', 189, 5.7, 25.7, 7.1, 350, '1 plate', ['noodles', 'fried', 'lunch', 'dinner', 'hawker', 'indian']),
  f('char_kway_teow', 'Char kway teow', 'SG hawker', 196, 4.7, 22.4, 10, 380, '1 plate', ['noodles', 'fried', 'lunch', 'dinner', 'hawker', 'popular']),
  f('hokkien_mee', 'Hokkien mee', 'SG hawker', 177, 6.3, 21.4, 7.4, 350, '1 plate', ['noodles', 'fried', 'prawn', 'lunch', 'dinner', 'hawker']),
  f('bak_chor_mee_dry', 'Bak chor mee, dry', 'SG hawker', 170, 7.3, 20, 6.7, 300, '1 bowl', ['noodles', 'pork', 'minced meat noodles', 'breakfast', 'lunch', 'hawker']),
  f('bak_chor_mee_soup', 'Bak chor mee, soup', 'SG hawker', 89, 4.4, 11.1, 2.9, 450, '1 bowl', ['noodles', 'soup', 'pork', 'minced meat noodles', 'lunch', 'hawker']),
  f('wanton_mee_dry', 'Wanton mee, dry', 'SG hawker', 124, 4.8, 16.7, 4.5, 330, '1 plate', ['noodles', 'pork', 'char siew', 'lunch', 'hawker']),
  f('wanton_mee_soup', 'Wanton mee, soup', 'SG hawker', 85, 4, 12, 2.2, 500, '1 bowl', ['noodles', 'soup', 'pork', 'lunch', 'hawker']),
  f('ban_mian_soup', 'Ban mian, soup', 'SG hawker', 87, 4, 10.5, 3.3, 550, '1 bowl', ['noodles', 'soup', 'egg', 'lunch', 'dinner', 'hawker']),
  f('ban_mian_dry', 'Ban mian, dry (chilli)', 'SG hawker', 150, 6, 20, 5, 350, '1 bowl', ['noodles', 'egg', 'lunch', 'dinner', 'hawker']),
  f('mee_rebus', 'Mee rebus', 'SG hawker', 127, 4.4, 17.8, 4, 450, '1 bowl', ['noodles', 'gravy', 'breakfast', 'lunch', 'hawker', 'malay']),
  f('mee_siam', 'Mee siam', 'SG hawker', 116, 3.6, 18.2, 3.1, 450, '1 bowl', ['noodles', 'gravy', 'breakfast', 'lunch', 'hawker', 'malay']),
  f('mee_soto', 'Mee soto', 'SG hawker', 86, 4, 12, 2.4, 500, '1 bowl', ['noodles', 'soup', 'chicken', 'lunch', 'hawker', 'malay']),
  f('lontong', 'Lontong', 'SG hawker', 120, 3, 12, 6.6, 500, '1 bowl', ['rice cake', 'coconut', 'breakfast', 'hawker', 'malay']),
  f('fishball_noodle_soup', 'Fishball noodle soup', 'SG hawker', 80, 3.6, 12, 1.8, 500, '1 bowl', ['noodles', 'soup', 'fish', 'lunch', 'hawker', 'light']),
  f('prawn_mee_soup', 'Prawn mee, soup', 'SG hawker', 90, 4.4, 12, 2.6, 500, '1 bowl', ['noodles', 'soup', 'prawn', 'lunch', 'hawker']),
  f('fish_soup_rice', 'Fish soup with rice', 'SG hawker', 71, 4.7, 8.9, 1.1, 700, '1 bowl + rice', ['soup', 'fish', 'rice', 'sliced fish', 'lunch', 'dinner', 'hawker', 'lean', 'high protein', 'popular']),
  f('fish_soup_only', 'Sliced fish soup, no rice', 'SG hawker', 44, 5.6, 1.2, 1.6, 500, '1 bowl', ['soup', 'fish', 'sliced fish', 'lunch', 'dinner', 'hawker', 'lean', 'high protein']),
  f('fish_soup_bee_hoon', 'Fish soup with bee hoon', 'SG hawker', 63, 4.7, 7.5, 1.3, 600, '1 bowl', ['soup', 'fish', 'noodles', 'sliced fish', 'lunch', 'hawker', 'lean', 'high protein']),
  f('fried_fish_soup', 'Fried fish soup', 'SG hawker', 90, 5.2, 5, 5.2, 500, '1 bowl', ['soup', 'fish', 'fried', 'lunch', 'hawker']),
  f('yong_tau_foo_soup', 'Yong tau foo, soup with bee hoon (6 pcs)', 'SG hawker', 80, 4.4, 10, 2.4, 500, '1 bowl', ['soup', 'tofu', 'fish paste', 'noodles', 'lunch', 'hawker', 'light']),
  f('yong_tau_foo_pieces', 'Yong tau foo pieces only (6 pcs)', 'SG hawker', 104, 7.5, 5, 5.8, 240, '6 pieces', ['tofu', 'fish paste', 'lunch', 'hawker', 'lean']),

  // Indian / Malay breakfast
  f('roti_prata_plain', 'Roti prata, plain', 'SG hawker', 221, 5.3, 31.6, 8.4, 95, '1 piece', ['prata', 'breakfast', 'hawker', 'indian']),
  f('roti_prata_egg', 'Roti prata, egg', 'SG hawker', 223, 6.9, 23, 10.8, 130, '1 piece', ['prata', 'egg', 'breakfast', 'hawker', 'indian']),
  f('prata_curry', 'Prata curry (dhal/fish curry gravy)', 'SG hawker', 60, 3, 8, 2, 100, '1 small bowl', ['curry', 'gravy', 'side', 'hawker', 'indian']),
  f('thosai_plain', 'Thosai, plain', 'SG hawker', 130, 4, 24, 2, 100, '1 piece', ['thosai', 'dosa', 'breakfast', 'hawker', 'indian', 'light']),
  f('thosai_masala', 'Masala thosai', 'SG hawker', 165, 3.5, 27.5, 4.5, 200, '1 piece', ['thosai', 'dosa', 'potato', 'breakfast', 'hawker', 'indian']),
  f('chwee_kueh', 'Chwee kueh (4 pcs)', 'SG hawker', 160, 2, 22.5, 7, 200, '4 pieces', ['kueh', 'breakfast', 'hawker']),
  f('carrot_cake_white', 'Carrot cake, white (fried)', 'SG hawker', 188, 4, 22, 9.6, 250, '1 plate', ['carrot cake', 'chai tow kway', 'fried', 'breakfast', 'hawker']),
  f('carrot_cake_black', 'Carrot cake, black (sweet soy)', 'SG hawker', 200, 3.6, 27, 8.8, 250, '1 plate', ['carrot cake', 'chai tow kway', 'fried', 'breakfast', 'hawker']),
  f('popiah', 'Popiah', 'SG hawker', 106, 3.3, 15.6, 3.3, 180, '1 roll', ['snack', 'hawker', 'light']),
  f('curry_puff', 'Curry puff', 'SG hawker', 417, 8.3, 41.7, 25, 60, '1 puff', ['snack', 'fried', 'pastry', 'hawker']),
  f('satay_chicken', 'Chicken satay with peanut sauce', 'SG hawker', 200, 16, 8, 11.2, 250, '10 sticks + sauce', ['chicken', 'grilled', 'dinner', 'hawker', 'high protein', 'malay']),
  f('otah', 'Otah', 'SG hawker', 160, 12, 8, 9, 50, '1 piece', ['fish', 'snack', 'side', 'hawker']),
  f('fried_chicken_wing_hawker', 'Fried chicken wing (hawker)', 'SG hawker', 290, 20, 9, 19, 60, '1 wing', ['chicken', 'fried', 'side', 'hawker']),
  f('chicken_chop_western', 'Chicken chop with fries (hawker western)', 'SG hawker', 186, 11.4, 12.9, 9.4, 350, '1 plate', ['chicken', 'western', 'dinner', 'hawker']),
  f('fish_and_chips_hawker', 'Fish and chips (hawker western)', 'SG hawker', 188, 7.5, 17.5, 10, 400, '1 plate', ['fish', 'fried', 'western', 'dinner', 'hawker']),
  f('stir_fried_greens_hawker', 'Stir-fried greens (kailan / chye sim)', 'SG hawker', 65, 2.6, 4.5, 4.4, 150, '1 side plate', ['vegetables', 'side', 'hawker', 'cai png']),
  f('bak_kwa', 'Bak kwa', 'SG hawker', 370, 25, 25, 18, 57, '1 slice', ['pork', 'snack', 'sweet', 'hawker']),
  f('half_boiled_eggs', 'Half-boiled eggs (2, kopitiam)', 'SG hawker', 150, 12.8, 1.2, 10, 100, '2 eggs', ['egg', 'breakfast', 'kopitiam', 'high protein']),
  f('kaya_toast_set', 'Kaya toast set (2 toast, 2 eggs, kopi)', 'SG hawker', 124, 5.4, 11.5, 6.2, 380, '1 set', ['breakfast', 'kopitiam', 'toast', 'egg', 'kaya', 'set', 'popular']),
  f('kaya_butter_toast', 'Kaya butter toast (2 slices)', 'SG hawker', 312, 6.3, 42.5, 12.5, 80, '2 slices', ['breakfast', 'kopitiam', 'toast', 'kaya']),

  // Desserts / sweets
  f('tau_huay', 'Tau huay (soya beancurd), sweetened', 'SG hawker', 48, 2, 8, 0.8, 250, '1 bowl', ['dessert', 'soy', 'hawker', 'light']),
  f('chendol', 'Chendol', 'SG hawker', 148, 1.2, 25, 5, 250, '1 bowl', ['dessert', 'coconut', 'sweet', 'hawker']),
  f('ice_kacang', 'Ice kacang', 'SG hawker', 100, 1.5, 22, 1, 250, '1 bowl', ['dessert', 'sweet', 'hawker']),
  f('pandan_chiffon', 'Pandan chiffon cake', 'SG hawker', 283, 5, 40, 11, 60, '1 slice', ['cake', 'dessert', 'sweet', 'snack']),
  f('ondeh_ondeh', 'Ondeh-ondeh (3 pcs)', 'SG hawker', 250, 2.5, 45, 7, 60, '3 pieces', ['kueh', 'dessert', 'sweet', 'snack']),

  // Kopitiam drinks (kopi = coffee, teh = tea; O = no milk, C = evaporated milk, kosong = no sugar, siew dai = less sugar, peng = iced)
  f('kopi', 'Kopi (coffee, condensed milk)', 'SG hawker', 55, 1.5, 9.5, 1.5, 200, '1 cup', ['drink', 'coffee', 'kopi', 'kopitiam', 'sweet']),
  f('kopi_o', 'Kopi-O (black coffee, sugar)', 'SG hawker', 30, 0.1, 7.5, 0, 200, '1 cup', ['drink', 'coffee', 'kopi', 'kopitiam', 'black coffee']),
  f('kopi_o_kosong', 'Kopi-O kosong (black coffee, no sugar)', 'SG hawker', 2.5, 0.1, 0.4, 0, 200, '1 cup', ['drink', 'coffee', 'kopi', 'kopitiam', 'black coffee', 'zero', 'kosong']),
  f('kopi_c', 'Kopi-C (coffee, evaporated milk, sugar)', 'SG hawker', 42, 1.2, 8, 0.8, 200, '1 cup', ['drink', 'coffee', 'kopi', 'kopitiam']),
  f('kopi_c_kosong', 'Kopi-C kosong (evaporated milk, no sugar)', 'SG hawker', 20, 1.2, 2, 0.9, 200, '1 cup', ['drink', 'coffee', 'kopi', 'kopitiam', 'kosong']),
  f('kopi_siew_dai', 'Kopi siew dai (less sugar)', 'SG hawker', 45, 1.4, 7.5, 1.3, 200, '1 cup', ['drink', 'coffee', 'kopi', 'kopitiam']),
  f('kopi_o_siew_dai', 'Kopi-O siew dai (black, less sugar)', 'SG hawker', 20, 0.1, 5, 0, 200, '1 cup', ['drink', 'coffee', 'kopi', 'kopitiam', 'black coffee']),
  f('kopi_peng', 'Kopi peng (iced kopi)', 'SG hawker', 41, 1.1, 7.2, 1.1, 350, '1 cup (iced)', ['drink', 'coffee', 'kopi', 'kopitiam', 'iced', 'sweet']),
  f('teh', 'Teh (tea, condensed milk)', 'SG hawker', 52, 1.4, 9, 1.4, 200, '1 cup', ['drink', 'tea', 'teh', 'kopitiam', 'sweet']),
  f('teh_o', 'Teh-O (black tea, sugar)', 'SG hawker', 30, 0, 7.5, 0, 200, '1 cup', ['drink', 'tea', 'teh', 'kopitiam']),
  f('teh_o_kosong', 'Teh-O kosong (black tea, no sugar)', 'SG hawker', 1, 0, 0.3, 0, 200, '1 cup', ['drink', 'tea', 'teh', 'kopitiam', 'zero', 'kosong']),
  f('teh_c', 'Teh-C (tea, evaporated milk, sugar)', 'SG hawker', 40, 1.2, 7.5, 0.8, 200, '1 cup', ['drink', 'tea', 'teh', 'kopitiam']),
  f('teh_c_kosong', 'Teh-C kosong (evaporated milk, no sugar)', 'SG hawker', 18, 1.2, 1.8, 0.9, 200, '1 cup', ['drink', 'tea', 'teh', 'kopitiam', 'kosong']),
  f('teh_siew_dai', 'Teh siew dai (less sugar)', 'SG hawker', 40, 1.4, 6, 1.4, 200, '1 cup', ['drink', 'tea', 'teh', 'kopitiam']),
  f('teh_tarik', 'Teh tarik', 'SG hawker', 60, 1.6, 10.5, 1.6, 250, '1 cup', ['drink', 'tea', 'teh', 'kopitiam', 'sweet']),
  f('teh_peng', 'Teh peng (iced teh)', 'SG hawker', 40, 1.1, 7, 1.1, 350, '1 cup (iced)', ['drink', 'tea', 'teh', 'kopitiam', 'iced', 'sweet']),
  f('milo_kopitiam', 'Milo (kopitiam)', 'SG hawker', 76, 2.4, 13, 2, 250, '1 cup', ['drink', 'milo', 'kopitiam', 'sweet']),
  f('soya_milk_sweet', 'Soya bean milk, sweetened', 'SG hawker', 48, 2.5, 8, 1, 250, '1 cup', ['drink', 'soy', 'soya', 'kopitiam', 'sweet']),
  f('soya_milk_unsweet', 'Soya bean milk, unsweetened', 'SG hawker', 28, 2.8, 2, 1.2, 250, '1 cup', ['drink', 'soy', 'soya', 'kopitiam', 'kosong']),
  f('sugarcane_juice', 'Sugarcane juice', 'SG hawker', 45, 0, 11, 0, 400, '1 cup', ['drink', 'juice', 'sweet', 'hawker']),
  f('lime_juice_hawker', 'Lime juice (hawker)', 'SG hawker', 30, 0, 7.5, 0, 300, '1 cup', ['drink', 'juice', 'sweet', 'hawker']),
  f('barley_water', 'Barley water', 'SG hawker', 25, 0.2, 6, 0, 300, '1 cup', ['drink', 'sweet', 'hawker']),
]

const SG_CAFE: FoodRecord[] = [
  f('cafe_latte_sg', 'Cafe latte (SG cafe, 12 oz)', 'SG cafe', 51, 2.9, 4, 2.6, 350, '1 cup (12 oz)', ['drink', 'coffee', 'latte', 'cafe', 'milk']),
  f('oat_latte_sg', 'Oat milk latte (12 oz)', 'SG cafe', 49, 1.1, 5.7, 2, 350, '1 cup (12 oz)', ['drink', 'coffee', 'latte', 'cafe', 'oat milk']),
  f('iced_latte_sg', 'Iced latte (16 oz)', 'SG cafe', 38, 2.2, 3, 2, 400, '1 cup (16 oz)', ['drink', 'coffee', 'latte', 'cafe', 'iced']),
  f('cappuccino_sg', 'Cappuccino', 'SG cafe', 40, 2.2, 3.5, 2, 300, '1 cup', ['drink', 'coffee', 'cafe', 'milk']),
  f('avocado_toast', 'Avocado toast (cafe)', 'SG cafe', 210, 5, 17.5, 13, 200, '1 serve', ['brunch', 'cafe', 'toast', 'avocado']),
  f('eggs_benedict', 'Eggs benedict', 'SG cafe', 200, 8, 10, 13.7, 350, '1 plate', ['brunch', 'cafe', 'egg']),
  f('acai_bowl', 'Acai bowl', 'SG cafe', 113, 1.5, 20, 3, 400, '1 bowl', ['cafe', 'fruit', 'sweet', 'breakfast']),
  f('grilled_chicken_salad_cafe', 'Grilled chicken salad (cafe)', 'SG cafe', 120, 10.9, 4.3, 6.3, 350, '1 bowl', ['salad', 'chicken', 'cafe', 'lunch', 'high protein', 'lean']),
  f('salmon_poke_bowl', 'Salmon poke bowl', 'SG cafe', 133, 7.1, 15.6, 4.4, 450, '1 bowl', ['rice', 'salmon', 'cafe', 'lunch', 'high protein']),
  f('chicken_caesar_wrap', 'Chicken caesar wrap', 'SG cafe', 200, 11.7, 15, 10, 300, '1 wrap', ['wrap', 'chicken', 'cafe', 'lunch', 'high protein']),
  f('banana_bread_cafe', 'Banana bread (cafe slice)', 'SG cafe', 356, 5, 50, 15, 90, '1 slice', ['cake', 'cafe', 'sweet', 'snack']),
  f('croissant', 'Croissant', 'SG cafe', 414, 8, 45, 22, 70, '1 croissant', ['pastry', 'cafe', 'breakfast']),
  f('bubble_tea_pearls', 'Bubble milk tea with pearls (regular sugar)', 'SG cafe', 90, 1, 21, 1, 500, '1 cup (500 ml)', ['drink', 'bubble tea', 'boba', 'sweet']),
  f('bubble_tea_light', 'Milk tea, 30% sugar, no pearls', 'SG cafe', 36, 0.8, 8, 0.4, 500, '1 cup (500 ml)', ['drink', 'bubble tea', 'boba']),
  f('coconut_water', 'Coconut water', 'SG cafe', 20, 0.2, 4.5, 0, 300, '1 cup', ['drink', 'light']),
]

const GENERIC: FoodRecord[] = [
  // Protein sources
  f('egg_whole', 'Egg, whole', 'generic', 143, 12.6, 0.7, 9.5, 50, '1 large egg', ['egg', 'breakfast', 'protein']),
  f('egg_white', 'Egg whites', 'generic', 52, 10.9, 0.7, 0.2, 132, '4 egg whites', ['egg', 'protein', 'lean', 'high protein']),
  f('chicken_breast', 'Chicken breast, cooked (skinless)', 'generic', 165, 31, 0, 3.6, 150, '1 breast', ['chicken', 'protein', 'lean', 'high protein', 'lunch', 'dinner']),
  f('chicken_thigh', 'Chicken thigh, cooked (skinless)', 'generic', 209, 26, 0, 10.9, 150, '2 thighs', ['chicken', 'protein', 'high protein', 'lunch', 'dinner']),
  f('chicken_thigh_skin', 'Chicken thigh, roasted with skin', 'generic', 247, 25, 0, 16, 150, '2 thighs', ['chicken', 'protein', 'high protein', 'dinner']),
  f('salmon_cooked', 'Salmon, cooked', 'generic', 206, 22, 0, 12, 150, '1 fillet', ['fish', 'salmon', 'protein', 'high protein', 'omega-3', 'dinner']),
  f('salmon_sashimi', 'Salmon sashimi (raw)', 'generic', 208, 20, 0, 13, 100, '6–7 slices', ['fish', 'salmon', 'protein', 'high protein', 'japanese']),
  f('tuna_water', 'Tuna, canned in water (drained)', 'generic', 116, 25.5, 0, 0.8, 120, '1 can', ['fish', 'tuna', 'protein', 'lean', 'high protein', 'canned']),
  f('tuna_oil', 'Tuna, canned in oil (drained)', 'generic', 198, 29, 0, 8, 120, '1 can', ['fish', 'tuna', 'protein', 'high protein', 'canned']),
  f('white_fish', 'White fish, steamed (batang / cod / dory)', 'generic', 105, 23, 0, 1, 150, '1 fillet', ['fish', 'protein', 'lean', 'high protein', 'dinner']),
  f('prawns_cooked', 'Prawns, cooked', 'generic', 99, 24, 0.2, 0.3, 100, '8–10 prawns', ['seafood', 'prawn', 'protein', 'lean', 'high protein']),
  f('beef_sirloin', 'Beef sirloin, lean, cooked', 'generic', 200, 28, 0, 9, 150, '1 steak', ['beef', 'protein', 'high protein', 'dinner']),
  f('beef_mince', 'Beef mince (85% lean), cooked', 'generic', 250, 26, 0, 15, 150, '1 serve', ['beef', 'protein', 'high protein', 'dinner']),
  f('pork_loin', 'Pork loin, cooked', 'generic', 196, 27, 0, 9, 150, '1 chop', ['pork', 'protein', 'high protein', 'dinner']),
  f('tofu_firm', 'Tofu, firm', 'generic', 144, 17.3, 2.8, 8.7, 150, '1 block', ['tofu', 'soy', 'vegetarian', 'protein', 'high protein']),
  f('tofu_silken', 'Tofu, silken', 'generic', 55, 4.8, 2.4, 2.7, 150, '1 serve', ['tofu', 'soy', 'vegetarian', 'light']),
  f('tempeh', 'Tempeh', 'generic', 192, 20, 7.6, 10.8, 100, '1 serve', ['tempeh', 'soy', 'vegetarian', 'protein', 'high protein']),
  f('edamame', 'Edamame, shelled', 'generic', 121, 11.9, 8.9, 5.2, 100, '1 cup', ['soy', 'vegetarian', 'snack', 'protein']),
  f('greek_yogurt', 'Greek yogurt, plain (5%)', 'generic', 97, 9, 3.6, 5, 170, '1 tub', ['yogurt', 'dairy', 'breakfast', 'snack', 'protein']),
  f('greek_yogurt_0', 'Greek yogurt, plain (0% fat)', 'generic', 59, 10.3, 3.6, 0.4, 170, '1 tub', ['yogurt', 'dairy', 'breakfast', 'snack', 'protein', 'lean', 'high protein']),
  f('skyr', 'Skyr, plain', 'generic', 63, 11, 4, 0.2, 170, '1 tub', ['yogurt', 'dairy', 'breakfast', 'snack', 'protein', 'lean', 'high protein']),
  f('cottage_cheese', 'Cottage cheese', 'generic', 98, 11, 3.4, 4.3, 150, '1 serve', ['dairy', 'cheese', 'snack', 'protein', 'high protein']),
  f('whey_protein', 'Whey protein powder', 'generic', 400, 80, 8, 6, 30, '1 scoop', ['whey', 'protein powder', 'supplement', 'protein', 'high protein']),
  f('protein_shake_water', 'Protein shake, whey with water', 'generic', 36, 7.3, 0.7, 0.5, 330, '1 shake (1 scoop)', ['whey', 'shake', 'drink', 'supplement', 'protein', 'high protein']),
  f('protein_shake_milk', 'Protein shake, whey with milk', 'generic', 98, 11.4, 7.1, 3.8, 280, '1 shake (1 scoop + 250 ml milk)', ['whey', 'shake', 'drink', 'supplement', 'protein', 'high protein']),
  f('protein_bar', 'Protein bar', 'generic', 350, 33, 33, 11, 60, '1 bar', ['bar', 'snack', 'supplement', 'protein', 'high protein']),
  f('cheese_cheddar', 'Cheese, cheddar', 'generic', 403, 25, 1.3, 33, 30, '1 slice', ['dairy', 'cheese', 'snack']),
  f('chickpeas', 'Chickpeas, cooked', 'generic', 164, 8.9, 27, 2.6, 150, '1 cup', ['legumes', 'vegetarian', 'protein', 'fibre']),
  f('lentils', 'Lentils, cooked', 'generic', 116, 9, 20, 0.4, 150, '1 cup', ['legumes', 'vegetarian', 'protein', 'fibre']),
  f('dhal', 'Dhal (lentil curry)', 'generic', 100, 5.5, 13, 3, 150, '1 bowl', ['legumes', 'curry', 'vegetarian', 'indian']),
  f('hummus', 'Hummus', 'generic', 166, 8, 14, 10, 60, '1/4 cup', ['legumes', 'dip', 'vegetarian', 'snack']),

  // Carbs
  f('rice_white', 'Rice, white, cooked', 'generic', 130, 2.7, 28, 0.3, 200, '1 bowl', ['rice', 'carbs', 'staple']),
  f('rice_brown', 'Rice, brown, cooked', 'generic', 123, 2.7, 25.6, 1, 200, '1 bowl', ['rice', 'carbs', 'staple', 'fibre']),
  f('oats_dry', 'Oats, rolled (dry)', 'generic', 379, 13, 68, 6.5, 40, '1/2 cup dry', ['oats', 'breakfast', 'carbs', 'fibre']),
  f('oatmeal_cooked', 'Oatmeal, cooked with water', 'generic', 71, 2.5, 12, 1.5, 250, '1 bowl', ['oats', 'breakfast', 'carbs', 'fibre']),
  f('bread_white', 'Bread, white', 'generic', 265, 9, 49, 3.2, 30, '1 slice', ['bread', 'toast', 'carbs', 'breakfast']),
  f('bread_wholemeal', 'Bread, wholemeal', 'generic', 252, 12.5, 43, 3.5, 35, '1 slice', ['bread', 'toast', 'carbs', 'breakfast', 'fibre']),
  f('sweet_potato', 'Sweet potato, baked', 'generic', 90, 2, 20.7, 0.2, 150, '1 medium', ['carbs', 'vegetables', 'fibre']),
  f('potato_boiled', 'Potato, boiled', 'generic', 87, 1.9, 20, 0.1, 150, '1 medium', ['carbs', 'vegetables']),
  f('pasta_cooked', 'Pasta, cooked', 'generic', 158, 5.8, 31, 0.9, 200, '1 bowl', ['pasta', 'carbs', 'dinner']),
  f('egg_noodles_cooked', 'Egg noodles, cooked', 'generic', 138, 4.5, 25, 2.1, 200, '1 bowl', ['noodles', 'carbs']),
  f('quinoa_cooked', 'Quinoa, cooked', 'generic', 120, 4.4, 21.3, 1.9, 185, '1 cup', ['carbs', 'grain', 'fibre']),
  f('granola', 'Granola', 'generic', 471, 10, 64, 20, 50, '1/2 cup', ['breakfast', 'cereal', 'carbs']),
  f('muesli', 'Muesli', 'generic', 360, 10, 66, 6, 50, '1/2 cup', ['breakfast', 'cereal', 'carbs', 'fibre']),
  f('instant_noodles', 'Instant noodles (1 packet)', 'generic', 455, 10, 62, 20, 85, '1 packet (dry)', ['noodles', 'instant', 'carbs']),

  // Vegetables & fruit
  f('broccoli', 'Broccoli, cooked', 'generic', 35, 2.4, 7.2, 0.4, 100, '1 cup', ['vegetables', 'fibre', 'side']),
  f('spinach', 'Spinach, cooked', 'generic', 23, 3, 3.8, 0.3, 100, '1 cup', ['vegetables', 'fibre', 'side']),
  f('salad_greens', 'Mixed salad greens', 'generic', 20, 1.5, 3.5, 0.2, 80, '1 bowl', ['vegetables', 'salad', 'side']),
  f('cucumber', 'Cucumber', 'generic', 15, 0.7, 3.6, 0.1, 100, '1/2 cucumber', ['vegetables', 'side']),
  f('tomato', 'Tomato', 'generic', 18, 0.9, 3.9, 0.2, 120, '1 medium', ['vegetables', 'side']),
  f('avocado', 'Avocado', 'generic', 160, 2, 8.5, 14.7, 70, '1/2 avocado', ['fruit', 'fat', 'healthy fat']),
  f('banana', 'Banana', 'generic', 89, 1.1, 22.8, 0.3, 118, '1 medium', ['fruit', 'snack', 'carbs']),
  f('apple', 'Apple', 'generic', 52, 0.3, 13.8, 0.2, 180, '1 medium', ['fruit', 'snack']),
  f('orange', 'Orange', 'generic', 47, 0.9, 11.8, 0.1, 130, '1 medium', ['fruit', 'snack']),
  f('blueberries', 'Blueberries', 'generic', 57, 0.7, 14.5, 0.3, 100, '1 cup', ['fruit', 'berries', 'snack']),
  f('mixed_berries', 'Mixed berries (frozen)', 'generic', 45, 0.8, 10.5, 0.3, 100, '1 cup', ['fruit', 'berries', 'snack']),
  f('papaya', 'Papaya', 'generic', 43, 0.5, 10.8, 0.3, 150, '1 cup', ['fruit', 'snack']),
  f('watermelon', 'Watermelon', 'generic', 30, 0.6, 7.6, 0.2, 200, '1 wedge', ['fruit', 'snack']),
  f('mango', 'Mango', 'generic', 60, 0.8, 15, 0.4, 150, '1/2 mango', ['fruit', 'snack', 'sweet']),
  f('grapes', 'Grapes', 'generic', 69, 0.7, 18, 0.2, 100, '1 cup', ['fruit', 'snack', 'sweet']),

  // Fats, nuts, condiments
  f('peanut_butter', 'Peanut butter', 'generic', 588, 25, 20, 50, 32, '2 tbsp', ['nut butter', 'fat', 'snack', 'spread']),
  f('almonds', 'Almonds', 'generic', 579, 21, 22, 50, 28, '1 handful (28 g)', ['nuts', 'fat', 'snack']),
  f('cashews', 'Cashews', 'generic', 553, 18, 30, 44, 28, '1 handful (28 g)', ['nuts', 'fat', 'snack']),
  f('mixed_nuts', 'Mixed nuts', 'generic', 607, 20, 21, 54, 28, '1 handful (28 g)', ['nuts', 'fat', 'snack']),
  f('chia_seeds', 'Chia seeds', 'generic', 486, 16.5, 42, 31, 15, '1 tbsp', ['seeds', 'fibre', 'fat']),
  f('olive_oil', 'Olive oil', 'generic', 884, 0, 0, 100, 14, '1 tbsp', ['oil', 'fat', 'cooking']),
  f('butter', 'Butter', 'generic', 717, 0.9, 0.1, 81, 10, '1 pat', ['fat', 'spread', 'dairy']),
  f('honey', 'Honey', 'generic', 304, 0.3, 82, 0, 21, '1 tbsp', ['sweet', 'sugar', 'condiment']),
  f('sugar', 'Sugar, white', 'generic', 387, 0, 100, 0, 4, '1 tsp', ['sweet', 'sugar', 'condiment']),

  // Dairy & drinks
  f('milk_whole', 'Milk, whole', 'generic', 61, 3.2, 4.8, 3.3, 250, '1 glass', ['milk', 'dairy', 'drink']),
  f('milk_low_fat', 'Milk, low fat', 'generic', 42, 3.4, 5, 1, 250, '1 glass', ['milk', 'dairy', 'drink', 'lean']),
  f('oat_milk', 'Oat milk', 'generic', 45, 1, 6.5, 1.5, 250, '1 glass', ['milk', 'plant milk', 'drink', 'oat milk']),
  f('almond_milk', 'Almond milk, unsweetened', 'generic', 15, 0.5, 0.6, 1.1, 250, '1 glass', ['milk', 'plant milk', 'drink', 'light']),
  f('latte', 'Latte (whole milk, 12 oz)', 'generic', 51, 2.9, 4, 2.6, 350, '1 cup (12 oz)', ['drink', 'coffee', 'latte', 'milk']),
  f('flat_white', 'Flat white', 'generic', 60, 3.3, 4.5, 3, 200, '1 cup', ['drink', 'coffee', 'milk']),
  f('black_coffee', 'Black coffee / americano', 'generic', 2, 0.1, 0.4, 0, 250, '1 cup', ['drink', 'coffee', 'black coffee', 'zero']),
  f('espresso', 'Espresso', 'generic', 9, 0.1, 1.7, 0.2, 30, '1 shot', ['drink', 'coffee', 'zero']),
  f('green_tea', 'Green tea, unsweetened', 'generic', 1, 0, 0.2, 0, 250, '1 cup', ['drink', 'tea', 'zero']),
  f('orange_juice', 'Orange juice', 'generic', 45, 0.7, 10.4, 0.2, 250, '1 glass', ['drink', 'juice', 'sweet']),
  f('sports_drink', 'Isotonic sports drink', 'generic', 26, 0, 6.5, 0, 500, '1 bottle', ['drink', 'sweet', 'sports']),
  f('beer_lager', 'Beer, lager', 'generic', 43, 0.5, 3.6, 0, 330, '1 can / small bottle', ['alcohol', 'beer', 'drink']),
  f('beer_pint', 'Beer, lager (pint)', 'generic', 43, 0.5, 3.6, 0, 568, '1 pint', ['alcohol', 'beer', 'drink']),
  f('wine_red', 'Wine, red', 'generic', 85, 0.1, 2.6, 0, 150, '1 glass', ['alcohol', 'wine', 'drink']),
  f('wine_white', 'Wine, white', 'generic', 82, 0.1, 2.6, 0, 150, '1 glass', ['alcohol', 'wine', 'drink']),
  f('whisky', 'Whisky / spirits (40%)', 'generic', 250, 0, 0, 0, 45, '1 shot (45 ml)', ['alcohol', 'spirits', 'drink']),

  // Snacks, sweets, fast food
  f('dark_chocolate', 'Dark chocolate (70%)', 'generic', 598, 7.8, 46, 43, 20, '2 squares', ['chocolate', 'sweet', 'snack']),
  f('milk_chocolate', 'Milk chocolate', 'generic', 535, 7.7, 59, 30, 25, '1 small bar', ['chocolate', 'sweet', 'snack']),
  f('ice_cream', 'Ice cream, vanilla', 'generic', 207, 3.5, 24, 11, 70, '1 scoop', ['dessert', 'sweet', 'dairy']),
  f('potato_chips', 'Potato chips', 'generic', 536, 7, 53, 35, 30, '1 small bag', ['snack', 'salty', 'fried']),
  f('cookie', 'Cookie, chocolate chip', 'generic', 488, 5.5, 64, 24, 30, '1 cookie', ['sweet', 'snack', 'biscuit']),
  f('pizza_slice', 'Pizza, cheese (1 slice)', 'generic', 266, 11, 33, 10, 107, '1 slice', ['pizza', 'fast food', 'dinner']),
  f('cheeseburger', 'Cheeseburger (fast food)', 'generic', 252, 13, 27, 10, 120, '1 burger', ['burger', 'fast food']),
  f('fries', 'French fries', 'generic', 312, 3.4, 41, 15, 110, '1 medium', ['fries', 'fast food', 'fried']),
  f('chicken_nuggets', 'Chicken nuggets', 'generic', 296, 15, 16, 19, 96, '6 pieces', ['chicken', 'fast food', 'fried']),
  f('fried_chicken_fast_food', 'Fried chicken (fast food)', 'generic', 260, 20, 10, 16, 100, '1 piece', ['chicken', 'fast food', 'fried']),
  f('sushi_nigiri', 'Sushi, nigiri', 'generic', 150, 6, 22, 3.5, 40, '1 piece', ['sushi', 'rice', 'fish', 'japanese']),
]

const BRANDED: FoodRecord[] = [
  f('snickers', 'Snickers bar', 'branded', 488, 8.6, 60, 24, 50, '1 bar (50 g)', ['chocolate', 'sweet', 'snack', 'candy']),
  f('kitkat', 'KitKat (4 finger)', 'branded', 518, 6.5, 62, 27, 41, '1 bar (41 g)', ['chocolate', 'sweet', 'snack', 'candy']),
  f('coke', 'Coca-Cola', 'branded', 42, 0, 10.6, 0, 330, '1 can (330 ml)', ['drink', 'soda', 'sweet', 'coke']),
  f('coke_zero', 'Coke Zero / Diet Coke', 'branded', 0, 0, 0, 0, 330, '1 can (330 ml)', ['drink', 'soda', 'zero', 'coke']),
  f('hundred_plus', '100PLUS', 'branded', 27, 0, 6.5, 0, 325, '1 can (325 ml)', ['drink', 'sports', 'sweet', 'isotonic']),
  f('yakult', 'Yakult', 'branded', 62, 1.3, 15, 0, 80, '1 bottle (80 ml)', ['drink', 'probiotic', 'sweet', 'dairy']),
  f('milo_packet', 'Milo (packet drink)', 'branded', 60, 2, 10, 1.4, 200, '1 packet (200 ml)', ['drink', 'milo', 'sweet']),
  f('tiger_beer', 'Tiger beer', 'branded', 43, 0.4, 3.5, 0, 330, '1 can / bottle (330 ml)', ['alcohol', 'beer', 'drink']),
  f('starbucks_latte_grande', 'Starbucks latte, grande (whole milk)', 'branded', 47, 2.7, 4.3, 2.3, 470, '1 grande', ['drink', 'coffee', 'latte', 'milk', 'starbucks']),
  f('mcd_mcspicy', "McDonald's McSpicy", 'branded', 245, 10.5, 20, 13.5, 220, '1 burger', ['burger', 'fast food', 'chicken', 'fried']),
  f('mcd_big_mac', "McDonald's Big Mac", 'branded', 257, 12, 21, 14, 215, '1 burger', ['burger', 'fast food', 'beef']),
  f('subway_chicken_6', 'Subway 6" roasted chicken (wheat)', 'branded', 152, 10, 19, 3.5, 250, '1 six-inch sub', ['sandwich', 'chicken', 'fast food', 'high protein']),
  f('quest_bar', 'Quest protein bar (net carbs)', 'branded', 333, 35, 23, 13, 60, '1 bar (60 g)', ['bar', 'snack', 'supplement', 'protein', 'high protein', 'fibre']),
  f('meiji_yogurt', 'Meiji plain yogurt', 'branded', 62, 3.5, 4.8, 3.2, 140, '1 cup (140 g)', ['yogurt', 'dairy', 'snack']),
  f('marigold_hl_milk', 'Marigold HL milk', 'branded', 44, 3.5, 5, 1.2, 250, '1 glass', ['milk', 'dairy', 'drink']),
]

export const FOODS: FoodRecord[] = [...SG_HAWKER, ...SG_CAFE, ...GENERIC, ...BRANDED]

export const FOOD_BY_ID: Record<string, FoodRecord> = Object.fromEntries(FOODS.map(x => [x.id, x]))

export function getFoodById(id: string): FoodRecord | null {
  return FOOD_BY_ID[id] ?? null
}

/** Foods the coach can name when protein is behind pace (≥ ~20 g protein per serving, lean-leaning). */
export const HIGH_PROTEIN_IDS: string[] = [
  'chicken_breast', 'chicken_thigh', 'greek_yogurt_0', 'skyr', 'cottage_cheese', 'whey_protein', 'protein_shake_water',
  'protein_shake_milk', 'protein_bar', 'quest_bar', 'tuna_water', 'salmon_cooked', 'salmon_sashimi', 'white_fish',
  'prawns_cooked', 'beef_sirloin', 'pork_loin', 'tofu_firm', 'tempeh', 'egg_white', 'fish_soup_rice', 'fish_soup_only',
  'fish_soup_bee_hoon', 'chicken_rice_no_skin', 'steamed_chicken_hawker', 'satay_chicken', 'half_boiled_eggs',
  'grilled_chicken_salad_cafe', 'salmon_poke_bowl', 'chicken_caesar_wrap', 'subway_chicken_6', 'mixed_veg_rice_fish',
]

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%+ ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(Boolean)
}

/**
 * Case-insensitive token search over name, tags and serving label. Every query
 * token must match somewhere (exact or prefix). Ranking: exact name > name
 * starts with query > query phrase inside name > exact token hits > prefix hits
 * > tag hits, with shorter names winning ties so "Chicken rice" beats
 * "Chicken rice, roasted chicken".
 */
export function searchFoods(q: string, limit = 20): FoodRecord[] {
  const nq = normalize(q)
  const qTokens = tokens(q)
  if (!qTokens.length) return []
  const scored: { food: FoodRecord, score: number }[] = []
  for (const food of FOODS) {
    const nName = normalize(food.name)
    const nameToks = tokens(food.name)
    const tagToks = food.tags.flatMap(tokens)
    const labelToks = tokens(food.servingLabel)
    let score = 0
    let allMatched = true
    for (const qt of qTokens) {
      let best = 0
      if (nameToks.includes(qt)) best = 40
      else if (nameToks.some(t => t.startsWith(qt))) best = 20
      else if (tagToks.includes(qt)) best = 12
      else if (tagToks.some(t => t.startsWith(qt))) best = 6
      else if (labelToks.some(t => t === qt || t.startsWith(qt))) best = 4
      if (best === 0) { allMatched = false; break }
      score += best
    }
    if (!allMatched) continue
    if (nName === nq) score += 1000
    else if (nName.startsWith(nq)) score += 300
    else if ((' ' + nName + ' ').includes(' ' + nq + ' ')) score += 200
    else if (nName.includes(nq)) score += 100
    if (food.tags.includes('popular')) score += 3
    score -= nName.length * 0.5
    scored.push({ food, score })
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
  return scored.slice(0, Math.max(0, limit)).map(s => s.food)
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

function describeServing(food: FoodRecord, grams: number): string {
  const ratio = grams / food.servingG
  const nice = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 2.5, 3, 4]
  const match = nice.find(n => Math.abs(ratio - n) < 0.03)
  if (match === 1) return `${food.servingLabel} (${grams} g)`
  if (match !== undefined) return `${match} × ${food.servingLabel} (${grams} g)`
  return `${grams} g`
}

/** Scale a library food to a gram amount, ready to attach to a meal. */
export function toFoodItem(food: FoodRecord, grams: number): Omit<FoodItem, 'id' | 'mealId'> {
  const g = Math.max(0, grams)
  const k = g / 100
  const isSG = food.brandOrOrigin === 'SG hawker' || food.brandOrOrigin === 'SG cafe'
  return {
    foodName: food.name,
    quantityG: round1(g),
    servingDescription: describeServing(food, g),
    kcal: Math.round(food.per100g.kcal * k),
    proteinG: round1(food.per100g.proteinG * k),
    carbsG: round1(food.per100g.carbsG * k),
    fatG: round1(food.per100g.fatG * k),
    source: 'search',
    confidence: isSG ? 0.8 : 0.95,
    uncertaintyReason: isSG ? 'HPB-style estimate; portion varies by stall' : null,
  }
}

/** Convenience: one standard serving of a library food. */
export function servingFoodItem(food: FoodRecord): Omit<FoodItem, 'id' | 'mealId'> {
  return toFoodItem(food, food.servingG)
}

/** Macros for one standard serving. */
export function servingMacros(food: FoodRecord): Macros {
  const k = food.servingG / 100
  return {
    kcal: Math.round(food.per100g.kcal * k),
    proteinG: round1(food.per100g.proteinG * k),
    carbsG: round1(food.per100g.carbsG * k),
    fatG: round1(food.per100g.fatG * k),
  }
}

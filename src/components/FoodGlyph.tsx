import {
  Apple, Banana, Bean, Beef, Beer, CakeSlice, Carrot, Cherry, Citrus, Coffee, Cookie, Croissant, CupSoda, Drumstick, Egg, Fish,
  GlassWater, Grape, Ham, IceCreamCone, LeafyGreen, Milk, Nut, Pizza, Salad, Sandwich, Soup, Utensils, Wheat, Wine, type LucideIcon,
} from 'lucide-react'

export interface FoodGlyphProps {
  name: string
  /** Tile edge in px. */
  size?: number
}

// First match wins, so dishes and drinks sit above their ingredients ("chicken rice" → chicken, "teh" before "egg").
const RULES: [RegExp, LucideIcon][] = [
  [/kopi|coffee|latte|espresso|cappuccino|americano|mocha|\bteh\b|\btea\b|matcha|milo|chai/, Coffee],
  [/smoothie|shake|juice|soda|cola|coke|bubble tea|boba|soft drink|isotonic|bandung/, CupSoda],
  [/beer|lager|stout/, Beer],
  [/wine|cocktail|sake|whisky|whiskey|soju/, Wine],
  [/\bwater\b|sparkling/, GlassWater],
  [/ice cream|gelato|sundae|ice kachang|chendol|cendol/, IceCreamCone],
  [/cake|dessert|pudding|tart|brownie|kueh|kuih|pie\b|tau huay|muffin|donut|doughnut/, CakeSlice],
  [/cookie|biscuit|chocolate|candy|sweet\b|granola bar|protein bar|\bbar\b/, Cookie],
  [/pizza/, Pizza],
  [/burger|sandwich|wrap|toast|kaya|bagel|sub\b|panini|prata|roti|thosai|dosa|naan|chapati|tortilla|pita/, Sandwich],
  [/croissant|bread|bun\b|\bbao\b|pau\b|pastry|waffle|pancake/, Croissant],
  [/salad|slaw|poke|bowl/, Salad],
  [/soup|broth|porridge|congee|stew|curry|laksa|ramen|pho|bak kut teh|yong tau foo|steamboat|hotpot|mee soto|tom yum|miso|dal\b|dhal/, Soup],
  [/noodle|\bmee\b|\bmian\b|bee hoon|kway teow|hor fun|pasta|spaghetti|udon|soba|vermicelli|macaroni|lasagn/, Soup],
  [/chicken|duck|turkey|wing|drumstick|satay|nugget/, Drumstick],
  [/fish|salmon|tuna|cod\b|sushi|sashimi|prawn|shrimp|seafood|crab|squid|sotong|otah|mackerel|sardine|dory|barramundi/, Fish],
  [/beef|steak|lamb|mutton|rendang|brisket|meatball|patty|mince/, Beef],
  [/pork|ham\b|bacon|char siew|char siu|sausage|luncheon|bak kwa|lap cheong/, Ham],
  [/egg|omelette|omelet|frittata/, Egg],
  [/rice|nasi|biryani|briyani|oat|cereal|muesli|granola|quinoa|couscous|grain|barley|chee cheong fun|lontong|ketupat/, Wheat],
  [/milk|yogurt|yoghurt|cheese|whey|protein powder|casein|kefir|paneer|soy milk|soya/, Milk],
  [/tofu|tempeh|bean|lentil|chickpea|edamame|hummus|tau kwa|tau pok/, Bean],
  [/nut\b|nuts|almond|peanut|cashew|walnut|pistachio|seed|peanut butter/, Nut],
  [/banana/, Banana],
  [/orange|lemon|lime|grapefruit|mandarin|pomelo|citrus/, Citrus],
  [/grape|raisin/, Grape],
  [/berry|berries|cherry|strawberr|blueberr/, Cherry],
  [/apple|pear|fruit|mango|papaya|melon|pineapple|kiwi|guava|peach|plum|durian|dragon ?fruit|avocado/, Apple],
  [/carrot|potato|sweet potato|pumpkin|corn|fries|chips|wedges|root/, Carrot],
  [/vegetable|veg\b|veggies|greens|spinach|broccoli|kale|kangkong|kailan|kai lan|chye sim|cabbage|bok choy|lettuce|cucumber|tomato/, LeafyGreen],
]

export function foodIcon(name: string): LucideIcon {
  const n = name.toLowerCase()
  for (const [re, icon] of RULES) if (re.test(n)) return icon
  return Utensils
}

/** Rounded tile with a food icon picked from the meal's name; stands in when a meal has no photo. */
export function FoodGlyph({ name, size = 56 }: FoodGlyphProps) {
  const Icon = foodIcon(name)
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center border border-pillar-line bg-pillar-soft text-pillar"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.75} />
    </span>
  )
}

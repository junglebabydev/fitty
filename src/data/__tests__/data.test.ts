import { describe, it, expect } from 'vitest'
import type { SafetyTag } from '../../domain/types'
import { EXERCISES, EXERCISE_BY_ID, EXERCISE_ALIASES, CANONICAL_EXERCISE_IDS, findExerciseByAlias } from '../exercises'
import { FOODS, FOOD_BY_ID, HIGH_PROTEIN_IDS, SG_SOURCE_TAG, searchFoods, toFoodItem } from '../foods'
import { MOBILITY_ROUTINES, routinesFor } from '../mobility'

const VALID_TAGS: SafetyTag[] = [
  'knee_load', 'deep_knee_flexion', 'impact', 'spinal_load', 'spinal_flexion', 'axial_load', 'neck_load', 'overhead',
]

describe('exercises', () => {
  it('has at least 60 exercises with unique ids', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(60)
    expect(new Set(EXERCISES.map(e => e.id)).size).toBe(EXERCISES.length)
  })

  it('includes every canonical id the planner uses (no rower)', () => {
    for (const id of CANONICAL_EXERCISE_IDS) expect(EXERCISE_BY_ID[id], id).toBeDefined()
    expect(EXERCISE_BY_ID['rowing_machine_none']).toBeUndefined()
    expect(CANONICAL_EXERCISE_IDS).toContain('leg_press')
    expect(CANONICAL_EXERCISE_IDS).toContain('swim_easy')
  })

  it('every substitution resolves to a library exercise and never to itself', () => {
    for (const ex of EXERCISES) {
      expect(ex.substitutions.length, ex.id).toBeGreaterThan(0)
      for (const sub of ex.substitutions) {
        expect(EXERCISE_BY_ID[sub], `${ex.id} -> ${sub}`).toBeDefined()
        expect(sub).not.toBe(ex.id)
      }
    }
  })

  it('safety tags are valid and set for provocative patterns', () => {
    for (const ex of EXERCISES) {
      for (const t of ex.safetyTags) expect(VALID_TAGS, `${ex.id}: ${t}`).toContain(t)
      expect(new Set(ex.safetyTags).size).toBe(ex.safetyTags.length)
    }
    expect(EXERCISE_BY_ID.goblet_squat.safetyTags).toEqual(expect.arrayContaining(['knee_load', 'deep_knee_flexion']))
    expect(EXERCISE_BY_ID.db_split_squat.safetyTags).toEqual(expect.arrayContaining(['knee_load', 'deep_knee_flexion']))
    expect(EXERCISE_BY_ID.db_rdl.safetyTags).toContain('spinal_load')
    expect(EXERCISE_BY_ID.hip_thrust.safetyTags).toContain('spinal_load')
    expect(EXERCISE_BY_ID.db_shoulder_press.safetyTags).toEqual(expect.arrayContaining(['overhead', 'neck_load']))
    expect(EXERCISE_BY_ID.treadmill_jog.safetyTags).toContain('impact')
    expect(EXERCISE_BY_ID.cable_crunch.safetyTags).toContain('spinal_flexion')
    // Knee-friendly lower_a staples must not carry deep_knee_flexion so the AMBER gate keeps them.
    for (const id of ['leg_press', 'hip_thrust', 'glute_bridge', 'lying_leg_curl', 'seated_leg_curl', 'leg_extension', 'seated_calf_raise']) {
      expect(EXERCISE_BY_ID[id].safetyTags, id).not.toContain('deep_knee_flexion')
      expect(EXERCISE_BY_ID[id].safetyTags, id).not.toContain('impact')
    }
    // Safe fallbacks exist with no tags at all.
    for (const id of ['glute_bridge', 'dead_bug', 'bird_dog', 'machine_chest_press', 'seated_cable_row', 'stationary_bike', 'swim_easy']) {
      expect(EXERCISE_BY_ID[id].safetyTags, id).toEqual([])
    }
  })

  it('every substitution list leads with an option at least as safe as the exercise', () => {
    for (const ex of EXERCISES) {
      const first = EXERCISE_BY_ID[ex.substitutions[0]]
      expect(first.safetyTags.length, `${ex.id} -> ${first.id}`).toBeLessThanOrEqual(ex.safetyTags.length)
    }
  })

  it('instructions are substantive and cue knees/back/neck where relevant', () => {
    for (const ex of EXERCISES) {
      expect(ex.instructions.length, ex.id).toBeGreaterThan(120)
      expect(ex.instructions.split(/[.!?]\s/).length, ex.id).toBeGreaterThanOrEqual(2)
    }
    const knee = /knee/i, back = /back|spine|ribs/i, neck = /neck|chin|head/i
    for (const ex of EXERCISES.filter(e => e.safetyTags.some(t => t === 'knee_load' || t === 'deep_knee_flexion' || t === 'impact'))) {
      expect(ex.instructions, ex.id).toMatch(knee)
    }
    for (const ex of EXERCISES.filter(e => e.safetyTags.some(t => t === 'spinal_load' || t === 'spinal_flexion' || t === 'axial_load'))) {
      expect(ex.instructions, ex.id).toMatch(back)
    }
    for (const ex of EXERCISES.filter(e => e.safetyTags.some(t => t === 'overhead' || t === 'neck_load'))) {
      expect(ex.instructions, ex.id).toMatch(neck)
    }
  })

  it('no alias phrase is claimed by two exercises', () => {
    // findExerciseByAlias breaks score ties by library order, so a duplicate phrase
    // silently makes the later exercise unreachable by voice. One owner per phrase.
    const owners = new Map<string, string[]>()
    for (const [id, list] of Object.entries(EXERCISE_ALIASES)) {
      for (const a of list) owners.set(a, [...(owners.get(a) ?? []), id])
    }
    const clashes = [...owners.entries()].filter(([, ids]) => ids.length > 1)
    expect(clashes, `duplicate aliases: ${JSON.stringify(clashes)}`).toEqual([])
  })

  it('resolves the unqualified name to the exercise people mean by it', () => {
    expect(findExerciseByAlias('pull ups 3 sets')?.id).toBe('pull_up')
    expect(findExerciseByAlias('deadlift 100 for 5')?.id).toBe('bb_deadlift')
    expect(findExerciseByAlias('overhead press 40 kilos')?.id).toBe('bb_overhead_press')
    expect(findExerciseByAlias('barbell row 60 for 8')?.id).toBe('bb_row')
    expect(findExerciseByAlias('kettlebell swing 24 for 20')?.id).toBe('kb_swing')
  })

  it('timed flag is set for planks, carries and cardio', () => {
    for (const id of ['plank', 'side_plank', 'farmers_carry', 'stationary_bike', 'incline_walk', 'swim_freestyle', 'swim_easy']) {
      expect(EXERCISE_BY_ID[id].timed, id).toBe(true)
    }
    expect(EXERCISE_BY_ID.db_bench_press.timed).toBe(false)
  })

  it('aliases reference real exercises and the matcher resolves PRD phrases', () => {
    for (const id of Object.keys(EXERCISE_ALIASES)) expect(EXERCISE_BY_ID[id], id).toBeDefined()
    for (const ex of EXERCISES) expect(EXERCISE_ALIASES[ex.id]?.length ?? 0, ex.id).toBeGreaterThan(0)
    expect(findExerciseByAlias('Bench 70 kilos for eight, RIR two')?.id).toBe('db_bench_press')
    expect(findExerciseByAlias('Swap squats for something easier on my knee')?.id).toBe('goblet_squat')
    expect(findExerciseByAlias('lat pulldown 55 for 10')?.id).toBe('lat_pulldown')
    expect(findExerciseByAlias('incline dumbbell press 22 for 10')?.id).toBe('incline_db_press')
    expect(findExerciseByAlias('seated leg curl 40 kilos')?.id).toBe('seated_leg_curl')
    // Before the barbell pass this resolved to db_rdl, which owned 'deadlifts' only because
    // no real deadlift existed. With bb_deadlift in the library the plain word means the barbell lift.
    expect(findExerciseByAlias('did some deadlifts')?.id).toBe('bb_deadlift')
    expect(findExerciseByAlias('dumbbell rdl 20 for 12')?.id).toBe('db_rdl')
    expect(findExerciseByAlias('weight today 83.4 kilos')).toBeNull()
    expect(findExerciseByAlias('')).toBeNull()
  })
})

describe('exercises for training programmes (docs/programs/README.md)', () => {
  // The canonical new ids and their tags, exactly as the README lists them.
  const NEW_IDS: Record<string, SafetyTag[]> = {
    brisk_walk: [], easy_run: ['impact', 'knee_load'],
    breathing_360: [], pelvic_floor_hold: [], pelvic_floor_quick: [], pelvic_tilt: [], heel_slide: [], knee_fallout: [],
    clamshell: [], wall_push_up: [],
    sit_to_stand_chair: ['knee_load'], single_leg_sit_to_stand: ['knee_load'], single_leg_calf_raise: [],
    single_leg_balance: [], single_leg_squat_partial: ['knee_load'], step_up_bw: ['knee_load'],
    jog_on_spot: ['impact', 'knee_load'], forward_bound: ['impact', 'knee_load'], single_leg_hop: ['impact', 'knee_load'], running_man: [],
    march_in_place: [], step_jack: [], shadow_boxing: [], jumping_jack: ['impact', 'knee_load', 'overhead'], high_knees: ['impact', 'knee_load'],
    table_inverted_row: [], towel_door_row: [], prone_y_t_raise: [],
    db_single_leg_rdl: ['spinal_load'], db_single_leg_hip_thrust: ['spinal_load'], single_leg_hip_thrust: [], dowel_hip_hinge: [],
  }

  it('adds all 32 new ids with the README tags, and no merged duplicate', () => {
    expect(Object.keys(NEW_IDS)).toHaveLength(32)
    for (const [id, tags] of Object.entries(NEW_IDS)) {
      expect(EXERCISE_BY_ID[id], id).toBeDefined()
      expect(EXERCISE_BY_ID[id].safetyTags, id).toEqual(tags)
    }
    for (const merged of ['pram_walk', 'chair_squat', 'run_walk']) expect(EXERCISE_BY_ID[merged], merged).toBeUndefined()
  })

  it('uses the new patterns, existing equipment and the timed flag for holds, walks, runs and marches', () => {
    expect(EXERCISE_BY_ID.breathing_360.pattern).toBe('breathing')
    expect(EXERCISE_BY_ID.pelvic_floor_hold.pattern).toBe('pelvic_floor')
    expect(EXERCISE_BY_ID.pelvic_floor_quick.pattern).toBe('pelvic_floor')
    expect(EXERCISE_BY_ID.single_leg_balance.pattern).toBe('balance')
    expect(EXERCISE_BY_ID.forward_bound.pattern).toBe('plyometric')
    expect(EXERCISE_BY_ID.prone_y_t_raise.pattern).toBe('rear_delt')
    const equipment = new Set(EXERCISES.filter(e => !(e.id in NEW_IDS)).map(e => e.equipment))
    for (const id of Object.keys(NEW_IDS)) expect(equipment.has(EXERCISE_BY_ID[id].equipment), id).toBe(true)
    for (const id of ['db_single_leg_rdl', 'db_single_leg_hip_thrust']) expect(EXERCISE_BY_ID[id].equipment).toBe('dumbbell')
    const timed = ['brisk_walk', 'easy_run', 'breathing_360', 'pelvic_floor_hold', 'single_leg_balance', 'jog_on_spot',
      'march_in_place', 'step_jack', 'shadow_boxing', 'jumping_jack', 'high_knees']
    for (const id of Object.keys(NEW_IDS)) expect(EXERCISE_BY_ID[id].timed, id).toBe(timed.includes(id))
  })

  it('keeps the safety wording from the series docs', () => {
    expect(EXERCISE_BY_ID.sit_to_stand_chair.instructions).toMatch(/at or above knee height/)
    expect(EXERCISE_BY_ID.step_up_bw.instructions).toMatch(/no higher than 20 cm/)
    expect(EXERCISE_BY_ID.table_inverted_row.instructions).toMatch(/tested will not tip/)
    expect(EXERCISE_BY_ID.towel_door_row.instructions).toMatch(/^Test the handles first/)
    for (const id of ['jog_on_spot', 'forward_bound', 'single_leg_hop']) {
      expect(EXERCISE_BY_ID[id].instructions, id).toMatch(/leaking, heaviness or knee pain/)
    }
    expect(EXERCISE_BY_ID.easy_run.instructions).toMatch(/slow to a walk whenever you cannot talk/)
  })

  it('applies the README fixes to existing entries', () => {
    expect(EXERCISE_BY_ID.ski_erg.safetyTags).toContain('overhead')
    expect(EXERCISE_BY_ID.wall_sit.instructions).toMatch(/thighs above parallel/)
    expect(EXERCISE_BY_ID.wall_sit.safetyTags).not.toContain('deep_knee_flexion')
    const chain = EXERCISE_BY_ID.db_shoulder_press.substitutions
    const firstRaise = chain.findIndex(id => /raise/.test(id))
    expect(chain.indexOf('incline_db_press')).toBeGreaterThanOrEqual(0)
    expect(chain.indexOf('incline_db_press')).toBeLessThan(firstRaise)
  })

  it('reaches the new moves by voice', () => {
    expect(findExerciseByAlias('clamshells 15 each side')?.id).toBe('clamshell')
    expect(findExerciseByAlias('side lying leg raise 12')?.id).toBe('side_lying_hip_abduction')
    expect(findExerciseByAlias('brisk walk 20 minutes')?.id).toBe('brisk_walk')
    expect(findExerciseByAlias('jumping jacks 30 seconds')?.id).toBe('jumping_jack')
    expect(findExerciseByAlias('sit to stand 10 reps')?.id).toBe('sit_to_stand_chair')
    expect(findExerciseByAlias('single leg hip thrust 12')?.id).toBe('single_leg_hip_thrust')
    expect(findExerciseByAlias('hip thrust 40 for 10')?.id).toBe('hip_thrust')
    expect(findExerciseByAlias('walk 30 minutes')?.id).toBe('treadmill_walk')
    expect(findExerciseByAlias('run 5k')?.id).toBe('treadmill_jog')
  })
})

describe('foods', () => {
  it('has at least 120 foods with unique ids and sane numbers', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(120)
    expect(new Set(FOODS.map(x => x.id)).size).toBe(FOODS.length)
    for (const food of FOODS) {
      const m = food.per100g
      expect(m.kcal, food.id).toBeGreaterThanOrEqual(0)
      expect(m.kcal, food.id).toBeLessThanOrEqual(900)
      expect(m.proteinG + m.carbsG + m.fatG, food.id).toBeLessThanOrEqual(101)
      expect(food.servingG, food.id).toBeGreaterThan(0)
      expect(food.servingLabel.length, food.id).toBeGreaterThan(0)
      // Macro-derived energy should be within tolerance of stated kcal (alcohol excluded).
      if (!food.tags.includes('alcohol')) {
        const fromMacros = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9
        expect(Math.abs(fromMacros - m.kcal), `${food.id}: ${fromMacros} vs ${m.kcal}`).toBeLessThanOrEqual(Math.max(12, m.kcal * 0.2))
      }
    }
  })

  it('covers the required Singapore and generic staples', () => {
    const need = [
      'chicken_rice', 'nasi_lemak_wing', 'laksa', 'mee_goreng', 'char_kway_teow', 'hokkien_mee', 'bak_chor_mee_dry',
      'fish_soup_rice', 'yong_tau_foo_soup', 'economy_rice_1meat_2veg', 'roti_prata_plain', 'thosai_plain', 'kaya_toast_set',
      'kopi', 'kopi_o', 'kopi_c', 'kopi_siew_dai', 'kopi_o_kosong', 'teh', 'teh_o', 'teh_c', 'teh_siew_dai', 'teh_o_kosong',
      'soya_milk_sweet', 'chicken_briyani', 'wanton_mee_dry', 'ban_mian_soup', 'mixed_veg_rice_fish', 'chwee_kueh', 'carrot_cake_white',
      'egg_whole', 'chicken_breast', 'chicken_thigh', 'salmon_cooked', 'tuna_water', 'beef_sirloin', 'tofu_firm', 'tempeh',
      'rice_white', 'oats_dry', 'bread_white', 'sweet_potato', 'broccoli', 'spinach', 'banana', 'apple', 'greek_yogurt',
      'whey_protein', 'milk_whole', 'oat_milk', 'peanut_butter', 'almonds', 'olive_oil', 'protein_bar', 'snickers', 'coke',
      'beer_lager', 'wine_red', 'latte', 'flat_white', 'black_coffee', 'protein_shake_water',
    ]
    for (const id of need) expect(FOOD_BY_ID[id], id).toBeDefined()
  })

  it('Singapore data carries the HPB-style estimate tag; generic does not', () => {
    for (const food of FOODS) {
      const isSG = food.brandOrOrigin === 'SG hawker' || food.brandOrOrigin === 'SG cafe'
      expect(food.tags.includes(SG_SOURCE_TAG), food.id).toBe(isSG)
    }
  })

  it('anchor values are realistic', () => {
    const plate = toFoodItem(FOOD_BY_ID.chicken_rice, 400)
    expect(plate.kcal).toBeGreaterThanOrEqual(560)
    expect(plate.kcal).toBeLessThanOrEqual(640)
    expect(plate.proteinG).toBeGreaterThanOrEqual(23)
    expect(plate.proteinG).toBeLessThanOrEqual(28)

    const kopiO = toFoodItem(FOOD_BY_ID.kopi_o_kosong, FOOD_BY_ID.kopi_o_kosong.servingG)
    expect(kopiO.kcal).toBeGreaterThanOrEqual(3)
    expect(kopiO.kcal).toBeLessThanOrEqual(8)

    const kaya = toFoodItem(FOOD_BY_ID.kaya_toast_set, FOOD_BY_ID.kaya_toast_set.servingG)
    expect(kaya.kcal).toBeGreaterThanOrEqual(440)
    expect(kaya.kcal).toBeLessThanOrEqual(500)
    expect(kaya.proteinG).toBeGreaterThanOrEqual(18)

    const egg = toFoodItem(FOOD_BY_ID.egg_whole, 50)
    expect(egg.kcal).toBeGreaterThanOrEqual(65)
    expect(egg.kcal).toBeLessThanOrEqual(80)
    const breast = toFoodItem(FOOD_BY_ID.chicken_breast, 100)
    expect(breast.proteinG).toBeGreaterThanOrEqual(28)
  })

  it("searchFoods('chicken rice') returns chicken rice first and is case-insensitive", () => {
    const res = searchFoods('chicken rice')
    expect(res.length).toBeGreaterThan(1)
    expect(res[0].id).toBe('chicken_rice')
    expect(searchFoods('CHICKEN RICE')[0].id).toBe('chicken_rice')
    expect(searchFoods('kopi o kosong')[0].id).toBe('kopi_o_kosong')
    expect(searchFoods('kaya toast')[0].id).toMatch(/kaya/)
    expect(searchFoods('greek yog')[0].id).toMatch(/greek_yogurt/)
    expect(searchFoods('fish soup').map(x => x.id)).toContain('fish_soup_rice')
    expect(searchFoods('zzzz-nothing')).toEqual([])
    expect(searchFoods('')).toEqual([])
    expect(searchFoods('rice', 5).length).toBe(5)
  })

  it('toFoodItem scales macros linearly and rounds sensibly', () => {
    const food = FOOD_BY_ID.chicken_breast
    const a = toFoodItem(food, 100)
    const b = toFoodItem(food, 200)
    const c = toFoodItem(food, 50)
    expect(a.kcal).toBe(165)
    expect(a.proteinG).toBe(31)
    expect(b.kcal).toBe(330)
    expect(b.proteinG).toBe(62)
    expect(b.fatG).toBeCloseTo(7.2, 1)
    expect(c.kcal).toBe(83)
    expect(c.proteinG).toBe(15.5)
    expect(a.quantityG).toBe(100)
    expect(a.source).toBe('search')
    expect(a.foodName).toBe(food.name)
    expect(toFoodItem(food, 150).servingDescription).toContain('1 breast')
    expect(toFoodItem(food, 300).servingDescription).toContain('2 ×')
    expect(toFoodItem(food, 137).servingDescription).toBe('137 g')
    expect(toFoodItem(food, -20).kcal).toBe(0)
    const sg = toFoodItem(FOOD_BY_ID.laksa, 250)
    expect(sg.uncertaintyReason).toMatch(/HPB/)
    expect(a.uncertaintyReason).toBeNull()
  })

  it('HIGH_PROTEIN_IDS resolve and really are high protein', () => {
    expect(HIGH_PROTEIN_IDS.length).toBeGreaterThanOrEqual(10)
    for (const id of HIGH_PROTEIN_IDS) {
      const food = FOOD_BY_ID[id]
      expect(food, id).toBeDefined()
      const perServing = food.per100g.proteinG * food.servingG / 100
      expect(perServing, id).toBeGreaterThanOrEqual(10)
    }
  })
})

describe('mobility', () => {
  it('has at least 8 routines with unique ids and complete movements', () => {
    expect(MOBILITY_ROUTINES.length).toBeGreaterThanOrEqual(8)
    expect(new Set(MOBILITY_ROUTINES.map(r => r.id)).size).toBe(MOBILITY_ROUTINES.length)
    for (const r of MOBILITY_ROUTINES) {
      expect(r.movements.length, r.id).toBeGreaterThanOrEqual(4)
      expect(r.regions.length, r.id).toBeGreaterThan(0)
      expect(r.context.length, r.id).toBeGreaterThan(0)
      expect(r.durationMin, r.id).toBeGreaterThan(0)
      expect(r.safetyNote.length, r.id).toBeGreaterThan(40)
      for (const m of r.movements) {
        expect(m.name.length, `${r.id}: ${m.name}`).toBeGreaterThan(0)
        expect(m.cue.length, `${r.id}: ${m.name}`).toBeGreaterThan(20)
        expect((m.durationSec ?? 0) > 0 || (m.reps ?? 0) > 0, `${r.id}: ${m.name}`).toBe(true)
      }
    }
  })

  it('avoids provocative movements by name', () => {
    const banned = /deep squat|pistol|jump|burpee|sit-up|situp|neck bridge|plow|headstand|toe touch/i
    for (const r of MOBILITY_ROUTINES) for (const m of r.movements) expect(m.name, `${r.id}: ${m.name}`).not.toMatch(banned)
  })

  it('routinesFor covers every context and filters by region', () => {
    expect(routinesFor('pre_lower').length).toBeGreaterThan(0)
    expect(routinesFor('pre_upper').length).toBeGreaterThan(0)
    expect(routinesFor('post').length).toBeGreaterThan(0)
    expect(routinesFor('recovery').length).toBeGreaterThan(0)
    expect(routinesFor('anytime').length).toBeGreaterThan(0)
    for (const r of routinesFor('pre_lower')) expect(r.context).toContain('pre_lower')
    const hips = routinesFor('pre_lower', ['hips'])
    expect(hips.length).toBeGreaterThan(0)
    for (const r of hips) expect(r.regions).toContain('hips')
    const neck = routinesFor('anytime', ['neck'])
    expect(neck.length).toBeGreaterThan(0)
    expect(neck[0].regions).toContain('neck')
    expect(routinesFor('pre_lower', ['neck'])).toEqual([])
  })
})

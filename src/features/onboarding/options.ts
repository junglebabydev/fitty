// Option lists for the intake conversation. Pure data: icons are attached in steps.tsx.
import { PREFERENCE_OPTIONS } from '../settings/options'

export interface Opt<T extends string | number = string> {
  value: T
  label: string
  /** One short line under the label on option cards. */
  sub?: string
}

export type PrimaryGoal = 'lose_fat' | 'build_muscle' | 'get_fitter' | 'feel_better' | 'move_pain_free'
export const GOAL_OPTIONS: Opt<PrimaryGoal>[] = [
  { value: 'lose_fat', label: 'Lose fat' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'get_fitter', label: 'Get fitter' },
  { value: 'feel_better', label: 'Feel better' },
  { value: 'move_pain_free', label: 'Move without pain' },
]

export type RecentSessions = '0' | '1-2' | '3-4' | '5+'
export const RECENT_SESSION_OPTIONS: Opt<RecentSessions>[] = [
  { value: '0', label: '0', sub: 'Starting fresh' },
  { value: '1-2', label: '1–2', sub: 'On and off' },
  { value: '3-4', label: '3–4', sub: 'A steady habit' },
  { value: '5+', label: '5+', sub: 'Most days' },
]

export const MINUTES_OPTIONS: Opt<number>[] = [
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 45, label: '45' },
  { value: 60, label: '60' },
  { value: 75, label: '75+' },
]

/** Existing preference values first (the planner knows them); the rest are context for the coach. */
export const ENJOY_OPTIONS: Opt[] = [
  ...PREFERENCE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  { value: 'cycling', label: 'Cycling' },
  { value: 'walking', label: 'Walking' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'sports', label: 'Sports' },
  { value: 'classes', label: 'Classes' },
]

export const AGGRAVATOR_OPTIONS: string[] = ['Stairs', 'Deep squats', 'Running', 'Jumping', 'Long sitting', 'Bending', 'Overhead lifting', 'Twisting', 'Heavy loads', 'Desk work']

export const FOOD_OPTIONS: Opt[] = [
  { value: 'sg_hawker', label: 'SG hawker' },
  { value: 'home_cooked', label: 'Home-cooked' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'meal_prep', label: 'Meal prep' },
  { value: 'canteen', label: 'Work canteen' },
  { value: 'fast_food', label: 'Fast food' },
  { value: 'vegetarian', label: 'Mostly vegetarian' },
]

export type Alcohol = 'never' | 'rarely' | 'weekly' | 'most_days'
export const ALCOHOL_OPTIONS: Opt<Alcohol>[] = [
  { value: 'never', label: 'Never' },
  { value: 'rarely', label: 'Rarely', sub: 'A few times a month' },
  { value: 'weekly', label: 'Weekly', sub: 'Weekends, mostly' },
  { value: 'most_days', label: 'Most days' },
]

export type Caffeine = 'none' | '1-2' | '3+'
export const CAFFEINE_OPTIONS: Opt<Caffeine>[] = [
  { value: 'none', label: 'None' },
  { value: '1-2', label: '1–2 cups' },
  { value: '3+', label: '3 or more' },
]

export const SUPPLEMENT_SUGGESTIONS: string[] = ['Whey', 'Creatine', 'Vitamin D', 'Omega-3', 'Magnesium', 'Multivitamin']

export type Bedtime = 'consistent' | 'varies' | 'irregular'
export const BEDTIME_OPTIONS: Opt<Bedtime>[] = [
  { value: 'consistent', label: 'Same time', sub: 'Within half an hour' },
  { value: 'varies', label: 'Varies', sub: 'An hour or two' },
  { value: 'irregular', label: 'All over', sub: 'No real pattern' },
]

export const WORKED_OPTIONS: string[] = ['A fixed routine', 'Training with someone', 'Tracking food', 'Short sessions', 'A coach or class', 'Meal prep', 'Daily walks', 'Morning training']
export const NOT_WORKED_OPTIONS: string[] = ['Strict diets', 'Long sessions', 'Training through pain', 'Too much at once', 'Counting every calorie', 'Early mornings', 'Going it alone', 'All-or-nothing weeks']

export function optLabel<T extends string | number>(options: Opt<T>[], value: T | null | undefined): string | null {
  if (value == null) return null
  return options.find((o) => o.value === value)?.label ?? String(value)
}

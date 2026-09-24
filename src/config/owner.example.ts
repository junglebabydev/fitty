// Fictional example. Copy to ./owner.local.ts (git-ignored) and put the real values there — never here.
import type { OwnerSetup } from './owner'

export const OWNER: OwnerSetup = {
  name: 'Sam',
  dob: '1990-01-15',
  sex: 'other',
  units: 'metric',
  heightCm: 172,
  weightKg: 75,
  waistCm: 84,
  targetWeightKg: 70,
  targetWaistCm: null,
  horizonMonths: 6,
  activity: 'moderate',
  daysMin: 3,
  daysTarget: 4,
  daysStretch: 5,
  experience: 'intermediate',
  coachStyle: 'demanding',
  preferences: ['weights'],
  equipment: ['dumbbells', 'bench', 'bodyweight'],
  mobility: ['hips', 'shoulders'],
  conditions: [{ region: 'shoulder', label: 'Shoulder' }],
  diet: { mealsPerDay: 3, skipsBreakfast: false, coffee: true, supplements: false, notes: '' },
}

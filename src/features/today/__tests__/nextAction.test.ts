import { describe, expect, it } from 'vitest'
import { nextAction, type NextActionInput } from '../nextAction'

const base: NextActionInput = {
  hour: 14, sessionStatus: 'planned', blocked: false, canShorten: true, checkedIn: true,
  mealsToday: 2, proteinG: 80, proteinExpectedG: 70, moodLogged: true,
}
const kind = (p: Partial<NextActionInput>) => nextAction({ ...base, ...p }).kind

describe('nextAction', () => {
  it('continues a session in progress before anything else', () => {
    expect(kind({ sessionStatus: 'in_progress', hour: 22, blocked: true })).toBe('continue_workout')
  })
  it('starts the planned session, short version late in the evening', () => {
    expect(kind({})).toBe('start_workout')
    expect(kind({ hour: 20 })).toBe('start_short')
    expect(kind({ hour: 21, canShorten: false })).toBe('start_workout')
  })
  it('asks for the morning check-in first', () => {
    expect(kind({ hour: 8, checkedIn: false })).toBe('morning_check_in')
    expect(kind({ hour: 15, checkedIn: false })).toBe('start_workout')
  })
  it('never pushes a session on a RED day', () => {
    expect(kind({ blocked: true })).toBe('mobility')
    expect(kind({ blocked: true, checkedIn: false })).toBe('morning_check_in')
    expect(kind({ blocked: true, hour: 21 })).toBe('mobility')
  })
  it('without a session: wind down late, else food, else mood', () => {
    expect(kind({ sessionStatus: 'completed', hour: 21 })).toBe('wind_down')
    expect(kind({ sessionStatus: null, mealsToday: 0 })).toBe('log_meal')
    expect(kind({ sessionStatus: null, proteinG: 20, proteinExpectedG: 70 })).toBe('log_meal')
    expect(kind({ sessionStatus: 'skipped', moodLogged: false })).toBe('mood_check_in')
    expect(kind({ sessionStatus: null })).toBe('log_meal')
  })
})

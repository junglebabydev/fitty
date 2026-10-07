import { describe, expect, it } from 'vitest'
import { autoBlock, restWord, startWord } from '../autoRun'

describe('autoRun', () => {
  it('runs interval entries and circuit stations on their own, nothing else', () => {
    expect(autoBlock({ restExerciseId: 'stationary_bike' }, 1)).toBe('i:1')
    expect(autoBlock({ circuit: 'c2' }, 4)).toBe('c:c2')
    expect(autoBlock({ circuit: 'c2' }, 5)).toBe('c:c2')
    expect(autoBlock({}, 0)).toBeNull()
  })

  it('says go, then last round, or the station name in a circuit', () => {
    expect(startWord({ sets: 8 }, 1, 'Bike Intervals')).toBe('Go')
    expect(startWord({ sets: 8 }, 8, 'Bike Intervals')).toBe('Last round')
    expect(startWord({ sets: 1 }, 1, 'Bike Intervals')).toBe('Go')
    expect(startWord({ sets: 3, circuit: 'c0' }, 2, 'Cobra Pose')).toBe('Cobra Pose')
  })

  it('calls an interval rest easy, and a circuit rest by what comes next', () => {
    expect(restWord({ restExerciseId: 'stationary_bike' }, 'Zone 2 Cardio')).toBe('Easy')
    expect(restWord({ circuit: 'c0' }, 'Cobra Pose')).toBe('Next, Cobra Pose')
    expect(restWord({ circuit: 'c0' }, null)).toBe('Rest')
  })
})

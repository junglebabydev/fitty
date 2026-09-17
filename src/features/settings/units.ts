// Unit conversion + display helpers. Everything is stored metric (kg, cm);
// imperial is a display/entry convenience only.
import type { Units } from '../../domain/types'

export const KG_PER_LB = 0.45359237
export const CM_PER_IN = 2.54

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN
}

export function inToCm(inch: number): number {
  return inch * CM_PER_IN
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = cm / CM_PER_IN
  let ft = Math.floor(totalIn / 12)
  let inch = Math.round(totalIn - ft * 12)
  if (inch === 12) {
    ft += 1
    inch = 0
  }
  return { ft, inch }
}

export function ftInToCm(ft: number, inch: number): number {
  return round1((ft * 12 + inch) * CM_PER_IN)
}

export function fmtHeight(cm: number, units: Units): string {
  if (units === 'imperial') {
    const { ft, inch } = cmToFtIn(cm)
    return `${ft}′${inch}″`
  }
  return `${Math.round(cm)} cm`
}

export function fmtWeight(kg: number, units: Units, digits = 1): string {
  return units === 'imperial' ? `${kgToLb(kg).toFixed(digits)} lb` : `${kg.toFixed(digits)} kg`
}

/** Waist and other short lengths: cm or inches. */
export function fmtLength(cm: number, units: Units): string {
  return units === 'imperial' ? `${cmToIn(cm).toFixed(1)} in` : `${Math.round(cm)} cm`
}

export function weightUnit(units: Units): string {
  return units === 'imperial' ? 'lb' : 'kg'
}

export function lengthUnit(units: Units): string {
  return units === 'imperial' ? 'in' : 'cm'
}

/** Weight as shown in the user's unit (rounded for display / input). */
export function displayWeight(kg: number | null, units: Units): number | null {
  if (kg == null) return null
  return round1(units === 'imperial' ? kgToLb(kg) : kg)
}

/** Parses a weight typed in the user's unit back to kg (2-decimal precision so round-trips are stable). */
export function parseWeight(value: number | null, units: Units): number | null {
  if (value == null) return null
  const kg = units === 'imperial' ? lbToKg(value) : value
  return Math.round(kg * 100) / 100
}

export function displayLength(cm: number | null, units: Units): number | null {
  if (cm == null) return null
  return round1(units === 'imperial' ? cmToIn(cm) : cm)
}

export function parseLength(value: number | null, units: Units): number | null {
  if (value == null) return null
  const cm = units === 'imperial' ? inToCm(value) : value
  return Math.round(cm * 100) / 100
}

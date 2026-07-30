import { describe, it, expect } from 'vitest'
import { snapToIncrement } from './snap'

describe('snapToIncrement', () => {
  it('passes value through unchanged when increment is 0', () => {
    expect(snapToIncrement(3.14159, 0)).toBe(3.14159)
    expect(snapToIncrement(-2.71828, 0)).toBe(-2.71828)
    expect(snapToIncrement(0, 0)).toBe(0)
  })

  it('rounds to nearest multiple of increment (positive values)', () => {
    expect(snapToIncrement(0.3, 0.5)).toBe(0.5)
    expect(snapToIncrement(0.24, 0.5)).toBe(0)
    expect(snapToIncrement(1.2, 0.5)).toBe(1)
    expect(snapToIncrement(0.75, 0.25)).toBe(0.75)
    expect(snapToIncrement(0.12, 0.25)).toBe(0)
    expect(snapToIncrement(2.6, 1)).toBe(3)
    expect(snapToIncrement(2.4, 1)).toBe(2)
  })

  it('handles negative values correctly', () => {
    expect(snapToIncrement(-0.3, 0.5)).toBe(-0.5)
    expect(snapToIncrement(-0.24, 0.5)).toBe(0)
    expect(snapToIncrement(-2.6, 1)).toBe(-3)
    expect(snapToIncrement(-2.4, 1)).toBe(-2)
  })

  it('returns 0 for value 0 regardless of increment', () => {
    expect(snapToIncrement(0, 0.5)).toBe(0)
    expect(snapToIncrement(0, 1)).toBe(0)
    expect(snapToIncrement(0, 2)).toBe(0)
  })
})
